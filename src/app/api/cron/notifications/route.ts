// ============================================================
// GET /api/cron/notifications
// Automatyczne przypomnienia — wywoływane co 5 minut przez Vercel Cron
//
// Sprawdza:
// 1. Zmiana za 30 min — przypomnienie dla pracownika
// 2. Zmiana za 10 min — drugie przypomnienie
// 3. Nie odbito zmiany — 15 min po starcie
// 4. Checklist otwarcia — 10:30 (powtórka 11:00 jeśli brak)
// 5. Checklist zamknięcia — 20:30 (powtórka 21:00 jeśli brak)
// 6. Pomiary temperatur — 11:00 i 18:00 (powtórka +30 min)
// 7. Niewykonane zadania — przypomnienia co godzinę
// 8. Przerwa przekroczona — alert dla managerów
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToLocation, type PushSubscription, type PushPayload } from '@/lib/webpush'

export const runtime = 'nodejs'
export const maxDuration = 30

// Verify Vercel Cron secret (optional but recommended)
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // No secret = allow all (dev mode)
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@kitchenops.app'

  if (!supabaseUrl || !supabaseKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  // Current time in Poland (UTC+2)
  const now = new Date()
  const polandOffset = 2 * 60 // UTC+2 (CEST)
  const polandNow = new Date(now.getTime() + (polandOffset + now.getTimezoneOffset()) * 60000)
  const todayStr = polandNow.toISOString().split('T')[0]
  const currentHour = polandNow.getHours()
  const currentMinute = polandNow.getMinutes()
  const currentTimeMin = currentHour * 60 + currentMinute

  const results: string[] = []

  // ─── Helper: send push to specific profiles ───────────────

  async function pushToProfiles(profileIds: string[], locationId: string, payload: PushPayload) {
    if (profileIds.length === 0) return

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('location_id', locationId)
      .in('profile_id', profileIds)

    if (!subs || subs.length === 0) return

    const result = await sendPushToLocation(
      subs as PushSubscription[],
      payload,
      vapidPublicKey!,
      vapidPrivateKey!,
      vapidSubject
    )

    if (result.expired.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', result.expired)
    }

    return result
  }

  async function pushToLocation(locationId: string, payload: PushPayload) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('location_id', locationId)

    if (!subs || subs.length === 0) return

    const result = await sendPushToLocation(
      subs as PushSubscription[],
      payload,
      vapidPublicKey!,
      vapidPrivateKey!,
      vapidSubject
    )

    if (result.expired.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', result.expired)
    }

    return result
  }

  // ─── 1. Shift reminders (30 min and 10 min before) ────────

  try {
    const { data: shifts } = await supabase
      .from('schedule_shifts')
      .select('worker_id, location_id, start_time, end_time')
      .eq('shift_date', todayStr)
      .eq('status', 'scheduled')

    if (shifts) {
      // Get today's clock logs to check who already clocked in
      const { data: clockLogs } = await supabase
        .from('clock_logs')
        .select('worker_id, clock_in')
        .eq('clock_date', todayStr)

      const clockedIn = new Set(clockLogs?.filter(c => c.clock_in).map(c => c.worker_id) || [])

      // Group by location for efficient sending
      const locationShifts: Record<string, typeof shifts> = {}
      for (const s of shifts) {
        if (!locationShifts[s.location_id]) locationShifts[s.location_id] = []
        locationShifts[s.location_id].push(s)
      }

      for (const [locationId, locShifts] of Object.entries(locationShifts)) {
        for (const shift of locShifts) {
          const [sh, sm] = (shift.start_time || '11:00').split(':').map(Number)
          const shiftStartMin = sh * 60 + sm
          const minutesBefore = shiftStartMin - currentTimeMin

          // 30 min before shift — reminder
          if (minutesBefore >= 28 && minutesBefore <= 32 && !clockedIn.has(shift.worker_id)) {
            await pushToProfiles([shift.worker_id], locationId, {
              title: '⏰ Zmiana za 30 min',
              body: `Twoja zmiana zaczyna się o ${shift.start_time}. Przygotuj się!`,
              url: '/',
              tag: 'shift-30',
            })
            results.push(`shift-30: ${shift.worker_id}`)
          }

          // 10 min before shift — last reminder
          if (minutesBefore >= 8 && minutesBefore <= 12 && !clockedIn.has(shift.worker_id)) {
            await pushToProfiles([shift.worker_id], locationId, {
              title: '🔴 Zmiana za 10 min!',
              body: `Twoja zmiana o ${shift.start_time}. Czas ruszać!`,
              url: '/',
              tag: 'shift-10',
            })
            results.push(`shift-10: ${shift.worker_id}`)
          }

          // 15 min AFTER shift start — no clock in
          if (minutesBefore >= -17 && minutesBefore <= -13 && !clockedIn.has(shift.worker_id)) {
            await pushToProfiles([shift.worker_id], locationId, {
              title: '🚨 Nie odbiłeś zmiany!',
              body: `Zmiana zaczęła się o ${shift.start_time}. Kliknij "Rozpocznij zmianę" w apce.`,
              url: '/',
              tag: 'clock-missing',
            })
            results.push(`clock-missing: ${shift.worker_id}`)
          }

          // 30 min before shift END — reminder to close up
          const [eh, em] = (shift.end_time || '21:00').split(':').map(Number)
          const shiftEndMin = eh * 60 + em
          const minutesToEnd = shiftEndMin - currentTimeMin

          if (minutesToEnd >= 28 && minutesToEnd <= 32 && clockedIn.has(shift.worker_id)) {
            await pushToProfiles([shift.worker_id], locationId, {
              title: '🏁 Koniec zmiany za 30 min',
              body: `Zmiana kończy się o ${shift.end_time}. Zacznij zamykanie.`,
              url: '/',
              tag: 'shift-ending',
            })
            results.push(`shift-ending: ${shift.worker_id}`)
          }
        }
      }
    }
  } catch (err: any) {
    results.push(`shift-error: ${err.message}`)
  }

  // ─── 2. Checklist reminders (with follow-up if not done) ──

  try {
    const checklistTimes = [
      { hour: 10, minute: 30, shift: 'open' as const, label: 'otwarcia', followUp: false },
      { hour: 11, minute: 0, shift: 'open' as const, label: 'otwarcia', followUp: true },
      { hour: 20, minute: 30, shift: 'close' as const, label: 'zamknięcia', followUp: false },
      { hour: 21, minute: 0, shift: 'close' as const, label: 'zamknięcia', followUp: true },
    ]

    for (const ct of checklistTimes) {
      if (currentHour === ct.hour && currentMinute >= ct.minute - 2 && currentMinute <= ct.minute + 2) {
        const { data: locations } = await supabase.from('locations').select('id')
        if (!locations) continue

        for (const loc of locations) {
          // If follow-up, check if checklist was already completed today
          if (ct.followUp) {
            const { data: existing } = await supabase
              .from('checklist_logs')
              .select('id')
              .eq('location_id', loc.id)
              .eq('shift', ct.shift)
              .gte('created_at', todayStr + 'T00:00:00')
              .lte('created_at', todayStr + 'T23:59:59')
              .limit(1)

            if (existing && existing.length > 0) continue // already done
          }

          await pushToLocation(loc.id, {
            title: ct.followUp
              ? `🚨 Checklist ${ct.label} — nie uzupełniony!`
              : `📝 Checklist ${ct.label}`,
            body: ct.followUp
              ? `Checklist ${ct.label} wciąż nie jest wypełniony! Uzupełnij teraz.`
              : `Czas wypełnić checklistę ${ct.label} lokalu!`,
            url: '/checklist',
            tag: `checklist-${ct.shift}`,
          })
          results.push(`checklist-${ct.shift}${ct.followUp ? '-followup' : ''}: ${loc.id}`)
        }
      }
    }
  } catch (err: any) {
    results.push(`checklist-error: ${err.message}`)
  }

  // ─── 3. Temperature reminders (with follow-up) ────────────

  try {
    const tempTimes = [
      { hour: 11, minute: 0, shift: 'morning' as const, label: 'poranne', followUp: false },
      { hour: 11, minute: 30, shift: 'morning' as const, label: 'poranne', followUp: true },
      { hour: 18, minute: 0, shift: 'evening' as const, label: 'wieczorne', followUp: false },
      { hour: 18, minute: 30, shift: 'evening' as const, label: 'wieczorne', followUp: true },
    ]

    for (const tt of tempTimes) {
      if (currentHour === tt.hour && currentMinute >= tt.minute - 2 && currentMinute <= tt.minute + 2) {
        const { data: locations } = await supabase.from('locations').select('id')
        if (!locations) continue

        for (const loc of locations) {
          // If follow-up, check if temperature was already logged today for this shift
          if (tt.followUp) {
            const timeRangeStart = tt.shift === 'morning' ? '06:00:00' : '14:00:00'
            const timeRangeEnd = tt.shift === 'morning' ? '13:59:59' : '23:59:59'

            const { data: existing } = await supabase
              .from('temperature_logs')
              .select('id')
              .eq('location_id', loc.id)
              .gte('created_at', `${todayStr}T${timeRangeStart}`)
              .lte('created_at', `${todayStr}T${timeRangeEnd}`)
              .limit(1)

            if (existing && existing.length > 0) continue // already done
          }

          await pushToLocation(loc.id, {
            title: tt.followUp
              ? `🚨 Temperatury ${tt.label} — brak pomiarów!`
              : `🌡️ Pomiary temperatur ${tt.label}`,
            body: tt.followUp
              ? `Pomiary temperatur ${tt.label} wciąż nie uzupełnione! Zrób to teraz.`
              : `Pora na pomiary temperatur lodówek i zamrażarek!`,
            url: '/temperature',
            tag: `temp-${tt.shift}`,
          })
          results.push(`temp-${tt.shift}${tt.followUp ? '-followup' : ''}: ${loc.id}`)
        }
      }
    }
  } catch (err: any) {
    results.push(`temp-error: ${err.message}`)
  }

  // ─── 4. Incomplete task reminders (hourly, 9:00–20:00) ────

  try {
    // Run every full hour between 9:00 and 20:00
    if (currentHour >= 9 && currentHour <= 20 && currentMinute >= 0 && currentMinute <= 4) {
      const { data: tasks } = await supabase
        .from('worker_tasks')
        .select('id, title, assigned_to, location_id, due_date')
        .eq('is_completed', false)
        .not('assigned_to', 'is', null)

      if (tasks && tasks.length > 0) {
        // Group tasks by assigned worker
        const byWorker: Record<string, { locationId: string; titles: string[]; overdue: boolean }[]> = {}
        for (const t of tasks) {
          if (!byWorker[t.assigned_to]) byWorker[t.assigned_to] = []
          const isOverdue = t.due_date && t.due_date <= todayStr
          byWorker[t.assigned_to].push({
            locationId: t.location_id,
            titles: [t.title],
            overdue: !!isOverdue,
          })
        }

        for (const [workerId, workerTasks] of Object.entries(byWorker)) {
          // Group by location
          const byLoc: Record<string, { titles: string[]; hasOverdue: boolean }> = {}
          for (const wt of workerTasks) {
            if (!byLoc[wt.locationId]) byLoc[wt.locationId] = { titles: [], hasOverdue: false }
            byLoc[wt.locationId].titles.push(...wt.titles)
            if (wt.overdue) byLoc[wt.locationId].hasOverdue = true
          }

          for (const [locId, info] of Object.entries(byLoc)) {
            const count = info.titles.length
            const preview = info.titles.slice(0, 2).join(', ')
            const more = count > 2 ? ` (+${count - 2} więcej)` : ''

            await pushToProfiles([workerId], locId, {
              title: info.hasOverdue
                ? `🚨 Masz zaległe zadania (${count})`
                : `📋 Zadania do wykonania (${count})`,
              body: `${preview}${more}`,
              url: '/tasks',
              tag: 'task-reminder',
            })
            results.push(`task-reminder: ${workerId} (${count} tasks)`)
          }
        }
      }
    }
  } catch (err: any) {
    results.push(`task-error: ${err.message}`)
  }

  // ─── 5. Break overrun alerts (for managers) ───────────────

  try {
    const { data: activeLogs } = await supabase
      .from('clock_logs')
      .select('worker_id, location_id, breaks')
      .eq('clock_date', todayStr)
      .is('clock_out', null)

    if (activeLogs) {
      for (const log of activeLogs) {
        const breaks = (log.breaks || []) as { start: string; end: string | null }[]
        const activeBreak = breaks.find(b => !b.end)
        if (activeBreak) {
          const breakStart = new Date(activeBreak.start).getTime()
          const breakMinutes = Math.floor((now.getTime() - breakStart) / 60000)

          // Alert if break exceeds 20 minutes
          if (breakMinutes >= 20 && breakMinutes <= 22) {
            // Get worker name
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', log.worker_id)
              .single()

            // Notify managers
            const { data: managers } = await supabase
              .from('profiles')
              .select('id')
              .in('role', ['manager', 'owner', 'admin'])
              .eq('is_active', true)

            if (managers && managers.length > 0 && profile) {
              await pushToProfiles(
                managers.map(m => m.id),
                log.location_id,
                {
                  title: '⚠️ Długa przerwa',
                  body: `${profile.full_name} — przerwa trwa ${breakMinutes} min`,
                  url: '/',
                  tag: 'break-alert',
                }
              )
              results.push(`break-alert: ${log.worker_id} (${breakMinutes}min)`)
            }
          }
        }
      }
    }
  } catch (err: any) {
    results.push(`break-error: ${err.message}`)
  }

  return NextResponse.json({
    ok: true,
    time: polandNow.toISOString(),
    notifications: results,
  })
}
