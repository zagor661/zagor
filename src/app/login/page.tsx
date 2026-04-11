'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { ROLES, normalizeRole } from '@/lib/roles'

interface Profile {
  id: string
  email: string
  full_name: string
  role: string
  pin: string
}

// Belt colors based on star count — same as dashboard
const BELT_COLORS = [
  { min: 0,   bg: 'bg-yellow-400' },
  { min: 10,  bg: 'bg-orange-400' },
  { min: 25,  bg: 'bg-green-500' },
  { min: 50,  bg: 'bg-blue-500' },
  { min: 80,  bg: 'bg-amber-700' },
  { min: 120, bg: 'bg-gray-800' },
]

function getBeltBg(stars: number): string {
  let belt = BELT_COLORS[0]
  for (const level of BELT_COLORS) {
    if (stars >= level.min) belt = level
  }
  return belt.bg
}

export default function LoginPage() {
  const router = useRouter()
  const { login } = useUser(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [starCounts, setStarCounts] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('kitchenops_user')
    if (stored) { router.push('/'); return }

    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, pin')
        .eq('is_active', true)
        .order('full_name')
      if (data) {
        // Fetch star counts for belt colors
        const { data: stars } = await supabase
          .from('worker_stars')
          .select('profile_id')
        const counts: Record<string, number> = {}
        if (stars) {
          for (const s of stars) {
            counts[s.profile_id] = (counts[s.profile_id] || 0) + 1
          }
        }
        setStarCounts(counts)

        // Sort: 1) role rank (owner > manager > kitchen > hall)
        // 2) within same role: by stars descending (highest belt first)
        const roleOrder: Record<string, number> = { owner: 0, admin: 0, manager: 1, kitchen: 2, worker: 2, hall: 3 }
        data.sort((a: Profile, b: Profile) => {
          const roleA = roleOrder[a.role] ?? 9
          const roleB = roleOrder[b.role] ?? 9
          if (roleA !== roleB) return roleA - roleB
          // Same role — sort by stars descending (more stars = higher)
          const starsA = counts[a.id] || 0
          const starsB = counts[b.id] || 0
          return starsB - starsA
        })
        setProfiles(data)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleLogin = async () => {
    if (!selected || locked) return
    setError('')

    if (pin !== selected.pin) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      if (newAttempts >= 3) {
        setLocked(true)
        setError('Zbyt wiele prób! Odczekaj 2 minuty.')
        setPin('')
        setTimeout(() => { setLocked(false); setAttempts(0); setError('') }, 120000)
      } else {
        setError(`Zły PIN! (próba ${newAttempts}/3)`)
        setPin('')
      }
      return
    }
    setAttempts(0)

    const { data: ul } = await supabase
      .from('user_locations')
      .select('location_id, locations(id, name)')
      .eq('user_id', selected.id)
      .limit(1)

    let locId = ''
    let locName = ''
    if (ul && ul.length > 0) {
      locId = (ul[0] as any).locations?.id || ''
      locName = (ul[0] as any).locations?.name || ''
    } else {
      const { data: locs } = await supabase
        .from('locations')
        .select('id, name')
        .limit(1)
      if (locs && locs[0]) {
        locId = locs[0].id
        locName = locs[0].name
      }
    }

    login({
      id: selected.id,
      email: selected.email,
      full_name: selected.full_name,
      role: selected.role,
      location_id: locId,
      location_name: locName,
    })

    router.push('/')
  }

  // Get icon and background for a profile
  function getProfileAvatar(p: Profile) {
    const role = normalizeRole(p.role)

    if (role === 'owner') {
      return { icon: '🥷', bgClass: 'bg-gray-900' }
    }
    if (role === 'manager') {
      return { icon: '👔', bgClass: `bg-gradient-to-br ${ROLES.manager.gradientFrom} ${ROLES.manager.gradientTo}` }
    }

    // Kitchen & Hall — chef icon with belt color
    const stars = starCounts[p.id] || 0
    const effectiveStars = p.full_name.toLowerCase().includes('yurii') ? stars + 10 : stars
    return { icon: '👨‍🍳', bgClass: getBeltBg(effectiveStars) }
  }

  // Display name — owner shows "Owner", others show full name
  function getDisplayName(p: Profile) {
    const role = normalizeRole(p.role)
    if (role === 'owner') return 'Owner'
    return p.full_name
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  // Step 1: Choose user
  if (!selected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white p-4">
        <div className="max-w-sm mx-auto pt-10">
          <div className="text-center mb-8">
            <div className="text-6xl mb-3">👨‍🍳</div>
            <h1 className="text-3xl font-bold text-gray-900">KitchenOps</h1>
            <p className="text-gray-500 mt-2">Wybierz swoje konto</p>
          </div>
          <div className="space-y-3">
            {profiles.map(p => {
              const avatar = getProfileAvatar(p)
              const role = normalizeRole(p.role)
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="w-full card flex items-center gap-4 hover:border-brand-300 hover:shadow-md transition-all active:scale-98"
                >
                  <div className={`w-12 h-12 rounded-2xl ${avatar.bgClass} flex items-center justify-center text-xl flex-shrink-0 shadow-md`}>
                    {avatar.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-900">{getDisplayName(p)}</div>
                    <div className={`text-xs font-semibold ${ROLES[role].color}`}>
                      {ROLES[role].labelPl}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {profiles.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-gray-500">Brak użytkowników.</p>
              <p className="text-gray-400 text-sm mt-1">Uruchom: node setup-db.js</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Step 2: Enter PIN
  const selectedAvatar = getProfileAvatar(selected)

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white p-4">
      <div className="max-w-sm mx-auto pt-10">
        <div className="text-center mb-8">
          <div className={`w-20 h-20 mx-auto rounded-2xl ${selectedAvatar.bgClass} flex items-center justify-center text-4xl mb-3 shadow-lg`}>
            {selectedAvatar.icon}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{getDisplayName(selected)}</h2>
          <button onClick={() => { setSelected(null); setPin(''); setError('') }} className="text-brand-600 text-sm mt-1">
            ← Zmień osobę
          </button>
        </div>

        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Wpisz PIN (4 cyfry)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="input text-center text-3xl tracking-[0.5em] font-bold"
              placeholder="••••"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium text-center">
              {error}
            </div>
          )}

          <button onClick={handleLogin} disabled={pin.length !== 4 || locked} className="btn-orange">
            {locked ? '🔒 Zablokowane' : 'Zaloguj się'}
          </button>
        </div>
      </div>
    </div>
  )
}
