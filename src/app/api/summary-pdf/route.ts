// ============================================================
// POST /api/summary-pdf
// Body: { locationId, userId, month: "YYYY-MM" }
// Generuje PDF podsumowania miesiąca i zwraca jako blob
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { SummaryPDF, type SummaryData } from '@/lib/summary/SummaryPDF'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    const body = await req.json()
    const { locationId, userId, month } = body

    if (!locationId || !userId || !month) {
      return NextResponse.json({ error: 'Missing required fields: locationId, userId, month' }, { status: 400 })
    }

    // Parse month range
    const [year, mon] = month.split('-').map(Number)
    const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
    const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`

    // Get location name
    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single()
    const locationName = location?.name || 'KitchenOps'

    // Get user name
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
    const userName = userProfile?.full_name || '?'

    // Month label in Polish
    const MONTHS_PL = [
      'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
      'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien',
    ]
    const monthLabel = `${MONTHS_PL[mon - 1]} ${year}`

    // ── Worker hours from clock_logs ──
    const { data: clockLogs } = await supabase
      .from('clock_logs')
      .select('worker_id, hours_worked')
      .eq('location_id', locationId)
      .gte('clock_date', monthStart)
      .lt('clock_date', nextMonth)
      .not('hours_worked', 'is', null)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, hourly_rate, contract_type')
      .eq('location_id', locationId)
      .eq('is_active', true)

    const hoursMap: Record<string, number> = {}
    if (clockLogs) {
      clockLogs.forEach((c: any) => {
        if (c.worker_id) hoursMap[c.worker_id] = (hoursMap[c.worker_id] || 0) + (c.hours_worked || 0)
      })
    }

    const workerHours = Object.entries(hoursMap).map(([id, hours]) => {
      const profile = profiles?.find((p: any) => p.id === id)
      const name = profile?.full_name || '?'
      const rate = profile?.hourly_rate ?? 29
      const contract = profile?.contract_type || 'zlecenie'
      return {
        name,
        hours: Math.round(hours * 10) / 10,
        rate,
        cost: Math.round(hours * rate),
        contract,
      }
    }).sort((a, b) => b.hours - a.hours)

    // ── Issues ──
    const { data: issues } = await supabase
      .from('issues')
      .select('title, status, created_at')
      .eq('location_id', locationId)
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth)
      .order('created_at', { ascending: false })

    // ── Losses ──
    const { data: losses } = await supabase
      .from('waste_logs')
      .select('item_name, quantity, estimated_value, created_at')
      .eq('location_id', locationId)
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth)
      .order('created_at', { ascending: false })

    // ── Stats ──
    const { count: totalMeals } = await supabase
      .from('worker_meals')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', locationId)
      .gte('meal_date', monthStart)
      .lt('meal_date', nextMonth)

    const { count: totalShifts } = await supabase
      .from('schedule_shifts')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', locationId)
      .gte('shift_date', monthStart)
      .lt('shift_date', nextMonth)

    // ── Build data ──
    const summaryData: SummaryData = {
      locationName,
      monthLabel,
      generatedBy: userName,
      generatedAt: new Date().toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      workerHours,
      issues: issues || [],
      losses: losses || [],
      stats: {
        totalMeals: totalMeals || 0,
        totalShifts: totalShifts || 0,
        totalIssues: (issues || []).length,
        totalLosses: (losses || []).length,
      },
    }

    // ── Render PDF ──
    const buffer = await renderToBuffer(
      React.createElement(SummaryPDF, { data: summaryData })
    )

    const filename = `Podsumowanie_${monthLabel.replace(' ', '_')}_${locationName.replace(/\s+/g, '_')}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    console.error('[summary-pdf] Error:', err)
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
