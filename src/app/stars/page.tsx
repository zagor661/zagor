'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

interface Star {
  id: string
  profile_id: string
  given_by: string
  reason: string | null
  created_at: string
}

interface Profile {
  id: string
  full_name: string
}

const BELT_LEVELS = [
  { min: 0,  label: 'Żółty pas',    icon: '🟡', color: 'text-yellow-600', bg: 'bg-yellow-400', next: 10 },
  { min: 10, label: 'Pomarańczowy pas', icon: '🟠', color: 'text-orange-600', bg: 'bg-orange-400', next: 25 },
  { min: 25, label: 'Zielony pas',  icon: '🟢', color: 'text-green-600', bg: 'bg-green-500', next: 50 },
  { min: 50, label: 'Niebieski pas', icon: '🔵', color: 'text-blue-600', bg: 'bg-blue-500', next: 80 },
  { min: 80, label: 'Brązowy pas',  icon: '🟤', color: 'text-amber-800', bg: 'bg-amber-700', next: 120 },
  { min: 120, label: 'Czarny pas',  icon: '⚫', color: 'text-gray-900', bg: 'bg-gray-800', next: null },
]

function getBelt(starCount: number, name?: string) {
  // Yurii starts from orange (+10 bonus)
  const effective = name && name.toLowerCase().includes('yurii') ? starCount + 10 : starCount
  let belt = BELT_LEVELS[0]
  for (const level of BELT_LEVELS) {
    if (effective >= level.min) belt = level
  }
  return belt
}

function getEffectiveStars(starCount: number, name?: string) {
  return name && name.toLowerCase().includes('yurii') ? starCount + 10 : starCount
}

export default function StarsPage() {
  const { user, loading: authLoading } = useUser()
  const [workers, setWorkers] = useState<Profile[]>([])
  const [starCounts, setStarCounts] = useState<Record<string, number>>({})
  const [myStars, setMyStars] = useState<Star[]>([])
  const [recentStars, setRecentStars] = useState<any[]>([])
  const [showGive, setShowGive] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState('')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (authLoading || !user) return
    loadWorkers()
    loadStarCounts()
    if (!isAdmin) loadMyStars()
    loadRecentStars()
  }, [user, authLoading])

  async function loadWorkers() {
    // Only load workers linked to this location
    const { data: links } = await supabase
      .from('user_locations')
      .select('user_id')
      .eq('location_id', user!.location_id)

    const userIds = (links || []).map(l => l.user_id)
    if (userIds.length === 0) { setWorkers([]); return }

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .in('id', userIds)
      .order('full_name')
    if (data) setWorkers(data.filter(w => w.id !== user!.id))
  }

  async function loadStarCounts() {
    const { data } = await supabase
      .from('worker_stars')
      .select('profile_id')
      .eq('location_id', user!.location_id)

    if (data) {
      const counts: Record<string, number> = {}
      data.forEach(s => { counts[s.profile_id] = (counts[s.profile_id] || 0) + 1 })
      setStarCounts(counts)
    }
  }

  async function loadMyStars() {
    const { data } = await supabase
      .from('worker_stars')
      .select('*')
      .eq('profile_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) setMyStars(data)
  }

  async function loadRecentStars() {
    const { data } = await supabase
      .from('worker_stars')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) setRecentStars(data)
  }

  async function giveStar() {
    if (!selectedWorker || !user) return
    setSending(true)

    const { error } = await supabase.from('worker_stars').insert({
      profile_id: selectedWorker,
      given_by: user.id,
      location_id: user.location_id,
      reason: reason.trim() || null,
    })

    if (error) {
      alert('Błąd: ' + error.message)
    } else {
      const givenToName = workers.find(w => w.id === selectedWorker)?.full_name || ''
      fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'star',
          data: {
            created_at: new Date().toISOString(),
            location: user.location_name,
            given_by: user.full_name,
            given_to: givenToName,
            reason: reason.trim() || '',
          },
        }),
      }).catch(() => {})

      setSelectedWorker('')
      setReason('')
      setShowGive(false)
      await loadStarCounts()
      await loadRecentStars()
    }
    setSending(false)
  }

  async function removeStar(starId: string) {
    await supabase.from('worker_stars').delete().eq('id', starId)
    await loadStarCounts()
    await loadRecentStars()
  }

  function getWorkerName(id: string) {
    const w = workers.find(w => w.id === id)
    return w?.full_name || '?'
  }

  if (authLoading || !user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <Link href="/" className="text-brand-600 font-medium text-sm">← Powrót</Link>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">⭐ Gwiazdki</h1>
          <p className="text-gray-500 text-sm mt-1">Pochwały i postęp do premii</p>
        </div>

        {/* Worker view — my belt progress */}
        {!isAdmin && (
          <div className="card text-center py-6">
            {(() => {
              const count = starCounts[user.id] || 0
              const belt = getBelt(count, user.full_name)
              const effective = getEffectiveStars(count, user.full_name)
              const nextBelt = BELT_LEVELS[BELT_LEVELS.indexOf(belt) + 1]
              const progress = nextBelt ? ((effective - belt.min) / (nextBelt.min - belt.min)) * 100 : 100

              return (
                <>
                  <div className={`w-16 h-16 rounded-2xl ${belt.bg} flex items-center justify-center mx-auto mb-3`}>
                    <span className="text-3xl">👨‍🍳</span>
                  </div>
                  <div className={`text-lg font-bold ${belt.color}`}>{belt.label}</div>
                  <div className="text-3xl font-bold mt-2">⭐ {count}</div>
                  <p className="text-gray-400 text-xs mt-1">
                    {count === 1 ? 'gwiazdka' : count < 5 ? 'gwiazdki' : 'gwiazdek'}
                  </p>

                  {nextBelt && (
                    <div className="mt-4 px-8">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>{belt.icon} {belt.label}</span>
                        <span>{nextBelt.icon} {nextBelt.label}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div
                          className={`${belt.bg} h-3 rounded-full transition-all`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Jeszcze {nextBelt.min - count} do następnego pasa
                      </p>
                    </div>
                  )}

                  {/* Recent stars */}
                  {myStars.length > 0 && (
                    <div className="mt-6 text-left">
                      <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Ostatnie pochwały</h3>
                      <div className="space-y-1.5">
                        {myStars.map(s => (
                          <div key={s.id} className="flex items-center gap-2 text-sm">
                            <span>⭐</span>
                            <span className="text-gray-600">{s.reason || 'Dobra robota!'}</span>
                            <span className="text-gray-300 text-xs ml-auto">{format(new Date(s.created_at), 'd MMM', { locale: pl })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* Admin view — give stars + rankings */}
        {isAdmin && (
          <>
            <button
              onClick={() => setShowGive(!showGive)}
              className="w-full bg-brand-500 text-white py-3 rounded-xl font-bold hover:bg-brand-600 text-lg"
            >
              ⭐ Daj gwiazdkę
            </button>

            {showGive && (
              <div className="card border-2 border-brand-200 space-y-3">
                <select
                  value={selectedWorker}
                  onChange={e => setSelectedWorker(e.target.value)}
                  className="input"
                >
                  <option value="">Komu?</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.full_name}</option>
                  ))}
                </select>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Za co? (opcjonalnie)"
                  className="input"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowGive(false)} className="btn-white text-sm py-3">Anuluj</button>
                  <button
                    onClick={giveStar}
                    disabled={!selectedWorker || sending}
                    className="btn-orange text-sm py-3"
                  >
                    {sending ? '...' : '⭐ Wyślij'}
                  </button>
                </div>
              </div>
            )}

            {/* Rankings */}
            <div className="card">
              <h2 className="font-bold text-sm text-gray-700 mb-3">🏆 Ranking — pasy karate</h2>
              <div className="space-y-3">
                {workers
                  .map(w => ({ ...w, count: starCounts[w.id] || 0 }))
                  .sort((a, b) => getEffectiveStars(b.count, b.full_name) - getEffectiveStars(a.count, a.full_name))
                  .map((w, idx) => {
                    const belt = getBelt(w.count, w.full_name)
                    const effective = getEffectiveStars(w.count, w.full_name)
                    const nextBelt = BELT_LEVELS[BELT_LEVELS.indexOf(belt) + 1]
                    const progress = nextBelt ? ((effective - belt.min) / (nextBelt.min - belt.min)) * 100 : 100

                    return (
                      <div key={w.id} className="space-y-1">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${belt.bg} flex items-center justify-center`}>
                            <span className="text-sm">👨‍🍳</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{w.full_name}</span>
                              <span className="font-bold text-brand-600">⭐ {w.count}</span>
                            </div>
                            <div className={`text-xs ${belt.color} font-medium`}>{belt.label}</div>
                          </div>
                        </div>
                        {nextBelt && (
                          <div className="ml-11">
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div
                                className={`${belt.bg} h-1.5 rounded-full transition-all`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-300 mt-0.5">
                              {nextBelt.min - w.count} do {nextBelt.label.toLowerCase()}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Recent activity */}
            <div className="card">
              <h2 className="font-bold text-sm text-gray-700 mb-3">📜 Ostatnio przyznane</h2>
              {recentStars.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-4">Brak gwiazdek</p>
              ) : (
                <div className="space-y-2">
                  {recentStars.map(s => {
                    const workerName = workers.find(w => w.id === s.profile_id)?.full_name || '?'
                    return (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <span>⭐</span>
                        <span className="font-medium">{workerName}</span>
                        <span className="text-gray-400 flex-1 truncate">{s.reason || 'Dobra robota!'}</span>
                        <span className="text-gray-300 text-xs">{format(new Date(s.created_at), 'd MMM', { locale: pl })}</span>
                        <button onClick={() => removeStar(s.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
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
