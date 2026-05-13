'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { pl } from 'date-fns/locale'

interface Meal {
  id: string
  profile_id: string
  meal_date: string
  menu_number: string | null
  menu_description: string | null
  created_at: string
}

interface MenuItem {
  id: string
  number: string
  name: string
  category: string
}

interface MealStat {
  name: string
  count: number
  profileId: string
}

const CAT_ICONS: Record<string, string> = {
  danie: '🍛',
  zupa: '🥣',
  deser: '🍰',
  napoj: '🥤',
}

export default function MealsPage() {
  const { user, loading: authLoading } = useUser()
  const [todayCount, setTodayCount] = useState(0)
  const [todayMeals, setTodayMeals] = useState<Meal[]>([])
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null)
  const [menuNumber, setMenuNumber] = useState('')
  const [menuDesc, setMenuDesc] = useState('')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [monthStats, setMonthStats] = useState<MealStat[]>([])
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [allMeals, setAllMeals] = useState<Meal[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null)

  const isAdmin = user ? isAdminRole(user.role) : false
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (authLoading || !user) return
    loadTodayMeals()
    loadProfiles()
    loadMenuItems()
  }, [user, authLoading])

  useEffect(() => {
    if (!user || Object.keys(profiles).length === 0) return
    if (isAdmin) loadMonthStats()
  }, [user, selectedMonth, profiles])

  async function loadMenuItems() {
    const { data } = await supabase
      .from('staff_menu')
      .select('id, number, name, category')
      .eq('location_id', user!.location_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('number', { ascending: true })

    setMenuItems(data || [])
  }

  async function loadProfiles() {
    const { data: links } = await supabase
      .from('user_locations')
      .select('user_id')
      .eq('location_id', user!.location_id)

    const userIds = (links || []).map(l => l.user_id)
    if (userIds.length === 0) { setProfiles({}); return }

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .in('id', userIds)
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

  function selectMenuItem(item: MenuItem) {
    setSelectedMenuId(item.id)
    setMenuNumber(item.number)
    setMenuDesc(item.name)
  }

  function clearSelection() {
    setSelectedMenuId(null)
    setMenuNumber('')
    setMenuDesc('')
  }

  async function addMeal() {
    if (!user) return
    if (!menuNumber.trim()) { alert('Wybierz danie z menu'); return }
    setAdding(true)

    const { error } = await supabase.from('worker_meals').insert({
      profile_id: user.id,
      location_id: user.location_id,
      meal_date: today,
      menu_number: menuNumber.trim(),
      menu_description: menuDesc.trim() || null,
    })

    if (error) {
      alert('Blad: ' + error.message)
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
            menu_number: menuNumber.trim(),
            menu_description: menuDesc.trim() || '',
          },
        }),
      }).catch(() => {})

      clearSelection()
      setShowForm(false)
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

  // Group meals by dish for a specific worker
  function workerDishBreakdown(profileId: string) {
    const workerMeals = allMeals.filter(m => m.profile_id === profileId)
    const dishes: Record<string, { name: string; count: number }> = {}
    workerMeals.forEach(m => {
      const key = m.menu_number || '?'
      const label = m.menu_description || m.menu_number || 'Brak danych'
      if (!dishes[key]) dishes[key] = { name: label, count: 0 }
      dishes[key].count++
    })
    return Object.entries(dishes)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([num, d]) => ({ number: num, name: d.name, count: d.count }))
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-brand-600 font-medium text-sm">&larr; Powrot</Link>
          {isAdmin && (
            <Link href="/meals/menu" className="text-brand-600 font-medium text-sm">
              Zarzadzaj menu &rarr;
            </Link>
          )}
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">🍽️ Posilek pracowniczy</h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, d MMMM', { locale: pl })}</p>
        </div>

        {/* Big + button */}
        <div className="card text-center py-8">
          <div className="text-6xl font-bold text-brand-500 mb-2">{todayCount}</div>
          <p className="text-gray-400 text-sm mb-6">
            {todayCount === 0 ? 'Brak posiłków dzisiaj' :
             todayCount === 1 ? 'posilek dzisiaj' :
             todayCount < 5 ? 'posilki dzisiaj' : 'posilkow dzisiaj'}
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
              onClick={() => setShowForm(true)}
              disabled={adding}
              className="w-20 h-20 rounded-3xl bg-brand-500 text-white text-4xl font-bold hover:bg-brand-600 active:scale-95 transition-transform shadow-lg disabled:opacity-50"
            >
              {adding ? '...' : '+'}
            </button>
          </div>

          {/* Meal selection form */}
          {showForm && (
            <div className="mt-6 space-y-3 text-left">

              {menuItems.length > 0 ? (
                <>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Wybierz danie z menu *</label>
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                    {menuItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => selectMenuItem(item)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                          selectedMenuId === item.id
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-xl">{CAT_ICONS[item.category] || '🍛'}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-brand-600">#{item.number}</span>
                          <span className="ml-2 text-sm font-medium text-gray-800">{item.name}</span>
                        </div>
                        {selectedMenuId === item.id && (
                          <span className="text-brand-500 text-lg">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Numer dania z menu *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={menuNumber}
                      onChange={e => setMenuNumber(e.target.value)}
                      placeholder="np. 12"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none text-lg"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Opis (opcjonalnie)</label>
                    <input
                      type="text"
                      value={menuDesc}
                      onChange={e => setMenuDesc(e.target.value)}
                      placeholder="np. Kurczak teriyaki z ryzem"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setShowForm(false); clearSelection() }}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium"
                >
                  Anuluj
                </button>
                <button
                  onClick={addMeal}
                  disabled={adding || !menuNumber.trim()}
                  className="flex-1 py-3 rounded-xl bg-brand-500 text-white font-bold disabled:opacity-50"
                >
                  {adding ? 'Zapisuje...' : 'Zapisz posilek'}
                </button>
              </div>
            </div>
          )}

          {/* Today's meals with dish names */}
          {todayMeals.length > 0 && (
            <div className="mt-4 space-y-1">
              {todayMeals.map(m => (
                <p key={m.id} className="text-xs text-gray-400">
                  🍽️ {format(new Date(m.created_at), 'HH:mm')}
                  {m.menu_description && <span className="text-gray-500 ml-1">— {m.menu_description}</span>}
                  {!m.menu_description && m.menu_number && <span className="text-gray-500 ml-1">— #{m.menu_number}</span>}
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
                <span className="text-xl">&laquo;</span>
              </button>
              <div className="text-center">
                <div className="font-bold text-sm capitalize">{monthLabel}</div>
                <div className="text-xs text-gray-400">Lacznie: {totalThisMonth} posilkow</div>
              </div>
              <button
                onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-transform"
              >
                <span className="text-xl">&raquo;</span>
              </button>
            </div>

            {/* Stats per worker — expandable with dish breakdown */}
            <div className="card">
              <h2 className="font-bold text-sm text-gray-700 mb-3">📊 Statystyki — kto ile zjadl</h2>
              {monthStats.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-4">Brak danych w tym miesiacu</p>
              ) : (
                <div className="space-y-2">
                  {monthStats.map(stat => {
                    const maxCount = monthStats[0]?.count || 1
                    const pct = Math.round((stat.count / maxCount) * 100)
                    const isExpanded = expandedWorker === stat.profileId
                    const dishes = isExpanded ? workerDishBreakdown(stat.profileId) : []

                    return (
                      <div key={stat.profileId}>
                        <button
                          onClick={() => setExpandedWorker(isExpanded ? null : stat.profileId)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700 flex items-center gap-1">
                              {stat.name}
                              <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                            </span>
                            <span className="font-bold text-brand-600">{stat.count}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="bg-brand-400 h-2 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </button>

                        {isExpanded && dishes.length > 0 && (
                          <div className="ml-4 mt-2 mb-3 space-y-1">
                            {dishes.map((d, i) => (
                              <div key={i} className="flex items-center justify-between text-xs text-gray-500">
                                <span>
                                  <span className="text-brand-500 font-bold">#{d.number}</span>{' '}
                                  {d.name}
                                </span>
                                <span className="font-bold text-gray-600">{d.count}x</span>
                              </div>
                            ))}
                          </div>
                        )}
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
