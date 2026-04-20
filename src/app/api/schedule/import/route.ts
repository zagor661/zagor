import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface SheetRow {
  date: string       // 'YYYY-MM-DD'
  start_time: string // 'HH:MM'
  end_time: string   // 'HH:MM'
  workers: string[]  // ['YURII', 'PIOTR', 'ZUZIA']
}

export async function POST(req: NextRequest) {
  try {
    const { rows, locationId, userId } = await req.json() as {
      rows: SheetRow[]
      locationId: string
      userId: string
    }

    if (!rows?.length || !locationId || !userId) {
      return NextResponse.json({ error: 'Missing rows, locationId or userId' }, { status: 400 })
    }

    // Get all active profiles (profiles table has no location_id column)
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)

    if (profErr || !profiles) {
      return NextResponse.json({ error: 'Cannot load profiles: ' + profErr?.message }, { status: 500 })
    }

    // Polish nickname → full name mapping
    const NICKNAMES: Record<string, string[]> = {
      'KASIA': ['KATARZYNA'],
      'KATARZYNA': ['KASIA'],
      'ZUZIA': ['ZUZANNA'],
      'ZUZANNA': ['ZUZIA'],
      'MACIEK': ['MACIEJ'],
      'MACIEJ': ['MACIEK'],
      'MICHAŁ': ['MICHAL'],
      'MICHAL': ['MICHAŁ'],
    }

    // Build name → profile map (case-insensitive, first name + nicknames)
    const nameMap: Record<string, { id: string; role: string }> = {}
    for (const p of profiles) {
      const firstName = p.full_name.split(' ')[0].toUpperCase()
      nameMap[firstName] = { id: p.id, role: p.role }
      // Also register nicknames pointing to the same profile
      const aliases = NICKNAMES[firstName] || []
      for (const alias of aliases) {
        nameMap[alias] = { id: p.id, role: p.role }
      }
    }

    // Determine schedule month from first row
    const scheduleMonth = rows[0].date.slice(0, 7) + '-01' // 'YYYY-MM-01'

    // Build shift records
    const shifts: any[] = []
    const unmatched: string[] = []

    for (const row of rows) {
      for (const workerName of row.workers) {
        const name = workerName.trim().toUpperCase()
        if (!name) continue

        const match = nameMap[name]
        if (!match) {
          if (!unmatched.includes(name)) unmatched.push(name)
          continue
        }

        // Department based on worker's role in profiles
        const dept = match.role === 'hall' ? 'hall' : 'kitchen'

        shifts.push({
          location_id: locationId,
          worker_id: match.id,
          shift_date: row.date,
          department: dept,
          start_time: row.start_time,
          end_time: row.end_time,
          status: 'scheduled',
          schedule_month: scheduleMonth,
        })
      }
    }

    if (shifts.length === 0) {
      return NextResponse.json({ error: 'No shifts to import', unmatched }, { status: 400 })
    }

    // Delete existing shifts for this month at this location
    const { error: delErr } = await supabase
      .from('schedule_shifts')
      .delete()
      .eq('location_id', locationId)
      .eq('schedule_month', scheduleMonth)

    if (delErr) {
      return NextResponse.json({ error: 'Delete failed: ' + delErr.message }, { status: 500 })
    }

    // Insert in batches
    let inserted = 0
    const batchSize = 50
    for (let i = 0; i < shifts.length; i += batchSize) {
      const batch = shifts.slice(i, i + batchSize)
      const { error: insErr } = await supabase
        .from('schedule_shifts')
        .insert(batch)
      if (insErr) {
        return NextResponse.json({ error: 'Insert failed: ' + insErr.message, inserted }, { status: 500 })
      }
      inserted += batch.length
    }

    return NextResponse.json({
      ok: true,
      inserted,
      days: rows.length,
      unmatched: unmatched.length > 0 ? unmatched : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
