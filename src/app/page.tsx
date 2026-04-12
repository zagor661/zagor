'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { ROLES, normalizeRole, isAdminRole } from '@/lib/roles'
import type { RoleType } from '@/lib/roles'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import supabase from '@/lib/supabase'

export default function Dashboard() {
  const { user, loading, logout } = useUser()
  const [showReminder, setShowReminder] = useState<string | null>(null)
  const [pendingTasks, setPendingTasks] = useState(0)
  const [starCount, setStarCount] = useState(0)
  const [readinessReport, setReadinessReport] = useState<{
    department: string; checklist_type: string; done: number; total: number; all_done: boolean; completedBy: string | null
  }[]>([])
  const [todayShifts, setTodayShifts] = useState<{ worker_name: string; department: string; start_time: string; end_time: string; worker_id: string }[]>([])
  const [todayClock, setTodayClock] = useState<{ worker_id: string; clock_in: string | null; clock_out: string | null }[]>([])
  const [minKitchen, setMinKitchen] = useState(2)
  const [minHall, setMinHall] = useState(1)
  const [pendingSwaps, setPendingSwaps] = useState(0)

  const role: RoleType = user ? normalizeRole(user.role) : 'kitchen'
  const roleConfig = ROLES[role]
  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user) return

    async function loadData() {
      // Star count
      const { count: stars } = await supabase
        .from('worker_stars')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', user!.id)
      setStarCount(stars || 0)

      // Pending tasks
      const { count: tasks } = await supabase
        .from('worker_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', user!.id)
        .eq('is_completed', false)
      setPendingTasks(tasks || 0)

      // Today's shifts
      const todayStr = format(new Date(), 'yyyy-MM-dd')
      const { data: shiftData } = await supabase
        .from('schedule_shifts')
        .select('worker_id, department, start_time, end_time')
        .eq('location_id', user!.location_id)
        .eq('shift_date', todayStr)
        .eq('status', 'scheduled')

      if (shiftData && shiftData.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', shiftData.map(s => s.worker_id))

        const enriched = shiftData.map(s => ({
          ...s,
          worker_name: profiles?.find(p => p.id === s.worker_id)?.full_name || '?',
        }))
        setTodayShifts(enriched)
      }

      // Today's clock logs
      const { data: clockData } = await supabase
        .from('clock_logs')
        .select('worker_id, clock_in, clock_out')
        .eq('location_id', user!.location_id)
        .eq('clock_date', todayStr)

      if (clockData) setTodayClock(clockData)

      // Schedule settings (min staffing)
      const { data: schedSettings } = await supabase
        .from('schedule_settings')
        .select('min_kitchen, min_hall')
        .eq('location_id', user!.location_id)
        .single()

      if (schedSettings) {
        setMinKitchen(schedSettings.min_kitchen)
        setMinHall(schedSettings.min_hall)
      }

      // Pending swap requests for me
      const { count: swapCount } = await supabase
        .from('swap_requests')
        .select('*', { count: 'exact', head: true })
        .eq('target_id', user!.id)
        .eq('status', 'pending')
      setPendingSwaps(swapCount || 0)

      // Readiness report (manager/owner only)
      const userRole = normalizeRole(user!.role)
      if (userRole === 'manager' || userRole === 'owner') {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const depts = ['kitchen', 'hall'] as const
        const types = ['opening', 'during_day', 'closing'] as const
        const report: typeof readinessReport = []

        for (const dept of depts) {
          for (const type of types) {
            const { count: totalItems } = await supabase
              .from('checklist_items')
              .select('*', { count: 'exact', head: true })
              .eq('location_id', user!.location_id)
              .eq('department', dept)
              .eq('checklist_type', type)
              .eq('is_active', true)

            const { data: log } = await supabase
              .from('checklist_logs')
              .select('id, all_done, completed_by')
              .eq('location_id', user!.location_id)
              .eq('department', dept)
              .eq('checklist_type', type)
              .eq('log_date', todayStr)
              .limit(1)

            let done = 0
            let completedBy: string | null = null

            if (log && log.length > 0) {
              const { count: doneCount } = await supabase
                .from('checklist_entries')
                .select('*', { count: 'exact', head: true })
                .eq('log_id', log[0].id)
                .eq('is_completed', true)
              done = doneCount || 0

              if (log[0].completed_by) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', log[0].completed_by)
                  .single()
                completedBy = profile?.full_name || null
              }
            }

            report.push({
              department: dept,
              checklist_type: type,
              done,
              total: totalItems || 0,
              all_done: log?.[0]?.all_done || false,
              completedBy,
            })
          }
        }
        setReadinessReport(report)
      }
    }
    loadData()

    async function checkReminders() {
      const now = new Date()
      const hour = now.getHours()
      const minute = now.getMinutes()
      const day = now.getDay()
      const today = format(now, 'yyyy-MM-dd')
      const reminders: string[] = []

      // Temperature reminders (only for kitchen/manager/owner)
      if (role === 'kitchen' || role === 'manager' || role === 'owner') {
        const { data: todayLogs } = await supabase
          .from('temperature_logs')
          .select('id, shift')
          .eq('date', today)
          .eq('location_id', user!.location_id)

        const hasMorning = todayLogs?.some(l => l.shift === 'morning')
        const hasEvening = todayLogs?.some(l => l.shift === 'evening')

        if (!hasMorning && ((hour === 11 && minute >= 30) || hour === 12 || (hour === 13 && minute === 0))) {
          reminders.push('🌡️ Pora na pomiary temperatur — zmiana PORANNA!')
        } else if (!hasEvening && ((hour === 19 && minute >= 30) || hour === 20 || (hour === 21 && minute === 0))) {
          reminders.push('🌡️ Pora na pomiary temperatur — zmiana WIECZORNA!')
        }

        // Sunday cleaning
        if (day === 0) {
          const weekNum = getWeekNumber(now)
          const { data: cleaningLogs } = await supabase
            .from('cleaning_logs')
            .select('id')
            .eq('week_number', weekNum)
            .eq('location_id', user!.location_id)
            .limit(1)
          if (!cleaningLogs || cleaningLogs.length === 0) {
            reminders.push('🧹 Niedziela — czas na tygodniowe sprzątanie!')
          }
        }
      }

      setShowReminder(reminders.length > 0 ? reminders.join('\n') : null)
    }
    checkReminders()

    const interval = setInterval(checkReminders, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [user])

  function getWeekNumber(d: Date) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  // ─── Belt / rank system ─────────────────────────────────────
  const BELT_LEVELS = [
    { min: 0,   label: 'Żółty pas',       color: 'text-yellow-600',  bg: 'bg-yellow-50 border-yellow-300',  chefBg: 'bg-yellow-400' },
    { min: 10,  label: 'Pomarańczowy pas', color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-300',  chefBg: 'bg-orange-400' },
    { min: 25,  label: 'Zielony pas',     color: 'text-green-700',   bg: 'bg-green-50 border-green-300',    chefBg: 'bg-green-500' },
    { min: 50,  label: 'Niebieski pas',   color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-300',      chefBg: 'bg-blue-500' },
    { min: 80,  label: 'Brązowy pas',     color: 'text-amber-800',   bg: 'bg-amber-50 border-amber-300',    chefBg: 'bg-amber-700' },
    { min: 120, label: 'Czarny pas',      color: 'text-gray-900',    bg: 'bg-gray-100 border-gray-800',     chefBg: 'bg-gray-800' },
  ]

  function getRank(name: string, stars: number) {
    const n = name.toLowerCase()
    if (n.includes('jakub')) return { icon: '🥷', label: 'NINJA', color: 'text-gray-900', bg: 'bg-gray-900/5 border-gray-800', chefBg: '' }
    const effectiveStars = n.includes('yurii') ? stars + 10 : stars
    let belt = BELT_LEVELS[0]
    for (const level of BELT_LEVELS) {
      if (effectiveStars >= level.min) belt = level
    }
    return { icon: '🍳', label: belt.label, color: belt.color, bg: belt.bg, chefBg: belt.chefBg }
  }

  if (loading || !user) return null

  const today = format(new Date(), 'EEEE, d MMMM', { locale: pl })
  const rank = getRank(user.full_name, starCount)

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-5">

        {/* ─── Header z rolą ─────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${roleConfig.gradientFrom} ${roleConfig.gradientTo} flex items-center justify-center text-2xl shadow-lg`}>
              {roleConfig.icon}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {role === 'owner' ? 'Owner 🥷' : `Cześć, ${user.full_name.split(' ')[0]}! 👋`}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${roleConfig.bgColor} ${roleConfig.color}`}>
                  {roleConfig.labelPl}
                </span>
                <span className="text-gray-400 text-xs">{user.location_name}</span>
              </div>
            </div>
          </div>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 px-3 py-2">
            Wyloguj
          </button>
        </div>

        {/* Data */}
        <p className="text-gray-500 text-sm -mt-2 ml-15">{today}</p>

        {/* ─── Reminder banner ───────────────────────── */}
        {showReminder && (
          <div className="rounded-2xl bg-red-50 border-2 border-red-200 p-4">
            {showReminder.split('\n').map((line, i) => (
              <p key={i} className="text-red-700 font-bold text-sm">{line}</p>
            ))}
          </div>
        )}

        {/* ─── Readiness Report (manager/owner) ─────── */}
        {isAdmin && readinessReport.length > 0 && (
          <div className="rounded-2xl bg-white border-2 border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              📋 Raport gotowości — dziś
            </h2>
            {['kitchen', 'hall'].map(dept => {
              const deptItems = readinessReport.filter(r => r.department === dept)
              const deptLabel = dept === 'kitchen' ? '🍳 Kuchnia' : '🍽️ Sala'
              return (
                <div key={dept} className="space-y-1.5">
                  <p className="text-xs font-bold text-gray-600">{deptLabel}</p>
                  {deptItems.map(item => {
                    const typeLabel = item.checklist_type === 'opening' ? 'Otwarcie'
                      : item.checklist_type === 'during_day' ? 'W ciągu dnia'
                      : 'Zamknięcie'
                    const pct = item.total > 0 ? Math.round((item.done / item.total) * 100) : 0
                    const status = item.all_done
                      ? { icon: '✅', color: 'text-green-700', bg: 'bg-green-50' }
                      : item.done > 0
                        ? { icon: '⚠️', color: 'text-amber-700', bg: 'bg-amber-50' }
                        : { icon: '⏳', color: 'text-gray-400', bg: 'bg-gray-50' }

                    return (
                      <div key={`${dept}-${item.checklist_type}`} className={`flex items-center justify-between px-3 py-2 rounded-xl ${status.bg}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{status.icon}</span>
                          <span className={`text-xs font-medium ${status.color}`}>{typeLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.completedBy && item.all_done && (
                            <span className="text-[10px] text-gray-400">{item.completedBy}</span>
                          )}
                          <span className={`text-xs font-bold ${status.color}`}>
                            {item.done}/{item.total}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* ─── Today's Shift Widget (always for admin, hides after clock-in for workers) */}
        {todayShifts.length > 0 && (isAdmin || !todayClock.find(c => c.worker_id === user.id)) && (
          <div className="rounded-2xl bg-white border-2 border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                👥 Kto dzisiaj pracuje
              </h2>
              <Link href="/schedule" className="text-xs text-brand-600 font-medium">
                Grafik →
              </Link>
            </div>

            {/* Staffing alert */}
            {(() => {
              const kitchenCount = todayShifts.filter(s => s.department === 'kitchen').length
              const hallCount = todayShifts.filter(s => s.department === 'hall').length
              const understaffed = kitchenCount < minKitchen || hallCount < minHall
              if (!understaffed) return null
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs font-bold text-red-700">
                  ⚠️ Brak obsady! Kuchnia: {kitchenCount}/{minKitchen} | Sala: {hallCount}/{minHall}
                </div>
              )
            })()}

            <div className="space-y-1.5">
              {todayShifts.map((s, i) => {
                const clock = todayClock.find(c => c.worker_id === s.worker_id)
                const isMe = s.worker_id === user.id
                const isKitchen = s.department === 'kitchen'
                return (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                    isKitchen ? 'bg-orange-50' : 'bg-blue-50'
                  } ${isMe ? 'ring-2 ring-green-400' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] text-white px-1.5 py-0.5 rounded font-bold ${
                        isKitchen ? 'bg-orange-500' : 'bg-blue-500'
                      }`}>
                        {isKitchen ? 'KU' : 'SA'}
                      </span>
                      <span className={`text-sm ${isMe ? 'font-bold' : 'font-medium'} text-gray-700`}>
                        {s.worker_name} {isMe ? '(Ty)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {s.start_time?.slice(0,5)}-{s.end_time?.slice(0,5)}
                      </span>
                      {clock?.clock_in && !clock?.clock_out && (
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="W pracy" />
                      )}
                      {clock?.clock_out && (
                        <span className="text-[10px] text-green-600 font-bold">OK</span>
                      )}
                      {!clock && (
                        <span className="w-2 h-2 rounded-full bg-gray-300" title="Nie clockowal" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── Swap alert ───────────────────────────── */}
        {pendingSwaps > 0 && (
          <Link href="/schedule" className="block rounded-2xl bg-amber-50 border-2 border-amber-300 p-4 hover:shadow-md transition-all">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔄</span>
              <div>
                <div className="text-sm font-bold text-amber-800">
                  {pendingSwaps} {pendingSwaps === 1 ? 'prosba' : 'prosby'} o zamiane zmian
                </div>
                <div className="text-xs text-amber-600">Kliknij zeby sprawdzic</div>
              </div>
            </div>
          </Link>
        )}

        {/* ─── Moduły per rola ───────────────────────── */}
        <div className="space-y-3">
          {roleConfig.modules.map(mod => {
            // Special handling for tasks — show pending count
            const isTaskMod = mod.href === '/tasks'
            const hasPending = isTaskMod && pendingTasks > 0

            return (
              <Link
                key={mod.href}
                href={mod.href}
                className={`block card border-2 ${mod.borderColor} ${mod.bgColor} hover:shadow-md transition-all active:scale-98 ${hasPending ? 'ring-2 ring-amber-300 animate-pulse-slow' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{mod.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900">{mod.title}</h2>
                      {hasPending && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {pendingTasks}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {isTaskMod && pendingTasks > 0
                        ? `Masz ${pendingTasks} ${pendingTasks === 1 ? 'zadanie' : pendingTasks < 5 ? 'zadania' : 'zadań'} do wykonania!`
                        : mod.subtitle
                      }
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* ─── Rank + Stars ──────────────────────────── */}
        <Link href="/stars" className={`block card border-2 hover:shadow-md transition-shadow ${rank.bg}`}>
          <div className="flex items-center gap-3">
            {rank.chefBg ? (
              <div className={`w-12 h-12 rounded-xl ${rank.chefBg} flex items-center justify-center`}>
                <span className="text-2xl">👨‍🍳</span>
              </div>
            ) : (
              <span className="text-4xl">{rank.icon}</span>
            )}
            <div className="flex-1">
              <div className="font-bold text-sm">{user.full_name}</div>
              <div className={`text-xs font-bold ${rank.color}`}>{rank.label}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">⭐ {starCount}</div>
              <div className="text-xs text-gray-400">{isAdmin ? 'Zarządzaj' : 'Pochwały'}</div>
            </div>
          </div>
        </Link>

      </div>
    </div>
  )
}
