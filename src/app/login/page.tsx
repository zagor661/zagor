'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

interface Profile {
  id: string
  email: string
  full_name: string
  role: string
  pin: string
}

export default function LoginPage() {
  const router = useRouter()
  const { login } = useUser(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    // Check if already logged in
    const stored = localStorage.getItem('kitchenops_user')
    if (stored) { router.push('/'); return }

    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, pin')
        .eq('is_active', true)
        .order('full_name')
      if (data) setProfiles(data)
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

    // Get location
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
      // Fallback: get first location
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
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full card flex items-center gap-4 hover:border-brand-300 hover:shadow-md transition-all active:scale-98"
              >
                <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-xl flex-shrink-0">
                  {p.role === 'admin' ? '👑' : p.role === 'manager' ? '⭐' : '👨‍🍳'}
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900">{p.full_name}</div>
                  <div className="text-xs text-gray-400">{p.role}</div>
                </div>
              </button>
            ))}
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
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white p-4">
      <div className="max-w-sm mx-auto pt-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-brand-100 flex items-center justify-center text-3xl mb-3">
            {selected.role === 'admin' ? '👑' : '👨‍🍳'}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{selected.full_name}</h2>
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
