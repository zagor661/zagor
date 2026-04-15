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
  const [todayShifts, setTodayShifts] = useState<{ worker_name: string; department: string; start_time: string; end_time: string; worker_id: string }[]>([])
  const [todayClock, setTodayClock] = useState<{ worker_id: string; clock_in: string | null; clock_out: string | null; breaks?: { start: string; end: string | null }[] }[]>([])
  const [minKitchen, setMinKitchen] = useState(2)
  const [minHall, setMinHall] = useState(1)
  const [pendingSwaps, setPendingSwaps] = useState(0)
  // Report section data
  const [reportData, setReportData] = useState<{
    todayMeals: number; weekMeals: number; monthMeals: number;
    todayIssues: number; weekIssues: number; monthIssues: number;
    todayShiftsCount: number; weekShiftsCount: number; monthShiftsCount: number;
  }>({ todayMeals: 0, weekMeals: 0, monthMeals: 0, todayIssues: 0, weekIssues: 0, monthIssues: 0, todayShiftsCount: 0, weekShiftsCount: 0, monthShiftsCount: 0 })

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

      // Today's clock logs (+ breaks)
      const { data: clockData } = await supabase
        .from('clock_logs')
        .select('worker_id, clock_in, clock_out, breaks')
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

      // Report summary data (admin only)
      const userRole = normalizeRole(user!.role)
      if (userRole === 'manager' || userRole === 'owner') {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const now = new Date()
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
        const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
        const weekAgoStr = format(weekAgo, 'yyyy-MM-dd')

        // Meals counts (table may not exist yet)
        let mToday = 0, mWeek = 0, mMonth = 0
        try {
          const r1 = await supabase.from('worker_meals').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).eq('meal_date', todayStr)
          mToday = r1.count || 0
          const r2 = await supabase.from('worker_meals').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('meal_date', weekAgoStr)
          mWeek = r2.count || 0
          const r3 = await supabase.from('worker_meals').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('meal_date', monthStart)
          mMonth = r3.count || 0
        } catch { /* worker_meals table may not exist */ }

        // Issues counts (table may not exist yet)
        let iToday = 0, iWeek = 0, iMonth = 0
        try {
          const r1 = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('created_at', todayStr)
          iToday = r1.count || 0
          const r2 = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('created_at', weekAgoStr)
          iWeek = r2.count || 0
          const r3 = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('created_at', monthStart)
          iMonth = r3.count || 0
        } catch { /* issues table may not exist */ }

        // Shifts counts (table may not exist yet)
        let sToday = 0, sWeek = 0, sMonth = 0
        try {
          const r1 = await supabase.from('schedule_shifts').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).eq('shift_date', todayStr)
          sToday = r1.count || 0
          const r2 = await supabase.from('schedule_shifts').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('shift_date', weekAgoStr).lte('shift_date', todayStr)
          sWeek = r2.count || 0
          const r3 = await supabase.from('schedule_shifts').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('shift_date', monthStart).lte('shift_date', todayStr)
          sMonth = r3.count || 0
        } catch { /* schedule_shifts table may not exist */ }

        setReportData({
          todayMeals: mToday, weekMeals: mWeek, monthMeals: mMonth,
          todayIssues: iToday, weekIssues: iWeek, monthIssues: iMonth,
          todayShiftsCount: sToday, weekShiftsCount: sWeek, monthShiftsCount: sMonth,
        })
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

        {/* (readiness report removed — use Sanepid module) */}

        {/* ─── Clock IN/OUT widget (kontekstowy) ─────────── */}
        <ClockWidget user={user} todayShifts={todayShifts} todayClock={todayClock} onUpdate={() => {
          // Reload today clock logs
          const todayStr = format(new Date(), 'yyyy-MM-dd')
          supabase.from('clock_logs')
            .select('worker_id, clock_in, clock_out, breaks')
            .eq('location_id', user.location_id)
            .eq('clock_date', todayStr)
            .then(({ data }) => { if (data) setTodayClock(data) })
        }} />

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

        {/* ─── Raport operacyjny (admin only) ─────────── */}
        {isAdmin && (
          <div className="rounded-2xl bg-white border-2 border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              Raport
            </h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="text-xs font-bold text-gray-400">Dzis</div>
              <div className="text-xs font-bold text-gray-400">Tydzien</div>
              <div className="text-xs font-bold text-gray-400">Miesiac</div>
            </div>
            {/* Meals */}
            <div className="bg-orange-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🍽️</span>
                <span className="text-sm font-bold text-gray-700">Posilki pracownikow</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-orange-600">{reportData.todayMeals}</div>
                  <div className="text-[10px] text-gray-400">Dzis</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-orange-600">{reportData.weekMeals}</div>
                  <div className="text-[10px] text-gray-400">Tydzien</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-orange-600">{reportData.monthMeals}</div>
                  <div className="text-[10px] text-gray-400">Miesiac</div>
                </div>
              </div>
            </div>
            {/* Issues */}
            <div className="bg-red-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔧</span>
                <span className="text-sm font-bold text-gray-700">Usterki</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-red-600">{reportData.todayIssues}</div>
                  <div className="text-[10px] text-gray-400">Dzis</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">{reportData.weekIssues}</div>
                  <div className="text-[10px] text-gray-400">Tydzien</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">{reportData.monthIssues}</div>
                  <div className="text-[10px] text-gray-400">Miesiac</div>
                </div>
              </div>
            </div>
            {/* Shifts */}
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📅</span>
                <span className="text-sm font-bold text-gray-700">Zmiany</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-blue-600">{reportData.todayShiftsCount}</div>
                  <div className="text-[10px] text-gray-400">Dzis</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-600">{reportData.weekShiftsCount}</div>
                  <div className="text-[10px] text-gray-400">Tydzien</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-600">{reportData.monthShiftsCount}</div>
                  <div className="text-[10px] text-gray-400">Miesiac</div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-300 text-center">Wiecej opcji raportowania wkrotce</p>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Clock Widget Component ──────────────────────────────────
// Break limits based on Polish labor law (adapted for restaurant shifts):
// <6h → 0 min (not mandatory), 6-8h → 15 min, 8-12h → 30 min, 12h+ → 45 min
function calcBreakLimit(shiftHours: number): number {
  if (shiftHours < 6) return 0
  if (shiftHours < 8) return 15
  if (shiftHours < 12) return 30
  return 45
}

function sumBreakMinutes(breaks: { start: string; end: string | null }[], now: Date): number {
  let total = 0
  for (const b of breaks) {
    const start = new Date(b.start).getTime()
    const end = b.end ? new Date(b.end).getTime() : now.getTime()
    total += (end - start) / 60000
  }
  return Math.round(total)
}

function ClockWidget({ user, todayShifts, todayClock, onUpdate }: {
  user: any
  todayShifts: { worker_id: string; start_time: string; end_time: string; department: string; worker_name: string }[]
  todayClock: { worker_id: string; clock_in: string | null; clock_out: string | null; breaks?: { start: string; end: string | null }[] }[]
  onUpdate: () => void
}) {
  const [now, setNow] = useState(new Date())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30)
    return () => clearInterval(t)
  }, [])

  const myShift = todayShifts.find(s => s.worker_id === user.id)
  const myClock = todayClock.find(c => c.worker_id === user.id)

  if (!myShift) return null

  const todayStr = format(now, 'yyyy-MM-dd')
  const [sh, sm] = myShift.start_time.split(':').map(Number)
  const [eh, em] = myShift.end_time.split(':').map(Number)
  const shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm)
  const shiftEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em)
  const msToStart = shiftStart.getTime() - now.getTime()
  const msToEnd = shiftEnd.getTime() - now.getTime()

  // Show Clock IN: 1h before shift start, not yet clocked in
  const showClockIn = !myClock?.clock_in && msToStart < 60 * 60 * 1000 && msToEnd > 0

  // Show Clock OUT: clocked in but not out, anytime during shift or after
  const showClockOut = myClock?.clock_in && !myClock?.clock_out

  async function handleClockIn() {
    setSaving(true)
    const { error } = await supabase.from('clock_logs').upsert({
      worker_id: user.id,
      location_id: user.location_id,
      clock_date: todayStr,
      clock_in: new Date().toISOString(),
      clock_out: null,
      clocked_by: user.id,
    }, { onConflict: 'worker_id,clock_date' })
    if (error) alert('Blad: ' + error.message)
    setSaving(false)
    onUpdate()
  }

  async function handleClockOut() {
    if (!myClock || !myClock.clock_in) return
    setSaving(true)
    const clockIn = new Date(myClock.clock_in)
    const clockOut = new Date()
    const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)

    const { error } = await supabase.from('clock_logs').update({
      clock_out: clockOut.toISOString(),
      hours_worked: hours,
      clocked_by: user.id,
    }).eq('worker_id', user.id).eq('clock_date', todayStr)
    if (error) alert('Blad: ' + error.message)
    setSaving(false)
    onUpdate()
  }

  function fmtCountdown(ms: number) {
    if (ms < 0) return '0:00'
    const totalMin = Math.floor(ms / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${h}h ${m}m`
  }

  // Not clocked in yet + within 1h window → show big green button
  if (showClockIn) {
    return (
      <div className="rounded-2xl bg-white border-2 border-green-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 font-medium">Twoja zmiana</div>
            <div className="text-sm font-bold text-gray-900">
              {myShift.start_time.slice(0,5)} — {myShift.end_time.slice(0,5)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Start za</div>
            <div className="text-sm font-bold text-green-600">
              {msToStart > 0 ? fmtCountdown(msToStart) : 'TERAZ'}
            </div>
          </div>
        </div>
        <button
          onClick={handleClockIn}
          disabled={saving}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl text-lg shadow-lg active:scale-98 disabled:opacity-50"
        >
          {saving ? '...' : '🟢 CLOCK IN'}
        </button>
      </div>
    )
  }

  // Currently working → show elapsed + Break + Clock OUT
  if (showClockOut && myClock?.clock_in) {
    const clockInTime = new Date(myClock.clock_in)
    const elapsed = now.getTime() - clockInTime.getTime()
    const showOutSoon = msToEnd < 30 * 60 * 1000

    const breaks = myClock.breaks || []
    const activeBreak = breaks.find(b => !b.end)
    const onBreak = !!activeBreak
    const shiftHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60)
    const breakLimit = calcBreakLimit(shiftHours)
    const usedMinutes = sumBreakMinutes(breaks, now)
    const overLimit = breakLimit > 0 && usedMinutes > breakLimit

    const handleBreakToggle = async () => {
      if (!myClock) return
      setSaving(true)
      const currentBreaks = [...(myClock.breaks || [])]
      if (onBreak) {
        // End active break
        const idx = currentBreaks.findIndex(b => !b.end)
        if (idx >= 0) currentBreaks[idx] = { ...currentBreaks[idx], end: new Date().toISOString() }
      } else {
        // Start new break
        currentBreaks.push({ start: new Date().toISOString(), end: null })
      }
      const totalMin = sumBreakMinutes(currentBreaks, new Date())
      const { error } = await supabase.from('clock_logs').update({
        breaks: currentBreaks,
        total_break_minutes: totalMin,
      }).eq('worker_id', user.id).eq('clock_date', todayStr)
      if (error) alert('Blad: ' + error.message)
      setSaving(false)
      onUpdate()
    }

    // ═════ ON BREAK VIEW ═════
    if (onBreak && activeBreak) {
      const breakStart = new Date(activeBreak.start)
      const breakElapsed = Math.floor((now.getTime() - breakStart.getTime()) / 60000)
      return (
        <div className="rounded-2xl bg-white border-2 border-orange-300 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-orange-500 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" /> NA PRZERWIE
              </div>
              <div className="text-sm font-bold text-gray-900">
                Od {breakStart.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Przerwa</div>
              <div className={`text-lg font-bold ${overLimit ? 'text-red-600' : 'text-orange-600'}`}>
                {breakElapsed}m{breakLimit > 0 ? ` / ${breakLimit}m` : ''}
              </div>
            </div>
          </div>
          {overLimit && (
            <p className="text-[10px] text-red-500 text-center font-medium">
              ⚠️ Przekroczony limit przerwy ({breakLimit}min wg przepisow dla {shiftHours.toFixed(0)}h zmiany)
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleBreakToggle}
              disabled={saving}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm shadow-md active:scale-98 disabled:opacity-50"
            >
              {saving ? '...' : '✅ KONIEC PRZERWY'}
            </button>
            <button
              onClick={handleClockOut}
              disabled={saving}
              className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-sm shadow-md active:scale-98 disabled:opacity-50"
            >
              🔴 CLOCK OUT
            </button>
          </div>
        </div>
      )
    }

    // ═════ WORKING VIEW ═════
    return (
      <div className={`rounded-2xl bg-white border-2 p-4 space-y-3 ${showOutSoon ? 'border-red-300' : 'border-green-300'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> W pracy
            </div>
            <div className="text-sm font-bold text-gray-900">
              Od {clockInTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Przepracowane</div>
            <div className="text-lg font-bold text-green-600">{fmtCountdown(elapsed)}</div>
          </div>
        </div>

        {breakLimit > 0 && usedMinutes > 0 && (
          <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-1.5">
            <span className="text-[10px] text-orange-600 font-medium">☕ Wykorzystana przerwa</span>
            <span className={`text-xs font-bold ${overLimit ? 'text-red-600' : 'text-orange-700'}`}>
              {usedMinutes}m / {breakLimit}m
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleBreakToggle}
            disabled={saving || overLimit}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm shadow-md active:scale-98 disabled:opacity-50"
          >
            {saving ? '...' : '☕ PRZERWA'}
          </button>
          <button
            onClick={handleClockOut}
            disabled={saving}
            className={`text-white font-bold py-3 rounded-xl text-sm shadow-md active:scale-98 disabled:opacity-50 ${
              showOutSoon ? 'bg-red-500 hover:bg-red-600 animate-pulse-slow' : 'bg-gray-700 hover:bg-gray-800'
            }`}
          >
            🔴 CLOCK OUT
          </button>
        </div>

        {showOutSoon && (
          <p className="text-[10px] text-red-500 text-center font-medium">
            Zmiana konczy sie za {fmtCountdown(msToEnd)}
          </p>
        )}
      </div>
    )
  }

  // Already clocked out → show summary
  if (myClock?.clock_in && myClock?.clock_out) {
    const inTime = new Date(myClock.clock_in)
    const outTime = new Date(myClock.clock_out)
    const hours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60)
    return (
      <div className="rounded-2xl bg-gray-50 border-2 border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            ✅ Dzisiaj przepracowane: <span className="font-bold text-gray-800">{hours.toFixed(1)}h</span>
          </div>
          <div className="text-[10px] text-gray-400">
            {inTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} — {outTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    )
  }

  return null
}
