// ============================================================
// POST /api/schedule/generate
// Body: { locationId, month: "YYYY-MM", userId }
// Auto-generuje grafik na miesiąc na podstawie:
//   - schedule_settings (min_kitchen, min_hall, open_days, godziny)
//   - worker_availability (urlopy, preferencje)
//   - schedule_constraints (prefer/avoid pairings)
//   - profiles (aktywni pracownicy z departmentem)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Worker {
  id: string
  full_name: string
  role: string
  department: 'kitchen' | 'hall'
}

interface Availability {
  profile_id: string
  date_from: string
  date_to: string
  availability_type: string
  approved: boolean
}

interface Constraint {
  worker_a_id: string
  worker_b_id: string
  constraint_type: 'prefer' | 'avoid'
}

interface GeneratedShift {
  location_id: string
  worker_id: string
  shift_date: string
  department: string
  start_time: string
  end_time: string
  status: string
  schedule_month: string
}

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
    const { locationId, month, userId } = body

    if (!locationId || !month || !userId) {
      return NextResponse.json({ error: 'Missing: locationId, month, userId' }, { status: 400 })
    }

    const [year, mon] = month.split('-').map(Number)
    const scheduleMonth = `${year}-${String(mon).padStart(2, '0')}-01`

    // ── 1. Load settings ──
    const { data: settings } = await supabase
      .from('schedule_settings')
      .select('*')
      .eq('location_id', locationId)
      .single()

    const minKitchen = settings?.min_kitchen || 2
    const minHall = settings?.min_hall || 1
    const openDays = settings?.open_days || [1, 2, 3, 4, 5, 6, 0] // all days by default
    const defaultStart = settings?.worker_start || '11:30'
    const defaultEnd = settings?.worker_end || '20:30'

    // ── 2. Load workers ──
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('location_id', locationId)
      .eq('is_active', true)

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ error: 'Brak aktywnych pracownikow' }, { status: 400 })
    }

    // Assign department based on role
    const workers: Worker[] = profiles.map(p => ({
      id: p.id,
      full_name: p.full_name,
      role: p.role,
      department: (p.role === 'hall' ? 'hall' : 'kitchen') as 'kitchen' | 'hall',
    }))

    const kitchenWorkers = workers.filter(w => w.department === 'kitchen')
    const hallWorkers = workers.filter(w => w.department === 'hall')

    // ── 3. Load availability ──
    const monthEnd = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`
    const { data: availData } = await supabase
      .from('worker_availability')
      .select('profile_id, date_from, date_to, availability_type, approved')
      .eq('location_id', locationId)
      .gte('date_to', scheduleMonth)
      .lt('date_from', monthEnd)

    const availability: Availability[] = availData || []

    // ── 4. Load constraints ──
    const { data: constraintData } = await supabase
      .from('schedule_constraints')
      .select('worker_a_id, worker_b_id, constraint_type')
      .eq('location_id', locationId)

    const constraints: Constraint[] = constraintData || []

    // ── 5. Check for existing shifts (don't overwrite) ──
    const { data: existingShifts } = await supabase
      .from('schedule_shifts')
      .select('worker_id, shift_date')
      .eq('location_id', locationId)
      .eq('schedule_month', scheduleMonth)

    const existingSet = new Set(
      (existingShifts || []).map(s => `${s.worker_id}_${s.shift_date}`)
    )

    // ── 6. Generate shifts ──
    const shifts: GeneratedShift[] = []
    const daysInMonth = new Date(year, mon, 0).getDate()

    // Track shifts per worker for fair distribution
    const shiftsCount: Record<string, number> = {}
    workers.forEach(w => { shiftsCount[w.id] = 0 })

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, mon - 1, day)
      const dayOfWeek = date.getDay() // 0=Sun
      const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      // Skip closed days
      if (!openDays.includes(dayOfWeek)) continue

      // Get available workers for this day
      function isAvailable(workerId: string): boolean {
        return !availability.some(a => {
          if (a.profile_id !== workerId) return false
          if (a.availability_type === 'preferred_off' && !a.approved) return false
          // Block if approved unavailable/vacation
          if (a.availability_type === 'unavailable' || a.availability_type === 'vacation') {
            if (!a.approved) return false
          }
          const from = new Date(a.date_from)
          const to = new Date(a.date_to)
          return date >= from && date <= to
        })
      }

      const availKitchen = kitchenWorkers
        .filter(w => isAvailable(w.id))
        .sort((a, b) => (shiftsCount[a.id] || 0) - (shiftsCount[b.id] || 0))

      const availHall = hallWorkers
        .filter(w => isAvailable(w.id))
        .sort((a, b) => (shiftsCount[a.id] || 0) - (shiftsCount[b.id] || 0))

      // Assign kitchen shifts
      const kitchenAssigned: string[] = []
      for (let i = 0; i < Math.min(minKitchen, availKitchen.length); i++) {
        const w = availKitchen[i]
        if (!existingSet.has(`${w.id}_${dateStr}`)) {
          shifts.push({
            location_id: locationId,
            worker_id: w.id,
            shift_date: dateStr,
            department: 'kitchen',
            start_time: defaultStart,
            end_time: defaultEnd,
            status: 'scheduled',
            schedule_month: scheduleMonth,
          })
          shiftsCount[w.id] = (shiftsCount[w.id] || 0) + 1
          kitchenAssigned.push(w.id)
        }
      }

      // Assign hall shifts
      const hallAssigned: string[] = []
      for (let i = 0; i < Math.min(minHall, availHall.length); i++) {
        const w = availHall[i]
        if (!existingSet.has(`${w.id}_${dateStr}`)) {
          // Check avoid constraints with already-assigned workers
          const avoided = constraints.some(c =>
            c.constraint_type === 'avoid' &&
            ((c.worker_a_id === w.id && [...kitchenAssigned, ...hallAssigned].includes(c.worker_b_id)) ||
             (c.worker_b_id === w.id && [...kitchenAssigned, ...hallAssigned].includes(c.worker_a_id)))
          )
          if (!avoided) {
            shifts.push({
              location_id: locationId,
              worker_id: w.id,
              shift_date: dateStr,
              department: 'hall',
              start_time: defaultStart,
              end_time: defaultEnd,
              status: 'scheduled',
              schedule_month: scheduleMonth,
            })
            shiftsCount[w.id] = (shiftsCount[w.id] || 0) + 1
            hallAssigned.push(w.id)
          }
        }
      }
    }

    // ── 7. Insert shifts in batches ──
    if (shifts.length === 0) {
      return NextResponse.json({
        generated: 0,
        message: 'Brak zmian do wygenerowania (wszystkie juz istnieja lub brak pracownikow)',
      })
    }

    const BATCH = 50
    let inserted = 0
    for (let i = 0; i < shifts.length; i += BATCH) {
      const batch = shifts.slice(i, i + BATCH)
      const { error } = await supabase.from('schedule_shifts').insert(batch)
      if (error) {
        console.error('[schedule/generate] Insert error:', error)
        // Continue with next batch even if some fail (duplicate keys etc.)
      } else {
        inserted += batch.length
      }
    }

    // ── 8. Create/update approval record as draft ──
    await supabase.from('schedule_approvals').upsert({
      location_id: locationId,
      schedule_month: scheduleMonth,
      status: 'draft',
      created_by: userId,
    }, { onConflict: 'location_id,schedule_month' })

    // Distribution summary
    const distribution = workers
      .filter(w => (shiftsCount[w.id] || 0) > 0)
      .map(w => ({ name: w.full_name, shifts: shiftsCount[w.id] || 0 }))
      .sort((a, b) => b.shifts - a.shifts)

    return NextResponse.json({
      generated: inserted,
      total_days: shifts.length,
      month: scheduleMonth,
      distribution,
    })
  } catch (err: any) {
    console.error('[schedule/generate] Error:', err)
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
