'use client'
import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/lib/useUser'

interface Worker {
  id: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

interface WorkerStats {
  name: string
  tasksTotal: number
  tasksDone: number
  mealsThisMonth: number
  checklistsToday: number
}

export default function StaffPage() {
  const { user } = useUser()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [stats, setStats] = useState<Record<string, WorkerStats>>({})
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!user?.location_id) return
    setLoading(true)

    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const today = new Date().toISOString().split('T')[0]
      const monthStart = today.slice(0, 7) + '-01'
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

      const [profilesRes, tasksRes, mealsRes, checklistsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, is_active, created_at').order('full_name'),
        supabase.from('worker_tasks').select('assigned_to_name, is_completed').eq('location_id', user.location_id).gte('created_at', weekAgo),
        supabase.from('worker_meals').select('worker_name').eq('location_id', user.location_id).gte('meal_date', monthStart),
        supabase.from('checklist_logs').select('completed_by_name').eq('location_id', user.location_id).gte('created_at', today),
      ])

      const profiles = profilesRes.data || []
      setWorkers(profiles)

      const statsMap: Record<string, WorkerStats> = {}
      for (const p of profiles) {
        statsMap[p.full_name] = {
          name: p.full_name,
          tasksTotal: 0,
          tasksDone: 0,
          mealsThisMonth: 0,
          checklistsToday: 0,
        }
      }

      for (const t of tasksRes.data || []) {
        const key = t.assigned_to_name
        if (statsMap[key]) {
          statsMap[key].tasksTotal++
          if (t.is_completed) statsMap[key].tasksDone++
        }
      }

      for (const m of mealsRes.data || []) {
        if (statsMap[m.worker_name]) statsMap[m.worker_name].mealsThisMonth++
      }

      for (const c of checklistsRes.data || []) {
        if (statsMap[c.completed_by_name]) statsMap[c.completed_by_name].checklistsToday++
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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Zespol</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeWorkers.length} aktywnych pracownikow
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4 animate-pulse">👥</div>
          <p className="text-gray-500 text-sm">Ladowanie zespolu...</p>
        </div>
      ) : (
        <>
          {/* Active workers */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {activeWorkers.map(w => {
              const s = stats[w.full_name]
              return (
                <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleColor(w.role)} flex items-center justify-center text-white font-bold text-sm`}>
                      {w.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm">{w.full_name}</h3>
                      <p className="text-gray-500 text-xs">{roleLabel(w.role)}</p>
                    </div>
                    <div className="ml-auto">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    </div>
                  </div>

                  {s && (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Zadania (tydzien)</span>
                        <span className="text-white font-bold">
                          {s.tasksDone}/{s.tasksTotal}
                          {s.tasksTotal > 0 && (
                            <span className="text-gray-500 ml-1">
                              ({Math.round((s.tasksDone / s.tasksTotal) * 100)}%)
                            </span>
                          )}
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

          {/* Inactive workers */}
          {inactiveWorkers.length > 0 && (
            <div>
              <h2 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-3">
                Nieaktywni ({inactiveWorkers.length})
              </h2>
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

          {activeWorkers.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">👤</div>
              <p className="text-gray-400">Brak pracownikow w systemie</p>
              <p className="text-gray-600 text-xs mt-2">Dodaj pracownikow w aplikacji mobilnej</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
