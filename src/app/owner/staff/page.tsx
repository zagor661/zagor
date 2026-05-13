'use client'
import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/lib/useUser'
import supabase from '@/lib/supabase'

interface Worker {
  id: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
  hourly_rate?: number
  contract_type?: string
}

interface WorkerStats {
  name: string
  tasksTotal: number
  tasksDone: number
  mealsThisMonth: number
  checklistsToday: number
  hoursMonth: number
  costMonth: number
  starsCount: number
}

interface WorkTime {
  employee_name?: string
  employee?: { first_name?: string; last_name?: string; name?: string }
  started_at?: string
  finished_at?: string
  duration?: number
}

type Tab = 'overview' | 'hours' | 'meals'

export default function StaffPage() {
  const { user } = useUser()
  const [tab, setTab] = useState<Tab>('overview')
  const [workers, setWorkers] = useState<Worker[]>([])
  const [stats, setStats] = useState<Record<string, WorkerStats>>({})
  const [workTimes, setWorkTimes] = useState<WorkTime[]>([])
  const [mealDetails, setMealDetails] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!user?.location_id) return
    setLoading(true)

    try {
      const today = new Date().toISOString().split('T')[0]
      const monthStart = today.slice(0, 7) + '-01'
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

      const [profilesRes, tasksRes, mealsRes, checklistsRes, starsRes, mealDetailsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, is_active, created_at, hourly_rate, contract_type').order('full_name'),
        supabase.from('worker_tasks').select('assigned_to_name, is_completed').eq('location_id', user.location_id).gte('created_at', weekAgo),
        supabase.from('worker_meals').select('worker_name').eq('location_id', user.location_id).gte('meal_date', monthStart),
        supabase.from('checklist_logs').select('completed_by_name').eq('location_id', user.location_id).gte('created_at', today),
        supabase.from('worker_stars').select('worker_name:assigned_to_name, count').eq('location_id', user.location_id),
        supabase.from('worker_meals').select('worker_name, menu_description, meal_date, created_at').eq('location_id', user.location_id).gte('meal_date', monthStart).order('created_at', { ascending: false }),
      ])

      // GoPOS work times
      let wtData: WorkTime[] = []
      try {
        const wtRes = await fetch(`/api/gopos?action=work_times_all&date_start=${monthStart}&date_end=${today}`)
        if (wtRes.ok) {
          const wtJson = await wtRes.json()
          wtData = wtJson.data || []
        }
      } catch {}

      const profiles = (profilesRes.data || []) as Worker[]
      setWorkers(profiles)
      setWorkTimes(wtData)
      setMealDetails(mealDetailsRes.data || [])

      const statsMap: Record<string, WorkerStats> = {}
      for (const p of profiles) {
        statsMap[p.full_name] = {
          name: p.full_name,
          tasksTotal: 0, tasksDone: 0,
          mealsThisMonth: 0, checklistsToday: 0,
          hoursMonth: 0, costMonth: 0, starsCount: 0,
        }
      }

      for (const t of tasksRes.data || []) {
        if (statsMap[t.assigned_to_name]) {
          statsMap[t.assigned_to_name].tasksTotal++
          if (t.is_completed) statsMap[t.assigned_to_name].tasksDone++
        }
      }

      for (const m of mealsRes.data || []) {
        if (statsMap[m.worker_name]) statsMap[m.worker_name].mealsThisMonth++
      }

      for (const c of checklistsRes.data || []) {
        if (statsMap[c.completed_by_name]) statsMap[c.completed_by_name].checklistsToday++
      }

      // Work times → hours
      for (const wt of wtData) {
        const empName = wt.employee_name || wt.employee?.name || `${wt.employee?.first_name || ''} ${wt.employee?.last_name || ''}`.trim()
        const matchKey = Object.keys(statsMap).find(k => {
          const kLower = k.toLowerCase()
          const eLower = empName.toLowerCase()
          return kLower === eLower || kLower.includes(eLower) || eLower.includes(kLower)
        })
        if (matchKey && wt.duration) {
          const hours = wt.duration / 3600
          statsMap[matchKey].hoursMonth += hours
          const w = profiles.find(p => p.full_name === matchKey)
          statsMap[matchKey].costMonth += hours * (w?.hourly_rate || 0)
        }
      }

      for (const s of starsRes.data || []) {
        const key = (s as any).worker_name
        if (key && statsMap[key]) statsMap[key].starsCount = (s as any).count || 0
      }

      setStats(statsMap)
    } catch (err) {
      console.error('Staff fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.location_id])

  useEffect(() => { fetchData() }, [fetchData])

  const roleLabel = (role: string) => {
    const map: Record<string, string> = { kitchen: 'Kuchnia', hall: 'Sala', manager: 'Menager', owner: 'Wlasciciel' }
    return map[role] || role
  }

  const roleColor = (role: string) => {
    const map: Record<string, string> = {
      kitchen: 'from-orange-500 to-red-500',
      hall: 'from-blue-500 to-cyan-500',
      manager: 'from-purple-500 to-pink-500',
      owner: 'from-amber-500 to-yellow-500',
    }
    return map[role] || 'from-gray-500 to-gray-600'
  }

  const activeWorkers = workers.filter(w => w.is_active)
  const inactiveWorkers = workers.filter(w => !w.is_active)
  const totalHours = Object.values(stats).reduce((s, st) => s + st.hoursMonth, 0)
  const totalCost = Object.values(stats).reduce((s, st) => s + st.costMonth, 0)
  const totalMeals = Object.values(stats).reduce((s, st) => s + st.mealsThisMonth, 0)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Zespol</h1>
          <p className="text-gray-500 text-sm mt-1">{activeWorkers.length} aktywnych pracownikow</p>
        </div>
        <div className="flex gap-2">
          {([['overview', 'Przeglad'], ['hours', 'Godziny'], ['meals', 'Posilki']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                tab === key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4 animate-pulse">👥</div>
          <p className="text-gray-500 text-sm">Ladowanie zespolu...</p>
        </div>
      ) : (
        <>
          {/* ═══ OVERVIEW ═══ */}
          {tab === 'overview' && (
            <>
              {/* KPI */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Pracownicy</p>
                  <p className="text-2xl font-black text-white">{activeWorkers.length}</p>
                  <p className="text-gray-600 text-[10px] mt-1">aktywnych</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Godziny (miesiac)</p>
                  <p className="text-2xl font-black text-white">{Math.round(totalHours)}h</p>
                  <p className="text-gray-600 text-[10px] mt-1">z GoPOS</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Koszty pracy</p>
                  <p className="text-2xl font-black bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                    {Math.round(totalCost).toLocaleString('pl')} zl
                  </p>
                  <p className="text-gray-600 text-[10px] mt-1">ten miesiac</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Posilki</p>
                  <p className="text-2xl font-black text-white">{totalMeals}</p>
                  <p className="text-gray-600 text-[10px] mt-1">ten miesiac</p>
                </div>
              </div>

              {/* Worker Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {activeWorkers.map(w => {
                  const s = stats[w.full_name]
                  return (
                    <div
                      key={w.id}
                      className={`bg-gray-900 border rounded-2xl p-6 hover:border-gray-700 transition-all cursor-pointer ${
                        selectedWorker === w.id ? 'border-indigo-500' : 'border-gray-800'
                      }`}
                      onClick={() => setSelectedWorker(selectedWorker === w.id ? null : w.id)}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleColor(w.role)} flex items-center justify-center text-white font-bold text-sm`}>
                          {w.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-sm">{w.full_name}</h3>
                          <p className="text-gray-500 text-xs">{roleLabel(w.role)} {w.contract_type ? `• ${w.contract_type}` : ''}</p>
                        </div>
                        <div className="ml-auto">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                        </div>
                      </div>

                      {s && (
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Godziny (miesiac)</span>
                            <span className="text-white font-bold">{s.hoursMonth.toFixed(1)}h</span>
                          </div>
                          {w.hourly_rate && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">Koszt ({w.hourly_rate} zl/h)</span>
                              <span className="text-amber-400 font-bold">{Math.round(s.costMonth)} zl</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-400">Zadania (tydzien)</span>
                            <span className="text-white font-bold">
                              {s.tasksDone}/{s.tasksTotal}
                              {s.tasksTotal > 0 && <span className="text-gray-500 ml-1">({Math.round((s.tasksDone / s.tasksTotal) * 100)}%)</span>}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Posilki (miesiac)</span>
                            <span className="text-white font-bold">{s.mealsThisMonth}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Checklisty dzis</span>
                            <span className="text-white font-bold">{s.checklistsToday}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Inactive */}
              {inactiveWorkers.length > 0 && (
                <div>
                  <h2 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-3">Nieaktywni ({inactiveWorkers.length})</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {inactiveWorkers.map(w => (
                      <div key={w.id} className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-4 opacity-50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 font-bold text-xs">
                            {w.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <h3 className="text-gray-400 font-medium text-sm">{w.full_name}</h3>
                            <p className="text-gray-600 text-xs">{roleLabel(w.role)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ HOURS TAB ═══ */}
          {tab === 'hours' && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-white font-bold text-sm mb-4">Godziny pracy — ten miesiac (GoPOS)</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-3 px-2">Pracownik</th>
                    <th className="text-left py-3 px-2">Rola</th>
                    <th className="text-right py-3 px-2">Godziny</th>
                    <th className="text-right py-3 px-2">Stawka</th>
                    <th className="text-right py-3 px-2">Koszt</th>
                    <th className="text-right py-3 px-2">Zadania</th>
                    <th className="text-right py-3 px-2">Posilki</th>
                  </tr>
                </thead>
                <tbody>
                  {activeWorkers.map(w => {
                    const s = stats[w.full_name]
                    if (!s) return null
                    return (
                      <tr key={w.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${roleColor(w.role)} flex items-center justify-center text-white font-bold text-[9px]`}>
                              {w.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <span className="text-white font-medium">{w.full_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-gray-400">{roleLabel(w.role)}</td>
                        <td className="py-3 px-2 text-right text-white font-bold">{s.hoursMonth.toFixed(1)}h</td>
                        <td className="py-3 px-2 text-right text-gray-400">{w.hourly_rate ? `${w.hourly_rate} zl/h` : '—'}</td>
                        <td className="py-3 px-2 text-right text-amber-400 font-bold">
                          {s.costMonth > 0 ? `${Math.round(s.costMonth)} zl` : '—'}
                        </td>
                        <td className="py-3 px-2 text-right text-white">{s.tasksDone}/{s.tasksTotal}</td>
                        <td className="py-3 px-2 text-right text-white">{s.mealsThisMonth}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700">
                    <td className="py-3 px-2 text-white font-bold" colSpan={2}>RAZEM</td>
                    <td className="py-3 px-2 text-right text-white font-bold">{Math.round(totalHours)}h</td>
                    <td className="py-3 px-2" />
                    <td className="py-3 px-2 text-right text-amber-400 font-bold">{Math.round(totalCost).toLocaleString('pl')} zl</td>
                    <td className="py-3 px-2" />
                    <td className="py-3 px-2 text-right text-white font-bold">{totalMeals}</td>
                  </tr>
                </tfoot>
              </table>

              {totalHours === 0 && (
                <p className="text-gray-500 text-xs text-center py-4 mt-4">
                  Brak danych z GoPOS — sprawdz czy API jest podlaczone
                </p>
              )}
            </div>
          )}

          {/* ═══ MEALS TAB ═══ */}
          {tab === 'meals' && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-white font-bold text-sm mb-4">Posilki pracownicze — ten miesiac</h2>
              {mealDetails.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-3 px-2">Data</th>
                      <th className="text-left py-3 px-2">Pracownik</th>
                      <th className="text-left py-3 px-2">Danie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mealDetails.slice(0, 50).map((m, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-3 px-2 text-gray-400">{m.meal_date}</td>
                        <td className="py-3 px-2 text-white font-medium">{m.worker_name}</td>
                        <td className="py-3 px-2 text-gray-300">{m.menu_description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-500 text-xs text-center py-4">Brak posilkow w tym miesiacu</p>
              )}

              {/* Per-worker summary */}
              <div className="mt-6 pt-4 border-t border-gray-800">
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">Podsumowanie per pracownik</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {activeWorkers.map(w => {
                    const s = stats[w.full_name]
                    return (
                      <div key={w.id} className="bg-gray-800/50 rounded-xl p-3 flex items-center justify-between">
                        <span className="text-white text-xs">{w.full_name.split(' ')[0]}</span>
                        <span className="text-white font-bold text-sm">{s?.mealsThisMonth || 0}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
