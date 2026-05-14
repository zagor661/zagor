// ============================================================
// GET /api/attendance/sync?loc=LOCATION_ID
// Sync GoPOS work_times → Supabase clock_logs
//
// Called from dashboard every 5 min between 11:30–20:30
// 1. Fetches today's work_times from GoPOS
// 2. Matches GoPOS employees to KitchenOps profiles
// 3. Creates/updates clock_logs (auto clock-in/clock-out)
// 4. Checks schedule — sends push if worker missing
// 5. Returns sync status for dashboard display
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWorkTimes, getEmployees } from '@/lib/gopos'
import { sendPushToLocation, type PushSubscription, type PushPayload } from '@/lib/webpush'

export const runtime = 'nodejs'
export const maxDuration = 30

interface SyncResult {
  synced: number
  clockedIn: string[]
  clockedOut: string[]
  missing: string[]
  errors: string[]
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get('loc')
  if (!locationId) {
    return NextResponse.json({ error: 'Missing loc parameter' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  const orgId = process.env.GOPOS_ORGANIZATION_ID
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@kitchenops.app'

  if (!supabaseUrl || !supabaseKey || !orgId) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  // Poland time
  const now = new Date()
  const polandOffset = 2 * 60
  const polandNow = new Date(now.getTime() + (polandOffset + now.getTimezoneOffset()) * 60000)
  const todayStr = polandNow.toISOString().split('T')[0]
  const currentHour = polandNow.getHours()
  const currentMinute = polandNow.getMinutes()
  const currentTimeMin = currentHour * 60 + currentMinute

  const result: SyncResult = { synced: 0, clockedIn: [], clockedOut: [], missing: [], errors: [] }

  try {
    // ─── 1. Get profiles linked to this location ─────────────
    const { data: links } = await supabase
      .from('user_locations')
      .select('user_id')
      .eq('location_id', locationId)

    if (!links || links.length === 0) {
      return NextResponse.json({ ok: true, result, message: 'No workers linked to location' })
    }

    const userIds = links.map(l => l.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .in('id', userIds)

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ ok: true, result, message: 'No active profiles' })
    }

    // ─── 2. Fetch today's work_times from GoPOS ─────────────
    // Paginate to get all records for today
    const allWorkTimes: any[] = []
    let page = 1
    while (page <= 10) {
      const res = await getWorkTimes(orgId, { page: String(page) })
      const data: any[] = res?.data || []
      if (data.length === 0) break

      // Filter for today only (GoPOS uses start_at, not started_at)
      for (const wt of data) {
        const startDate = wt.start_at ? wt.start_at.split('T')[0] : null
        if (startDate === todayStr) {
          allWorkTimes.push(wt)
        }
      }

      // If we got records older than today, we can stop
      const oldestDate = data[data.length - 1]?.start_at?.split('T')[0]
      if (oldestDate && oldestDate < todayStr) break
      if (data.length < 20) break
      page++
    }

    // ─── 2b. Fetch GoPOS employee list to map id → name ─────
    const goposEmployees: Record<number, string> = {}
    try {
      const empRes = await getEmployees(orgId)
      const empList: any[] = empRes?.data || empRes || []
      for (const emp of empList) {
        const id = emp.id
        const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim()
        if (id && name) goposEmployees[id] = name
      }
    } catch {}

    // ─── 3. Match GoPOS employees to profiles ────────────────
    // Normalize: strip diacritics + lowercase
    function norm(s: string) {
      return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    }

    // Polish diminutive → formal name mapping
    const DIMINUTIVES: Record<string, string[]> = {
      'maciek': ['maciej'], 'maciej': ['maciek'],
      'kasia': ['katarzyna'], 'katarzyna': ['kasia', 'kaska'],
      'michal': ['misiek', 'michas'], 'misiek': ['michal'],
      'piotrek': ['piotr'], 'piotr': ['piotrek'],
      'zuzia': ['zuzanna'], 'zuzanna': ['zuzia', 'zuza'],
      'tomek': ['tomasz'], 'tomasz': ['tomek'],
      'dawid': ['dawidek'], 'jurek': ['jerzy', 'yurii'],
      'yurii': ['jurek', 'yuri', 'jurij'], 'yuri': ['yurii'],
    }

    const matchLog: { gopos: string; matched: string | null }[] = []

    function matchProfile(empName: string) {
      const eNorm = norm(empName)
      const eParts = eNorm.split(/\s+/)
      const eFirst = eParts[0]
      const eLast = eParts.length > 1 ? eParts[eParts.length - 1] : null

      const match = profiles!.find(p => {
        const pNorm = norm(p.full_name)
        const pParts = pNorm.split(/\s+/)
        const pFirst = pParts[0]

        // 1. Exact match (after normalization)
        if (pNorm === eNorm) return true
        // 2. Profile name found inside GoPOS name (e.g. "Maciek" in "Maciek Słonowski")
        //    or GoPOS name found inside profile name
        if (eNorm.includes(pNorm) || pNorm.includes(eNorm)) return true
        // 3. GoPOS first name matches profile name exactly
        if (eFirst.length >= 3 && pFirst === eFirst) return true
        // 4. GoPOS last name matches profile name (rare but possible)
        if (eLast && eLast.length >= 3 && pFirst === eLast) return true
        // 5. Diminutive matching: "Maciek" ↔ "Maciej"
        const pDiminutives = DIMINUTIVES[pFirst] || []
        if (pDiminutives.includes(eFirst)) return true
        const eDiminutives = DIMINUTIVES[eFirst] || []
        if (eDiminutives.includes(pFirst)) return true
        // 6. First 4 chars match (handles Maci-ek vs Maci-ej etc.)
        if (eFirst.length >= 4 && pFirst.length >= 4 && eFirst.slice(0, 4) === pFirst.slice(0, 4)) return true
        return false
      })

      matchLog.push({ gopos: empName, matched: match?.full_name || null })
      return match
    }

    // ─── 4. Get existing clock_logs for today ────────────────
    const { data: existingLogs } = await supabase
      .from('clock_logs')
      .select('id, worker_id, clock_in, clock_out, hours_worked, source')
      .eq('clock_date', todayStr)
      .eq('location_id', locationId)

    const logByWorker: Record<string, any> = {}
    for (const log of existingLogs || []) {
      logByWorker[log.worker_id] = log
    }

    // ─── 5. Sync each work_time entry ────────────────────────
    for (const wt of allWorkTimes) {
      // GoPOS returns employee_id (number), resolve to name via employee list
      const empName = goposEmployees[wt.employee_id] || wt.employee_name || wt.employee?.name || ''
      if (!empName) continue

      const profile = matchProfile(empName)
      if (!profile) continue

      const existing = logByWorker[profile.id]
      const clockIn = wt.start_at ? new Date(wt.start_at).toISOString() : null
      const clockOut = wt.end_at ? new Date(wt.end_at).toISOString() : null
      const hoursWorked = wt.duration_in_minutes ? Math.round(wt.duration_in_minutes / 60 * 100) / 100 : null

      if (!existing) {
        // Create new clock_log — auto clock-in from GoPOS
        const { error } = await supabase.from('clock_logs').insert({
          location_id: locationId,
          worker_id: profile.id,
          clock_date: todayStr,
          clock_in: clockIn,
          clock_out: clockOut,
          hours_worked: hoursWorked,
          source: 'gopos',
          notes: `Auto-sync z GoPOS (${empName})`,
        })
        if (error) {
          result.errors.push(`Insert ${profile.full_name}: ${error.message}`)
        } else {
          result.synced++
          result.clockedIn.push(profile.full_name)
          if (clockOut) result.clockedOut.push(profile.full_name)
        }
      } else {
        // Update existing — only if GoPOS has newer data
        const updates: Record<string, any> = {}

        // Update clock_in if not set locally but GoPOS has it
        if (!existing.clock_in && clockIn) {
          updates.clock_in = clockIn
          result.clockedIn.push(profile.full_name)
        }

        // Update clock_out if GoPOS has it but local doesn't
        if (!existing.clock_out && clockOut) {
          updates.clock_out = clockOut
          updates.hours_worked = hoursWorked
          result.clockedOut.push(profile.full_name)
        }

        // Update hours if GoPOS has finished_at and local doesn't have hours
        if (clockOut && hoursWorked && !existing.hours_worked) {
          updates.hours_worked = hoursWorked
        }

        if (Object.keys(updates).length > 0) {
          updates.source = existing.source === 'manual' ? 'manual+gopos' : 'gopos'
          const { error } = await supabase
            .from('clock_logs')
            .update(updates)
            .eq('id', existing.id)
          if (error) {
            result.errors.push(`Update ${profile.full_name}: ${error.message}`)
          } else {
            result.synced++
          }
        }
      }
    }

    // ─── 6. Check schedule — who should be working but isn't? ─
    const { data: shifts } = await supabase
      .from('schedule_shifts')
      .select('worker_id, start_time, end_time, status')
      .eq('shift_date', todayStr)
      .eq('location_id', locationId)
      .in('status', ['scheduled', 'confirmed'])

    if (shifts) {
      // Refresh clock_logs after sync
      const { data: updatedLogs } = await supabase
        .from('clock_logs')
        .select('worker_id, clock_in')
        .eq('clock_date', todayStr)
        .eq('location_id', locationId)

      const clockedInWorkers = new Set(updatedLogs?.filter(l => l.clock_in).map(l => l.worker_id) || [])

      for (const shift of shifts) {
        const [sh, sm] = (shift.start_time || '11:30').split(':').map(Number)
        const shiftStartMin = sh * 60 + sm
        const minutesLate = currentTimeMin - shiftStartMin

        // Worker should be here (15+ min after shift start) but no clock-in
        if (minutesLate >= 15 && !clockedInWorkers.has(shift.worker_id)) {
          const worker = profiles.find(p => p.id === shift.worker_id)
          if (worker) {
            result.missing.push(worker.full_name)

            // Send push to the missing worker
            if (vapidPublicKey && vapidPrivateKey) {
              // Check if we already sent a push recently (avoid spam)
              const { data: recentPush } = await supabase
                .from('notification_log')
                .select('id')
                .eq('profile_id', shift.worker_id)
                .eq('tag', 'gopos-missing')
                .gte('created_at', todayStr + 'T00:00:00')
                .limit(1)

              if (!recentPush || recentPush.length === 0) {
                // Push to worker
                const { data: workerSubs } = await supabase
                  .from('push_subscriptions')
                  .select('endpoint, p256dh, auth')
                  .eq('profile_id', shift.worker_id)
                  .eq('location_id', locationId)

                if (workerSubs && workerSubs.length > 0) {
                  try {
                    await sendPushToLocation(
                      workerSubs as PushSubscription[],
                      {
                        title: '🚨 Nie zalogowałeś się!',
                        body: `Twoja zmiana zaczęła się o ${shift.start_time}. Zaloguj się w GoPOS.`,
                        url: '/',
                        tag: 'gopos-missing',
                      },
                      vapidPublicKey,
                      vapidPrivateKey,
                      vapidSubject
                    )
                  } catch {}
                }

                // Push to managers
                const { data: managerLinks } = await supabase
                  .from('user_locations')
                  .select('user_id')
                  .eq('location_id', locationId)
                const managerUserIds = managerLinks?.map(l => l.user_id) || []
                if (managerUserIds.length > 0) {
                  const { data: managers } = await supabase
                    .from('profiles')
                    .select('id')
                    .in('id', managerUserIds)
                    .in('role', ['manager', 'owner', 'admin'])

                  if (managers && managers.length > 0) {
                    const mgrIds = managers.map(m => m.id)
                    const { data: mgrSubs } = await supabase
                      .from('push_subscriptions')
                      .select('endpoint, p256dh, auth')
                      .in('profile_id', mgrIds)
                      .eq('location_id', locationId)

                    if (mgrSubs && mgrSubs.length > 0) {
                      try {
                        await sendPushToLocation(
                          mgrSubs as PushSubscription[],
                          {
                            title: `⚠️ ${worker.full_name} — brak logowania`,
                            body: `Zmiana o ${shift.start_time}, brak logowania w GoPOS. Sprawdź sytuację.`,
                            url: '/',
                            tag: 'gopos-missing-mgr',
                          },
                          vapidPublicKey,
                          vapidPrivateKey,
                          vapidSubject
                        )
                      } catch {}
                    }
                  }
                }

                // Log notification to avoid spam
                try {
                  await supabase.from('notification_log').insert({
                    profile_id: shift.worker_id,
                    location_id: locationId,
                    tag: 'gopos-missing',
                    sent_at: new Date().toISOString(),
                  })
                } catch {}
              }
            }
          }
        }
      }
    }

    // ─── 7. Return summary ───────────────────────────────────
    const allClockedIn = shifts
      ? shifts.every(s => {
          const clockedInWorkers = new Set(
            (existingLogs || []).filter(l => l.clock_in).map(l => l.worker_id)
              .concat(result.clockedIn.map(name => profiles.find(p => p.full_name === name)?.id || ''))
          )
          return clockedInWorkers.has(s.worker_id)
        })
      : true

    const allClockedOut = shifts
      ? shifts.every(s => {
          const clockedOutWorkers = new Set(
            (existingLogs || []).filter(l => l.clock_out).map(l => l.worker_id)
              .concat(result.clockedOut.map(name => profiles.find(p => p.full_name === name)?.id || ''))
          )
          return clockedOutWorkers.has(s.worker_id)
        })
      : true

    return NextResponse.json({
      ok: true,
      result,
      allClockedIn,
      allClockedOut,
      todayWorkTimes: allWorkTimes.length,
      todayShifts: shifts?.length || 0,
      debug: {
        matchLog,
        goposEmployeeMap: goposEmployees,
        profiles: profiles.map(p => ({ id: p.id, name: p.full_name, role: p.role })),
        goposNames: allWorkTimes.map(wt => goposEmployees[wt.employee_id] || `emp_${wt.employee_id}`),
        shifts: shifts?.map(s => ({ worker_id: s.worker_id, start: s.start_time, status: s.status })) || [],
      },
    })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, result }, { status: 500 })
  }
}
