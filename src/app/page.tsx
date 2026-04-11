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
                Cześć, {user.full_name.split(' ')[0]}! 👋
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
