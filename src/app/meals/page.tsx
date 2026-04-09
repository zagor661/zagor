'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, addMonths } from 'date-fns'
import { pl } from 'date-fns/locale'

interface Meal {
  id: string
  profile_id: string
  meal_date: string
  created_at: string
}

interface MealStat {
  name: string
  count: number
  profileId: string
}

export default function MealsPage() {
  const { user, loading: authLoading } = useUser()
  const [todayCount, setTodayCount] = useState(0)
  const [todayMeals, setTodayMeals] = useState<Meal[]>([])
  const [adding, setAdding] = useState(false)
  const [monthStats, setMonthStats] = useState<MealStat[]>([])
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [allMeals, setAllMeals] = useState<any[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (authLoading || !user) return
    loadTodayMeals()
    loadProfiles()
  }, [user, authLoading])

  useEffect(() => {
    if (!user || Object.keys(profiles).length === 0) return
    if (isAdmin) loadMonthStats()
  }, [user, selectedMonth, profiles])

  async function loadProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
    if (data) {
      const map: Record<string, string> = {}
      data.forEach(p => { map[p.id] = p.full_name })
      setProfiles(map)
    }
  }

  async function loadTodayMeals() {
    const { data } = await supabase
      .from('worker_meals')
      .select('*')
      .eq('profile_id', user!.id)
      .eq('meal_date', today)
      .order('created_at', { ascending: false })

    if (data) {
      setTodayMeals(data)
      setTodayCount(data.length)
    }
  }

  async function loadMonthStats() {
    const start = format(startOfMonth(selectedMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(selectedMonth), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('worker_meals')
      .select('*')
      .eq('location_id', user!.location_id)
      .gte('meal_date', start)
      .lte('meal_date', end)
      .order('created_at', { ascending: false })

    if (data) {
      setAllMeals(data)

      // Count per worker
      const counts: Record<string, number> = {}
      data.forEach(m => {
        counts[m.profile_id] = (counts[m.profile_id] || 0) + 1
      })

      const stats: MealStat[] = Object.entries(counts)
        .map(([id, count]) => ({
          name: profiles[id] || 'Nieznany',
          count,
          profileId: id,
        }))
        .sort((a, b) => b.count - a.count)

      setMonthStats(stats)
    }
  }

  async function addMeal() {
    if (!user) return
    setAdding(true)

    const { error } = await supabase.from('worker_meals').insert({
      profile_id: user.id,
      location_id: user.location_id,
      meal_date: today,
    })

    if (error) {
      alert('Błąd: ' + error.message)
    } else {
      fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'meal',
          data: {
            created_at: new Date().toISOString(),
            location: user.location_name,
            worker: user.full_name,
            meal_date: today,
          },
        }),
      }).catch(() => {})

      await loadTodayMeals()
      if (isAdmin) loadMonthStats()
    }
    setAdding(false)
  }

  async function removeLast() {
    if (todayMeals.length === 0) return
    const last = todayMeals[0]
    await supabase.from('worker_meals').delete().eq('id', last.id)
    await loadTodayMeals()
    if (isAdmin) loadMonthStats()
  }

  if (authLoading || !user) return null

  const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: pl })
  const totalThisMonth = monthStats.reduce((s, m) => s + m.count, 0)

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-brand-600 font-medium text-sm">← Powrót</Link>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">🍽️ Posiłek pracowniczy</h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, d MMMM', { locale: pl })}</p>
        </div>

        {/* Big + button */}
        <div className="card text-center py-8">
          <div className="text-6xl font-bold text-brand-500 mb-2">{todayCount}</div>
          <p className="text-gray-400 text-sm mb-6">
            {todayCount === 0 ? 'Brak posiłków dzisiaj' :
             todayCount === 1 ? 'posiłek dzisiaj' :
             todayCount < 5 ? 'posiłki dzisiaj' : 'posiłków dzisiaj'}
          </p>

          <div className="flex items-center justify-center gap-4">
            {todayCount > 0 && (
              <button
                onClick={removeLast}
                className="w-14 h-14 rounded-2xl bg-red-100 text-red-500 text-2xl font-bold hover:bg-red-200 active:scale-95 transition-transform"
              >
                −
              </button>
            )}
            <button
              onClick={addMeal}
              disabled={adding}
              className="w-20 h-20 rounded-3xl bg-brand-500 text-white text-4xl font-bold hover:bg-brand-600 active:scale-95 transition-transform shadow-lg disabled:opacity-50"
            >
              {adding ? '...' : '+'}
            </button>
          </div>

          {todayMeals.length > 0 && (
            <div className="mt-4 space-y-1">
              {todayMeals.map((m, i) => (
                <p key={m.id} className="text-xs text-gray-400">
                  🍽️ {format(new Date(m.created_at), 'HH:mm')}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Admin stats */}
        {isAdmin && (
          <>
            {/* Month navigation */}
            <div className="card flex items-center justify-between">
              <button
                onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-transform"
              >
                <span className="text-xl">◀</span>
              </button>
              <div className="text-center">
                <div className="font-bold text-sm capitalize">{monthLabel}</div>
                <div className="text-xs text-gray-400">Łącznie: {totalThisMonth} posiłków</div>
              </div>
              <button
                onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-transform"
              >
                <span className="text-xl">▶</span>
              </button>
            </div>

            {/* Stats per worker */}
            <div className="card">
              <h2 className="font-bold text-sm text-gray-700 mb-3">📊 Statystyki — kto ile zjadł</h2>
              {monthStats.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-4">Brak danych w tym miesiącu</p>
              ) : (
                <div className="space-y-2">
                  {monthStats.map(stat => {
                    const maxCount = monthStats[0]?.count || 1
                    const pct = Math.round((stat.count / maxCount) * 100)
                    return (
                      <div key={stat.profileId}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{stat.name}</span>
                          <span className="font-bold text-brand-600">{stat.count}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-brand-400 h-2 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
