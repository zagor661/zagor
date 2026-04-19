import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const nextDate = (() => {
      const d = new Date(date)
      d.setDate(d.getDate() + 1)
      return d.toISOString().split('T')[0]
    })()

    // 1. Checklist completion
    let checklistDone = 0, checklistTotal = 0
    try {
      const { data } = await supabase
        .from('checklist_logs')
        .select('is_done')
        .gte('created_at', date)
        .lt('created_at', nextDate)
      if (data) {
        checklistTotal = data.length
        checklistDone = data.filter((c: any) => c.is_done).length
      }
    } catch {}

    // 2. Tasks summary
    let tasksCreated = 0, tasksCompleted = 0, tasksOpen = 0
    try {
      const { count: created } = await supabase
        .from('worker_tasks')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', date)
        .lt('created_at', nextDate)
      tasksCreated = created || 0

      const { count: completed } = await supabase
        .from('worker_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('is_completed', true)
        .gte('updated_at', date)
        .lt('updated_at', nextDate)
      tasksCompleted = completed || 0

      const { count: open } = await supabase
        .from('worker_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('is_completed', false)
      tasksOpen = open || 0
    } catch {}

    // 3. Attendance (clock logs)
    const attendance: { name: string; clock_in: string | null; clock_out: string | null; hours: number | null; breaks_min: number }[] = []
    try {
      const { data: clockData } = await supabase
        .from('clock_logs')
        .select('worker_id, clock_in, clock_out, hours_worked, total_break_minutes')
        .eq('clock_date', date)

      if (clockData && clockData.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', clockData.map(c => c.worker_id))

        clockData.forEach(c => {
          attendance.push({
            name: profiles?.find(p => p.id === c.worker_id)?.full_name || '?',
            clock_in: c.clock_in ? new Date(c.clock_in).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : null,
            clock_out: c.clock_out ? new Date(c.clock_out).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : null,
            hours: c.hours_worked ? Math.round(c.hours_worked * 10) / 10 : null,
            breaks_min: c.total_break_minutes || 0,
          })
        })
      }
    } catch {}

    // 4. Issues/Awarie
    const issues: { title: string; status: string }[] = []
    try {
      const { data } = await supabase
        .from('issues')
        .select('title, status')
        .gte('created_at', date)
        .lt('created_at', nextDate)
      if (data) issues.push(...data)
    } catch {}

    // 5. Waste/Straty
    const losses: { item_name: string; quantity: number; unit: string }[] = []
    try {
      const { data } = await supabase
        .from('waste_logs')
        .select('item_name, quantity, unit')
        .gte('created_at', date)
        .lt('created_at', nextDate)
      if (data) losses.push(...data)
    } catch {}

    // 6. Meals
    let mealsCount = 0
    try {
      const { count } = await supabase
        .from('worker_meals')
        .select('*', { count: 'exact', head: true })
        .eq('meal_date', date)
      mealsCount = count || 0
    } catch {}

    // 7. WOKI TALKIE commands
    let commandsCount = 0
    try {
      const { count } = await supabase
        .from('woki_messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', date)
        .lt('created_at', nextDate)
      commandsCount = count || 0
    } catch {}

    // 8. Temperature logs
    let tempMorning = false, tempEvening = false
    try {
      const { data } = await supabase
        .from('temperature_logs')
        .select('shift')
        .eq('date', date)
      if (data) {
        tempMorning = data.some((t: any) => t.shift === 'morning')
        tempEvening = data.some((t: any) => t.shift === 'evening')
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      date,
      checklist: { done: checklistDone, total: checklistTotal },
      tasks: { created: tasksCreated, completed: tasksCompleted, open: tasksOpen },
      attendance,
      issues,
      losses,
      meals: mealsCount,
      commands: commandsCount,
      temperature: { morning: tempMorning, evening: tempEvening },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
