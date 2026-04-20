'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { ROLES, normalizeRole, isAdminRole } from '@/lib/roles'
import type { RoleType, ModuleConfig } from '@/lib/roles'
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
  const [checklistProgress, setChecklistProgress] = useState<{ done: number; total: number } | null>(null)

  // Owner Pulse data
  const [tasksByWorker, setTasksByWorker] = useState<{ name: string; count: number }[]>([])
  const [recentIssues, setRecentIssues] = useState<{ id: string; title: string; status: string; created_at: string }[]>([])
  const [todayLosses, setTodayLosses] = useState<{ count: number; names: string[]; totalValue?: number }>({ count: 0, names: [] })
  const [reportData, setReportData] = useState<{
    todayMeals: number; weekMeals: number; monthMeals: number;
    todayIssues: number; weekIssues: number; monthIssues: number;
    todayShiftsCount: number; weekShiftsCount: number; monthShiftsCount: number;
  }>({ todayMeals: 0, weekMeals: 0, monthMeals: 0, todayIssues: 0, weekIssues: 0, monthIssues: 0, todayShiftsCount: 0, weekShiftsCount: 0, monthShiftsCount: 0 })

  // Summary expandable
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [allIssues, setAllIssues] = useState<{ id: string; title: string; status: string; created_at: string }[]>([])
  const [allLosses, setAllLosses] = useState<{ item_name: string; quantity: number; estimated_value?: number; created_at: string }[]>([])
  const [workerHours, setWorkerHours] = useState<{ name: string; hours: number; rate: number; cost: number; contract: string }[]>([])

  const role: RoleType = user ? normalizeRole(user.role) : 'kitchen'
  const roleConfig = ROLES[role]
  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user) return

    async function loadData() {
      const todayStr = format(new Date(), 'yyyy-MM-dd')

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
        .select('worker_id, clock_in, clock_out, breaks')
        .eq('location_id', user!.location_id)
        .eq('clock_date', todayStr)
      if (clockData) setTodayClock(clockData)

      // Schedule settings
      const { data: schedSettings } = await supabase
        .from('schedule_settings')
        .select('min_kitchen, min_hall')
        .eq('location_id', user!.location_id)
        .single()
      if (schedSettings) {
        setMinKitchen(schedSettings.min_kitchen)
        setMinHall(schedSettings.min_hall)
      }

      // Pending swaps
      const { count: swapCount } = await supabase
        .from('swap_requests')
        .select('*', { count: 'exact', head: true })
        .eq('target_id', user!.id)
        .eq('status', 'pending')
      setPendingSwaps(swapCount || 0)

      // Checklist progress today
      try {
        const { data: checkData } = await supabase
          .from('checklist_logs')
          .select('is_done')
          .gte('created_at', todayStr)
        if (checkData) {
          setChecklistProgress({
            total: checkData.length,
            done: checkData.filter((c: any) => c.is_done).length,
          })
        }
      } catch {}

      // Admin/Owner data
      if (isAdminRole(user!.role)) {
        const now = new Date()
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
        const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
        const weekAgoStr = format(weekAgo, 'yyyy-MM-dd')

        // Meals
        let mToday = 0, mWeek = 0, mMonth = 0
        try {
          const r1 = await supabase.from('worker_meals').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).eq('meal_date', todayStr)
          mToday = r1.count || 0
          const r2 = await supabase.from('worker_meals').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('meal_date', weekAgoStr)
          mWeek = r2.count || 0
          const r3 = await supabase.from('worker_meals').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('meal_date', monthStart)
          mMonth = r3.count || 0
        } catch {}

        // Issues
        let iToday = 0, iWeek = 0, iMonth = 0
        try {
          const r1 = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('created_at', todayStr)
          iToday = r1.count || 0
          const r2 = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('created_at', weekAgoStr)
          iWeek = r2.count || 0
          const r3 = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('created_at', monthStart)
          iMonth = r3.count || 0
        } catch {}

        // Shifts
        let sToday = 0, sWeek = 0, sMonth = 0
        try {
          const r1 = await supabase.from('schedule_shifts').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).eq('shift_date', todayStr)
          sToday = r1.count || 0
          const r2 = await supabase.from('schedule_shifts').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('shift_date', weekAgoStr).lte('shift_date', todayStr)
          sWeek = r2.count || 0
          const r3 = await supabase.from('schedule_shifts').select('*', { count: 'exact', head: true }).eq('location_id', user!.location_id).gte('shift_date', monthStart).lte('shift_date', todayStr)
          sMonth = r3.count || 0
        } catch {}

        setReportData({
          todayMeals: mToday, weekMeals: mWeek, monthMeals: mMonth,
          todayIssues: iToday, weekIssues: iWeek, monthIssues: iMonth,
          todayShiftsCount: sToday, weekShiftsCount: sWeek, monthShiftsCount: sMonth,
        })

        // Open tasks per worker
        try {
          const { data: openTasks } = await supabase.from('worker_tasks').select('assigned_to').eq('is_completed', false)
          if (openTasks && openTasks.length > 0) {
            const { data: allProfiles } = await supabase.from('profiles').select('id, full_name').eq('is_active', true)
            const countMap: Record<string, number> = {}
            openTasks.forEach(t => { if (t.assigned_to) countMap[t.assigned_to] = (countMap[t.assigned_to] || 0) + 1 })
            const result = Object.entries(countMap).map(([id, count]) => ({
              name: allProfiles?.find(p => p.id === id)?.full_name || '?',
              count,
            })).sort((a, b) => b.count - a.count)
            setTasksByWorker(result)
          }
        } catch {}

        // Recent issues (3 for pulse)
        try {
          const { data: issueData } = await supabase.from('issues').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(3)
          if (issueData) setRecentIssues(issueData)
        } catch {}

        // ALL issues this month (for summary)
        try {
          const { data: allIssueData } = await supabase.from('issues').select('id, title, status, created_at').eq('location_id', user!.location_id).gte('created_at', monthStart).order('created_at', { ascending: false })
          if (allIssueData) setAllIssues(allIssueData)
        } catch {}

        // Today's losses (for pulse)
        try {
          const { data: lossData } = await supabase.from('waste_logs').select('item_name, quantity, estimated_value, created_at').gte('created_at', todayStr)
          if (lossData) {
            const totalValue = lossData.reduce((s: number, l: any) => s + (l.estimated_value || 0), 0)
            setTodayLosses({ count: lossData.length, names: lossData.slice(0, 3).map((l: any) => l.item_name), totalValue })
          }
        } catch {}

        // ALL losses this month (for summary) — with estimated_value from food cost
        try {
          const { data: allLossData } = await supabase.from('waste_logs').select('item_name, quantity, estimated_value, created_at').eq('location_id', user!.location_id).gte('created_at', monthStart).order('created_at', { ascending: false })
          if (allLossData) setAllLosses(allLossData)
        } catch {}

        // Worker hours this month + rates from DB (hourly_rate column)
        try {
          const { data: monthClocks } = await supabase
            .from('clock_logs')
            .select('worker_id, hours_worked')
            .eq('location_id', user!.location_id)
            .gte('clock_date', monthStart)
            .not('hours_worked', 'is', null)

          if (monthClocks && monthClocks.length > 0) {
            const { data: allProfiles } = await supabase.from('profiles').select('id, full_name, hourly_rate, contract_type').eq('is_active', true)
            const hoursMap: Record<string, number> = {}
            monthClocks.forEach(c => {
              if (c.worker_id) hoursMap[c.worker_id] = (hoursMap[c.worker_id] || 0) + (c.hours_worked || 0)
            })
            const result = Object.entries(hoursMap).map(([id, hours]) => {
              const profile = allProfiles?.find(p => p.id === id)
              const name = profile?.full_name || '?'
              const rate = profile?.hourly_rate ?? 29
              const contract = profile?.contract_type || 'zlecenie'
              return { name, hours: Math.round(hours * 10) / 10, rate, cost: Math.round(hours * rate), contract }
            }).sort((a, b) => b.hours - a.hours)
            setWorkerHours(result)
          }
        } catch {}
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

        if (day === 0) {
          const weekNum = getWeekNumber(now)
          const { data: cleaningLogs } = await supabase
            .from('cleaning_logs')
            .select('id')
            .eq('week_number', weekNum)
            .eq('location_id', user!.location_id)
            .limit(1)
          if (!cleaningLogs || cleaningLogs.length === 0) {
            reminders.push('🧹 Niedziela — czas na tygodniowe sprzatanie!')
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

  // Belt system
  const BELT_LEVELS = [
    { min: 0,   label: 'Zolty pas',       color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', chefBg: 'bg-yellow-400' },
    { min: 10,  label: 'Pomaranczowy pas', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', chefBg: 'bg-orange-400' },
    { min: 25,  label: 'Zielony pas',     color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   chefBg: 'bg-green-500' },
    { min: 50,  label: 'Niebieski pas',   color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',     chefBg: 'bg-blue-500' },
    { min: 80,  label: 'Brazowy pas',     color: 'text-amber-800',  bg: 'bg-amber-50 border-amber-200',   chefBg: 'bg-amber-700' },
    { min: 120, label: 'Czarny pas',      color: 'text-gray-900',   bg: 'bg-gray-100 border-gray-300',    chefBg: 'bg-gray-800' },
  ]

  function getRank(name: string, stars: number) {
    const n = name.toLowerCase()
    if (n.includes('jakub')) return { icon: '🥷', label: 'NINJA', color: 'text-gray-900', bg: 'bg-gray-50 border-gray-200', chefBg: '' }
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

  // Quick action modules
  const quickActionMods = roleConfig.quickActions
    .map(href => roleConfig.modules.find(m => m.href === href))
    .filter(Boolean) as ModuleConfig[]

  // Checklist progress for quick action badge
  const checkDone = checklistProgress?.done || 0
  const checkTotal = checklistProgress?.total || 0

  // Total open tasks (for owner pulse)
  const totalOpenTasks = tasksByWorker.reduce((s, w) => s + w.count, 0)

  return (
    <div className="min-h-screen bg-stone-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* ─── Header ─────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${roleConfig.gradientFrom} ${roleConfig.gradientTo} flex items-center justify-center text-xl shadow-sm`}>
              {roleConfig.icon}
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {role === 'owner' ? 'Czesc, Jakub' : `Czesc, ${user.full_name.split(' ')[0]}`}
              </h1>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{user.location_name}</span>
                <span className="text-gray-200">·</span>
                <span className="text-xs text-gray-400 capitalize">{today}</span>
              </div>
            </div>
          </div>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 px-2 py-2">
            Wyloguj
          </button>
        </div>

        {/* ─── Reminder banner ──────────────────── */}
        {showReminder && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-3">
            {showReminder.split('\n').map((line, i) => (
              <p key={i} className="text-red-700 font-semibold text-sm">{line}</p>
            ))}
          </div>
        )}

        {/* ─── Clock Widget (only for workers, not owner/manager) ── */}
        {!isAdmin && (
          <ClockWidget user={user} todayShifts={todayShifts} todayClock={todayClock} onUpdate={() => {
            const todayStr = format(new Date(), 'yyyy-MM-dd')
            supabase.from('clock_logs')
              .select('worker_id, clock_in, clock_out, breaks')
              .eq('location_id', user.location_id)
              .eq('clock_date', todayStr)
              .then(({ data }) => { if (data) setTodayClock(data) })
          }} />
        )}

        {/* ─── Swap alert ───────────────────────── */}
        {pendingSwaps > 0 && (
          <Link href="/schedule" className="block rounded-2xl bg-amber-50 border border-amber-200 p-3.5 transition-all active:scale-[0.98]">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔄</span>
              <div>
                <div className="text-sm font-semibold text-amber-800">
                  {pendingSwaps} {pendingSwaps === 1 ? 'prosba' : 'prosby'} o zamiane zmian
                </div>
                <div className="text-xs text-amber-600">Kliknij zeby sprawdzic</div>
              </div>
            </div>
          </Link>
        )}

        {/* ─── OWNER PULSE (only for admin) ─────── */}
        {isAdmin && (
          <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Co sie dzieje teraz
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Checklist */}
              <Link href="/checklist" className="bg-emerald-50 rounded-xl p-3 active:scale-[0.97] transition-transform">
                <div className="text-xs text-gray-500">Checklist</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-gray-900">{checkDone}/{checkTotal || '–'}</span>
                </div>
                {checkTotal > 0 && (
                  <div className="w-full bg-emerald-100 rounded-full h-1.5 mt-2">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        checkDone === checkTotal ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}
                      style={{ width: `${checkTotal > 0 ? (checkDone / checkTotal * 100) : 0}%` }}
                    />
                  </div>
                )}
              </Link>

              {/* Tasks */}
              <Link href="/tasks" className="bg-amber-50 rounded-xl p-3 active:scale-[0.97] transition-transform">
                <div className="text-xs text-gray-500">Otwarte zadania</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-gray-900">{totalOpenTasks || pendingTasks}</span>
                </div>
                {tasksByWorker.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {tasksByWorker.slice(0, 2).map((w, i) => (
                      <div key={i} className="flex justify-between text-[10px]">
                        <span className="text-gray-500 truncate">{w.name}</span>
                        <span className="text-amber-700 font-bold">{w.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Link>

              {/* Losses */}
              <Link href="/straty" className="bg-rose-50 rounded-xl p-3 active:scale-[0.97] transition-transform">
                <div className="text-xs text-gray-500">Straty dzis</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-gray-900">{todayLosses.count}</span>
                  {todayLosses.totalValue ? (
                    <span className="text-xs text-rose-600 font-semibold">{todayLosses.totalValue.toFixed(0)} zl</span>
                  ) : (
                    <span className="text-xs text-gray-400">szt</span>
                  )}
                </div>
                {todayLosses.names.length > 0 && (
                  <div className="text-[10px] text-gray-400 mt-1 truncate">
                    {todayLosses.names.join(', ')}
                  </div>
                )}
              </Link>

              {/* Issues */}
              <Link href="/awarie" className="bg-orange-50 rounded-xl p-3 active:scale-[0.97] transition-transform">
                <div className="text-xs text-gray-500">Awarie</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-gray-900">{reportData.todayIssues}</span>
                  <span className="text-xs text-gray-400">dzis</span>
                </div>
                {recentIssues.length > 0 && (
                  <div className="text-[10px] text-gray-400 mt-1 truncate">
                    {recentIssues[0]?.title}
                  </div>
                )}
              </Link>
            </div>
          </div>
        )}

        {/* ─── Quick Actions (2 hero cards) ──────── */}
        {!isAdmin && (
          <div className="grid grid-cols-2 gap-3">
            {quickActionMods.map(mod => {
              const isCheck = mod.href === '/checklist'
              const isTask = mod.href === '/tasks'
              return (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className={`block rounded-2xl border p-4 shadow-sm bg-white transition-all active:scale-[0.97] ${
                    isTask && pendingTasks > 0 ? 'border-amber-300' : 'border-gray-200'
                  }`}
                >
                  <span className="text-3xl">{mod.icon}</span>
                  <div className="mt-2">
                    <div className="text-sm font-bold text-gray-900">{mod.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {isCheck && checkTotal > 0
                        ? `${checkDone}/${checkTotal} zrobione`
                        : isTask && pendingTasks > 0
                        ? `${pendingTasks} ${pendingTasks === 1 ? 'nowe' : 'nowych'}`
                        : mod.subtitle
                      }
                    </div>
                  </div>
                  {isTask && pendingTasks > 0 && (
                    <span className="absolute top-3 right-3 bg-amber-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {pendingTasks}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        {/* ─── Today's staff (admin always, worker pre-clock) */}
        {todayShifts.length > 0 && (isAdmin || !todayClock.find(c => c.worker_id === user.id)) && (
          <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Kto dzisiaj pracuje
              </h2>
              <Link href="/schedule" className="text-xs text-gray-400 font-medium">
                Grafik →
              </Link>
            </div>

            {(() => {
              const kitchenCount = todayShifts.filter(s => s.department === 'kitchen').length
              const hallCount = todayShifts.filter(s => s.department === 'hall').length
              const understaffed = kitchenCount < minKitchen || hallCount < minHall
              if (!understaffed) return null
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs font-semibold text-red-700">
                  ⚠️ Brak obsady! Kuchnia: {kitchenCount}/{minKitchen} · Sala: {hallCount}/{minHall}
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
                    isKitchen ? 'bg-orange-50/60' : 'bg-violet-50/60'
                  } ${isMe ? 'ring-1 ring-emerald-300' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] text-white px-1.5 py-0.5 rounded font-bold ${
                        isKitchen ? 'bg-orange-400' : 'bg-violet-400'
                      }`}>
                        {isKitchen ? 'KU' : 'SA'}
                      </span>
                      <span className={`text-sm ${isMe ? 'font-bold' : 'font-medium'} text-gray-700`}>
                        {s.worker_name} {isMe ? '(Ty)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}
                      </span>
                      {clock?.clock_in && !clock?.clock_out && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                      {clock?.clock_out && (
                        <span className="text-[10px] text-emerald-600 font-bold">OK</span>
                      )}
                      {!clock && (
                        <span className="w-2 h-2 rounded-full bg-gray-200" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── Module Sections (grouped) ──────────── */}
        <div className="space-y-4">
          {roleConfig.sections.map((section, si) => (
            <div key={si}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                {section.title}
              </h3>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">
                {section.items.map((mod, mi) => {
                  const isTask = mod.href === '/tasks'
                  const hasPending = isTask && pendingTasks > 0
                  return (
                    <Link
                      key={mi}
                      href={mod.href}
                      className="flex items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-gray-50"
                    >
                      <span className="text-2xl w-8 text-center">{mod.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900">{mod.title}</div>
                        <div className="text-xs text-gray-400 truncate">{mod.subtitle}</div>
                      </div>
                      {hasPending && (
                        <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {pendingTasks}
                        </span>
                      )}
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Rank + Stars ───────────────────────── */}
        <Link href="/stars" className={`block rounded-2xl border bg-white shadow-sm p-4 transition-all active:scale-[0.98] ${rank.bg}`}>
          <div className="flex items-center gap-3">
            {rank.chefBg ? (
              <div className={`w-11 h-11 rounded-xl ${rank.chefBg} flex items-center justify-center`}>
                <span className="text-lg">👨‍🍳</span>
              </div>
            ) : (
              <span className="text-3xl">{rank.icon}</span>
            )}
            <div className="flex-1">
              <div className="font-semibold text-sm text-gray-900">{user.full_name}</div>
              <div className={`text-xs font-semibold ${rank.color}`}>{rank.label}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900">⭐ {starCount}</div>
              <div className="text-xs text-gray-400">{isAdmin ? 'Zarzadzaj' : 'Pochwaly'}</div>
            </div>
          </div>
        </Link>

        {/* ─── Podsumowanie miesiaca (klikalna kafelka) ── */}
        {isAdmin && (
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setSummaryOpen(!summaryOpen)}
              className="w-full flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Podsumowanie miesiaca</div>
                  <div className="text-xs text-gray-400">
                    Usterki · Straty · Godziny · Koszty
                  </div>
                </div>
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${summaryOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {summaryOpen && (
              <div className="border-t border-gray-100 px-4 pb-4 space-y-4">

                {/* ── Godziny pracownikow + stawki ── */}
                <div className="pt-3">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Godziny i koszty (umowa zlecenie)
                  </div>
                  {workerHours.length > 0 ? (
                    <div className="space-y-2">
                      {workerHours.map((w, i) => (
                        <div key={i} className="bg-stone-50 rounded-xl px-3.5 py-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-900">{w.name}</span>
                            <span className="text-sm font-bold text-gray-900">{w.cost} zl</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-400">{w.rate} zl/h · umowa {w.contract}</span>
                            <span className="text-xs text-gray-500">{w.hours}h w tym miesiacu</span>
                          </div>
                          {/* Progress bar (max ~176h = 22 days * 8h) */}
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                            <div
                              className="h-1.5 rounded-full bg-blue-400"
                              style={{ width: `${Math.min(100, (w.hours / 176) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {/* Total */}
                      <div className="flex items-center justify-between bg-gray-900 text-white rounded-xl px-3.5 py-3 mt-1">
                        <span className="text-sm font-semibold">Razem</span>
                        <div className="text-right">
                          <div className="text-sm font-bold">{workerHours.reduce((s, w) => s + w.cost, 0)} zl</div>
                          <div className="text-[10px] text-gray-400">{workerHours.reduce((s, w) => s + w.hours, 0).toFixed(1)}h</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300 text-center py-3">Brak danych o godzinach</div>
                  )}
                </div>

                {/* ── Wszystkie usterki ── */}
                <div>
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Usterki w tym miesiacu ({allIssues.length})
                  </div>
                  {allIssues.length > 0 ? (
                    <div className="space-y-1.5">
                      {allIssues.map((issue) => (
                        <div key={issue.id} className="flex items-center justify-between bg-red-50/60 rounded-xl px-3.5 py-2.5">
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="text-sm text-gray-800 truncate">{issue.title}</div>
                            <div className="text-[10px] text-gray-400">
                              {new Date(issue.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            issue.status === 'resolved' ? 'bg-emerald-100 text-emerald-700'
                              : issue.status === 'in_progress' ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {issue.status === 'resolved' ? 'OK' : issue.status === 'in_progress' ? 'W toku' : 'Nowa'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300 text-center py-3">Brak usterek</div>
                  )}
                </div>

                {/* ── Wszystkie straty ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Straty w tym miesiacu ({allLosses.length})
                    </div>
                    {allLosses.some(l => l.estimated_value) && (
                      <span className="text-xs font-bold text-rose-600">
                        {allLosses.reduce((s, l) => s + (l.estimated_value || 0), 0).toFixed(0)} zl
                      </span>
                    )}
                  </div>
                  {allLosses.length > 0 ? (
                    <div className="space-y-1.5">
                      {allLosses.map((loss, i) => (
                        <div key={i} className="flex items-center justify-between bg-rose-50/60 rounded-xl px-3.5 py-2.5">
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="text-sm text-gray-800">{loss.item_name}</div>
                            <div className="text-[10px] text-gray-400">
                              {new Date(loss.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                          <div className="text-right">
                            {loss.estimated_value ? (
                              <span className="text-xs font-semibold text-rose-600">{loss.estimated_value.toFixed(2)} zl</span>
                            ) : loss.quantity > 0 ? (
                              <span className="text-xs font-semibold text-rose-600">{loss.quantity} szt</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300 text-center py-3">Brak strat</div>
                  )}
                </div>

                {/* ── Posilki i zmiany (mini) ── */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-orange-50/60 rounded-xl p-2.5 text-center">
                    <div className="text-[10px] text-gray-400">Posilki</div>
                    <div className="text-lg font-bold text-gray-900">{reportData.monthMeals}</div>
                    <div className="text-[10px] text-gray-400">w miesiacu</div>
                  </div>
                  <div className="bg-violet-50/60 rounded-xl p-2.5 text-center">
                    <div className="text-[10px] text-gray-400">Zmiany</div>
                    <div className="text-lg font-bold text-gray-900">{reportData.monthShiftsCount}</div>
                    <div className="text-[10px] text-gray-400">w miesiacu</div>
                  </div>
                  <div className="bg-red-50/60 rounded-xl p-2.5 text-center">
                    <div className="text-[10px] text-gray-400">Usterki</div>
                    <div className="text-lg font-bold text-gray-900">{reportData.monthIssues}</div>
                    <div className="text-[10px] text-gray-400">w miesiacu</div>
                  </div>
                </div>

                {/* ── Pobierz PDF ── */}
                <button
                  onClick={async () => {
                    setPdfLoading(true)
                    try {
                      const now = new Date()
                      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                      const res = await fetch('/api/summary-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          locationId: user.location_id,
                          userId: user.id,
                          month: monthStr,
                        }),
                      })
                      if (!res.ok) throw new Error('Blad generowania PDF')
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `Podsumowanie_${monthStr}.pdf`
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch (err: any) {
                      alert(err.message || 'Blad PDF')
                    }
                    setPdfLoading(false)
                  }}
                  disabled={pdfLoading}
                  className="w-full mt-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 rounded-xl text-sm active:scale-[0.97] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {pdfLoading ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Generowanie...
                    </>
                  ) : (
                    <>
                      📄 Pobierz PDF podsumowania
                    </>
                  )}
                </button>

              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Clock Widget ──────────────────────────────────────────
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

  const todayStr = format(now, 'yyyy-MM-dd')

  // Default shift times (fallback when no shift in schedule)
  const defaultStart = '11:00'
  const defaultEnd = '21:00'
  const startTime = myShift?.start_time || defaultStart
  const endTime = myShift?.end_time || defaultEnd

  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm)
  const shiftEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em)
  const msToStart = shiftStart.getTime() - now.getTime()
  const msToEnd = shiftEnd.getTime() - now.getTime()

  // Always show clock in — even without shift in schedule
  const showClockIn = !myClock?.clock_in
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

  // CLOCK IN button
  if (showClockIn) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400">Twoja zmiana</div>
            <div className="text-sm font-bold text-gray-900">
              {startTime.slice(0,5)} — {endTime.slice(0,5)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Start za</div>
            <div className="text-sm font-bold text-emerald-600">
              {msToStart > 0 ? fmtCountdown(msToStart) : 'TERAZ'}
            </div>
          </div>
        </div>
        <button
          onClick={handleClockIn}
          disabled={saving}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl text-lg shadow-sm active:scale-[0.97] disabled:opacity-50 transition-all"
        >
          {saving ? '...' : 'Rozpocznij zmiane'}
        </button>
      </div>
    )
  }

  // WORKING — compact view with break/clock out
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
        const idx = currentBreaks.findIndex(b => !b.end)
        if (idx >= 0) currentBreaks[idx] = { ...currentBreaks[idx], end: new Date().toISOString() }
      } else {
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

    // ON BREAK
    if (onBreak && activeBreak) {
      const breakStart = new Date(activeBreak.start)
      const breakElapsed = Math.floor((now.getTime() - breakStart.getTime()) / 60000)
      return (
        <div className="rounded-2xl bg-white border border-amber-200 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-semibold text-amber-600">Na przerwie</span>
            </div>
            <div className={`text-base font-bold ${overLimit ? 'text-red-600' : 'text-amber-600'}`}>
              {breakElapsed}m{breakLimit > 0 ? ` / ${breakLimit}m` : ''}
            </div>
          </div>
          {overLimit && (
            <p className="text-[10px] text-red-500 text-center">
              ⚠️ Przekroczony limit przerwy
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleBreakToggle}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm active:scale-[0.97] disabled:opacity-50 transition-all"
            >
              {saving ? '...' : 'Koniec przerwy'}
            </button>
            <button
              onClick={handleClockOut}
              disabled={saving}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl text-sm active:scale-[0.97] disabled:opacity-50 transition-all"
            >
              Zakoncz zmiane
            </button>
          </div>
        </div>
      )
    }

    // WORKING
    return (
      <div className={`rounded-2xl bg-white border p-4 space-y-3 shadow-sm ${showOutSoon ? 'border-amber-300' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-gray-500">
              W pracy od {clockInTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <span className="text-sm font-bold text-gray-900">{fmtCountdown(elapsed)}</span>
        </div>

        {breakLimit > 0 && usedMinutes > 0 && (
          <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-1.5">
            <span className="text-[10px] text-amber-600">Wykorzystana przerwa</span>
            <span className={`text-xs font-bold ${overLimit ? 'text-red-600' : 'text-amber-700'}`}>
              {usedMinutes}m / {breakLimit}m
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleBreakToggle}
            disabled={saving || overLimit}
            className="bg-amber-100 hover:bg-amber-200 text-amber-700 font-semibold py-2.5 rounded-xl text-sm active:scale-[0.97] disabled:opacity-40 transition-all"
          >
            {saving ? '...' : '☕ Przerwa'}
          </button>
          <button
            onClick={handleClockOut}
            disabled={saving}
            className={`font-semibold py-2.5 rounded-xl text-sm active:scale-[0.97] disabled:opacity-50 transition-all ${
              showOutSoon
                ? 'bg-red-100 hover:bg-red-200 text-red-700'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
          >
            Zakoncz zmiane
          </button>
        </div>

        {showOutSoon && (
          <p className="text-[10px] text-amber-600 text-center">
            Zmiana konczy sie za {fmtCountdown(msToEnd)}
          </p>
        )}
      </div>
    )
  }

  // DONE for today
  if (myClock?.clock_in && myClock?.clock_out) {
    const inTime = new Date(myClock.clock_in)
    const outTime = new Date(myClock.clock_out)
    const hours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60)
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-xs text-gray-500">
              Dzisiaj: <span className="font-bold text-gray-700">{hours.toFixed(1)}h</span>
            </span>
          </div>
          <span className="text-[10px] text-gray-400">
            {inTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} – {outTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    )
  }

  return null
}
