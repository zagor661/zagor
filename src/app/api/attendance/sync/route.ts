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
import { getWorkTimes } from '@/lib/gopos'
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

      // Filter for today only
      for (const wt of data) {
        const startDate = wt.started_at ? wt.started_at.split('T')[0] : null
        if (startDate === todayStr) {
          allWorkTimes.push(wt)
        }
      }

      // If we got records older than today, we can stop
      const oldestDate = data[data.length - 1]?.started_at?.split('T')[0]
      if (oldestDate && oldestDate < todayStr) break
      if (data.length < 20) break
      page++
    }

    // ─── 3. Match GoPOS employees to profiles ────────────────
    function matchProfile(empName: string) {
      const eLower = empName.toLowerCase().trim()
      return profiles!.find(p => {
        const pLower = p.full_name.toLowerCase().trim()
        return pLower === eLower
          || pLower.includes(eLower)
          || eLower.includes(pLower)
          // Handle first name only match
          || pLower.split(' ')[0] === eLower.split(' ')[0]
      })
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
      const empName = wt.employee_name || wt.employee?.name || `${wt.employee?.first_name || ''} ${wt.employee?.last_name || ''}`.trim()
      if (!empName) continue

      const profile = matchProfile(empName)
      if (!profile) continue

      const existing = logByWorker[profile.id]
      const clockIn = wt.started_at ? new Date(wt.started_at).toISOString() : null
      const clockOut = wt.finished_at ? new Date(wt.finished_at).toISOString() : null
      const hoursWorked = wt.duration ? Math.round(wt.duration / 3600 * 100) / 100 : null

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
                await supabase.from('notification_log').insert({
                  profile_id: shift.worker_id,
                  location_id: locationId,
                  tag: 'gopos-missing',
                  sent_at: new Date().toISOString(),
                }).catch(() => {})
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
    })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, result }, { status: 500 })
  }
}
