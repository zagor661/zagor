'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { ROLES, normalizeRole } from '@/lib/roles'

interface Profile {
  id: string
  email: string
  full_name: string
  role: string
}

interface Location {
  id: string
  name: string
  address?: string
  business_type?: string
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

const BIZ_ICONS: Record<string, string> = {
  restaurant: '🍽️',
  bar: '🍺',
  club: '🪩',
  cafe: '☕',
  fastfood: '🍔',
  hotel: '🏨',
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useUser(false)

  // Steps: 'location' | 'user' | 'pin'
  const [step, setStep] = useState<'location' | 'user' | 'pin'>('location')
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [starCounts, setStarCounts] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)

  // Load location on mount — REQUIRES ?loc= parameter for isolation
  useEffect(() => {
    const stored = localStorage.getItem('kitchenops_user')
    if (stored) { router.push('/'); return }

    let locParam = searchParams.get('loc')

    // No ?loc= — check if we have a saved location from previous login
    if (!locParam) {
      const lastLoc = localStorage.getItem('kitchenops_last_loc')
      if (lastLoc) {
        locParam = lastLoc
      } else {
        setLoading(false)
        return
      }
    }

    // Save location for next time
    localStorage.setItem('kitchenops_last_loc', locParam)

    async function loadLocation() {
      const { data } = await supabase
        .from('locations')
        .select('id, name, address, business_type')
        .eq('id', locParam!)
        .maybeSingle()

      if (data) {
        setSelectedLocation(data)
        setStep('user')
        await loadProfilesForLocation(data.id)
      }
      setLoading(false)
    }
    loadLocation()
  }, [])

  async function loadProfilesForLocation(locationId: string) {
    try {
      const res = await fetch(`/api/login/profiles?loc=${locationId}`)
      if (!res.ok) {
        setProfiles([])
        return
      }
      const data = await res.json()
      let profileData: Profile[] = data.profiles || []
      const counts: Record<string, number> = data.stars || {}
      setStarCounts(counts)

      // Sort: role rank then stars descending
      const roleOrder: Record<string, number> = {
        owner: 0, admin: 0, manager: 1, kitchen: 2, worker: 2, hall: 3, bar: 3, bartender: 3, barman: 3,
      }
      profileData.sort((a, b) => {
        const roleA = roleOrder[a.role] ?? 9
        const roleB = roleOrder[b.role] ?? 9
        if (roleA !== roleB) return roleA - roleB
        const starsA = counts[a.id] || 0
        const starsB = counts[b.id] || 0
        return starsB - starsA
      })

      setProfiles(profileData)
    } catch {
      setProfiles([])
    }
  }

  function selectLocation(loc: Location) {
    setSelectedLocation(loc)
    setStep('user')
    loadProfilesForLocation(loc.id)
  }

  function selectUser(p: Profile) {
    setSelected(p)
    setStep('pin')
    setPin('')
    setError('')
    setAttempts(0)
    setLocked(false)
  }

  const handleLogin = async () => {
    if (!selected || !selectedLocation || locked) return
    setError('')

    try {
      const res = await fetch('/api/login/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selected.id,
          pin,
          location_id: selectedLocation.id,
        }),
      })
      const data = await res.json()

      if (!data.ok) {
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

      login({
        id: data.profile.id,
        email: data.profile.email,
        full_name: data.profile.full_name,
        role: data.profile.role,
        location_id: selectedLocation.id,
        location_name: selectedLocation.name,
      })

      router.push('/')
    } catch {
      setError('Błąd połączenia z serwerem')
    }
  }

  // Get icon and background for a profile
  function getProfileAvatar(p: Profile) {
    const role = normalizeRole(p.role)
    if (role === 'owner') return { icon: '🥷', bgClass: 'bg-gray-900' }
    if (role === 'manager') return { icon: '👔', bgClass: `bg-gradient-to-br ${ROLES.manager.gradientFrom} ${ROLES.manager.gradientTo}` }
    if (role === 'bar') return { icon: '🍸', bgClass: `bg-gradient-to-br ${ROLES.bar.gradientFrom} ${ROLES.bar.gradientTo}` }
    const stars = starCounts[p.id] || 0
    return { icon: '👨‍🍳', bgClass: getBeltBg(stars) }
  }

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

  // ─── No ?loc= parameter — show message, don't expose all locations ───
  if (step === 'location') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white p-4">
        <div className="max-w-sm mx-auto pt-10">
          <div className="text-center mb-8">
            <div className="text-6xl mb-3">👨‍🍳</div>
            <h1 className="text-3xl font-bold text-gray-900">KitchenOps</h1>
            <p className="text-gray-500 mt-2">Logowanie</p>
          </div>
          <div className="card text-center py-8 space-y-3">
            <p className="text-gray-700 font-medium">Użyj linku logowania od swojego lokalu</p>
            <p className="text-gray-400 text-sm">Każda restauracja ma własny, unikalny link do logowania. Znajdziesz go u właściciela lokalu.</p>
          </div>
          <div className="mt-4 space-y-3">
            <button
              onClick={() => router.push('/join')}
              className="btn-orange w-full"
            >
              Zarejestruj nowy lokal →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── STEP: Choose user ───
  if (step === 'user') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white p-4">
        <div className="max-w-sm mx-auto pt-10">
          <div className="text-center mb-8">
            <div className="text-4xl mb-2">
              {BIZ_ICONS[selectedLocation?.business_type || 'restaurant'] || '🏪'}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{selectedLocation?.name}</h1>
            <p className="text-gray-500 mt-1">Kto się loguje?</p>
            {/* Each restaurant has its own unique link — no location switching */}
          </div>
          <div className="space-y-3">
            {profiles.map(p => {
              const avatar = getProfileAvatar(p)
              const role = normalizeRole(p.role)
              return (
                <button
                  key={p.id}
                  onClick={() => selectUser(p)}
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
              <p className="text-gray-500">Brak pracowników w tym lokalu.</p>
              <p className="text-gray-400 text-sm mt-1">Dodaj ich w Ustawieniach po zalogowaniu jako Owner</p>
            </div>
          )}
          {/* Debug removed for production */}
        </div>
      </div>
    )
  }

  // ─── STEP: Enter PIN ───
  const selectedAvatar = selected ? getProfileAvatar(selected) : { icon: '', bgClass: '' }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white p-4">
      <div className="max-w-sm mx-auto pt-10">
        <div className="text-center mb-8">
          <div className={`w-20 h-20 mx-auto rounded-2xl ${selectedAvatar.bgClass} flex items-center justify-center text-4xl mb-3 shadow-lg`}>
            {selectedAvatar.icon}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{selected ? getDisplayName(selected) : ''}</h2>
          <div className="text-sm text-gray-400 mt-0.5">{selectedLocation?.name}</div>
          <button
            onClick={() => { setStep('user'); setSelected(null); setPin(''); setError('') }}
            className="text-brand-600 text-sm mt-1"
          >
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

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
