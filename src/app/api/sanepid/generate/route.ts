// ============================================================
// POST /api/sanepid/generate
// Body: { fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD", userId: uuid, locationId: uuid }
// Generuje raport HACCP jako PDF i zwraca link (+ zapisuje w sanepid_reports)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { SanepidPDF } from '@/lib/sanepid/SanepidPDF'
import { analyzeCompliance, type SanepidData } from '@/lib/sanepid/compliance'

// Wymusza Node runtime (react-pdf nie działa w edge)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Service-role client — tworzony lazy wewnątrz handlera, żeby build Next.js
    // nie próbował go instancjonować podczas "Collecting page data"
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server misconfigured: missing Supabase credentials' },
        { status: 500 }
      )
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    const body = await req.json()
    const { fromDate, toDate, userId, locationId } = body

    if (!fromDate || !toDate || !userId || !locationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ─── 1. Pobierz dane LOKAL + USER ────────────────────────────────
    const [{ data: location }, { data: userProfile }] = await Promise.all([
      supabaseAdmin.from('locations').select('id, name').eq('id', locationId).single(),
      supabaseAdmin.from('profiles').select('id, full_name').eq('id', userId).single(),
    ])
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

    // ─── 2. Pobierz dane TEMPERATUR ────────────────────────────────
    const { data: tempLogs } = await supabaseAdmin
      .from('temperature_logs')
      .select('id, log_date:record_date, record_time, shift_type')
      .eq('location_id', locationId)
      .gte('record_date', fromDate)
      .lte('record_date', toDate)
      .order('record_date')

    const tempLogIds = (tempLogs || []).map(l => l.id)
    const { data: tempReadingsRaw } = tempLogIds.length > 0 ? await supabaseAdmin
      .from('temperature_readings')
      .select('log_id, unit_id, temperature, is_ok, is_out_of_range, corrective_action, comment, cooling_units(name, unit_type, temp_min, temp_max)')
      .in('log_id', tempLogIds)
      .order('created_at') : { data: [] }

    // Zmapuj z log_id na log_date + shift_type
    const logMap = new Map<string, any>()
    ;(tempLogs || []).forEach(l => logMap.set(l.id, l))

    const tempReadings = (tempReadingsRaw || []).map((r: any) => {
      const log = logMap.get(r.log_id)
      const unit = r.cooling_units || {}
      return {
        log_id: r.log_id,
        unit_name: unit.name || 'Nieznane',
        unit_type: unit.unit_type || null,
        temperature: Number(r.temperature),
        temp_min: unit.temp_min != null ? Number(unit.temp_min) : null,
        temp_max: unit.temp_max != null ? Number(unit.temp_max) : null,
        is_ok: !!r.is_ok,
        is_out_of_range: !!r.is_out_of_range,
        corrective_action: r.corrective_action || null,
        log_date: log?.log_date || '',
        shift_type: log?.shift_type || null,
      }
    })

    // ─── 3. Pobierz dane CZYSTOŚCI ───────────────────────────────
    const { data: cleaningLogs } = await supabaseAdmin
      .from('cleaning_logs')
      .select('id, log_date, week_number, status')
      .eq('location_id', locationId)
      .gte('log_date', fromDate)
      .lte('log_date', toDate)
      .order('log_date')

    const cleaningLogIds = (cleaningLogs || []).map(l => l.id)
    const { data: cleaningEntriesRaw } = cleaningLogIds.length > 0 ? await supabaseAdmin
      .from('cleaning_entries')
      .select('log_id, is_completed, completed_at, comment, cleaning_tasks(name, category)')
      .in('log_id', cleaningLogIds) : { data: [] }

    const cleaningLogMap = new Map<string, any>()
    ;(cleaningLogs || []).forEach(l => cleaningLogMap.set(l.id, l))

    const cleaningEntries = (cleaningEntriesRaw || []).map((e: any) => {
      const log = cleaningLogMap.get(e.log_id)
      const task = e.cleaning_tasks || {}
      return {
        log_id: e.log_id,
        task_name: task.name || 'Nieznane',
        task_category: task.category || null,
        is_completed: !!e.is_completed,
        completed_at: e.completed_at || null,
        log_date: log?.log_date || '',
      }
    })

    // ─── 4. Pobierz STRATY ───────────────────────────────────────
    const { data: losses } = await supabaseAdmin
      .from('worker_losses')
      .select('created_at, reporter_name, product_name, product_category, quantity, unit, reason, estimated_value, fault_person_name')
      .eq('location_id', locationId)
      .gte('created_at', fromDate)
      .lte('created_at', toDate + 'T23:59:59')
      .order('created_at')

    // ─── 5. Złóż SanepidData ─────────────────────────────────────
    const sanepidData: SanepidData = {
      fromDate,
      toDate,
      locationName: location.name,
      tempLogs: (tempLogs || []).map(l => ({
        log_date: l.log_date,
        record_time: l.record_time,
        shift_type: l.shift_type,
      })),
      tempReadings,
      cleaningLogs: (cleaningLogs || []).map(l => ({
        log_date: l.log_date,
        week_number: l.week_number,
        status: l.status,
      })),
      cleaningEntries,
      losses: (losses || []).map((l: any) => ({
        created_at: l.created_at,
        reporter_name: l.reporter_name,
        product_name: l.product_name,
        product_category: l.product_category,
        quantity: Number(l.quantity || 0),
        unit: l.unit,
        reason: l.reason,
        estimated_value: l.estimated_value != null ? Number(l.estimated_value) : null,
        fault_person_name: l.fault_person_name,
      })),
    }

    // ─── 6. Analiza compliance ──────────────────────────────────
    const compliance = analyzeCompliance(sanepidData)

    // ─── 7. Generuj PDF ─────────────────────────────────────────
    const now = new Date()
    const reportId = 'SAN-' +
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0')

    const pdfBuffer = await renderToBuffer(
      React.createElement(SanepidPDF, {
        data: sanepidData,
        compliance,
        reportId,
        generatedAt: now.toISOString(),
        generatedByName: userProfile?.full_name || 'Nieznany',
      }) as any
    )

    // ─── 8. Upload do Supabase Storage ──────────────────────────
    const fileName = `${reportId}_${location.name.replace(/[^a-z0-9]/gi, '_')}_${fromDate}_${toDate}.pdf`
    const storagePath = `sanepid/${locationId}/${fileName}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('reports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('reports')
      .getPublicUrl(storagePath)

    // ─── 9. Zapisz meta do sanepid_reports ──────────────────────
    const { data: savedReport, error: insertError } = await supabaseAdmin
      .from('sanepid_reports')
      .insert({
        location_id: locationId,
        generated_by: userId,
        report_id: reportId,
        from_date: fromDate,
        to_date: toDate,
        file_name: fileName,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        file_size: pdfBuffer.length,
        overall_status: compliance.overall,
        temp_status: compliance.temp.status,
        cleaning_status: compliance.cleaning.status,
        metrics: {
          temp: compliance.temp,
          cleaning: compliance.cleaning,
          losses: compliance.losses,
          daysInRange: compliance.daysInRange,
        },
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      // PDF jest w Storage, nawet jak meta się nie zapisała
    }

    return NextResponse.json({
      success: true,
      reportId,
      fileName,
      url: urlData.publicUrl,
      storagePath,
      compliance,
      report: savedReport,
    })

  } catch (err: any) {
    console.error('Sanepid generate error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
