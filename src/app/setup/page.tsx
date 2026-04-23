'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { ALL_MODULES, DEFAULT_ENABLED_MODULES, type RoleType } from '@/lib/roles'

// ============================================================
// Setup Wizard — 4-step onboarding for new restaurant
// Step 1: Restaurant name & info
// Step 2: Choose modules (toggles by category)
// Step 3: Owner account (name + PIN)
// Step 4: Confirmation + start
// ============================================================

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restauracja', icon: '🍽️' },
  { value: 'bar', label: 'Bar / Pub', icon: '🍺' },
  { value: 'cafe', label: 'Kawiarnia', icon: '☕' },
  { value: 'fastfood', label: 'Fast food', icon: '🍔' },
  { value: 'hotel', label: 'Hotel / Catering', icon: '🏨' },
]

interface StepProps {
  onNext: () => void
  onBack?: () => void
}

export default function SetupWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 1 data
  const [locName, setLocName] = useState('')
  const [locAddress, setLocAddress] = useState('')
  const [businessType, setBusinessType] = useState('restaurant')

  // Step 2 data — modules
  const [enabledModules, setEnabledModules] = useState<Set<string>>(
    new Set(DEFAULT_ENABLED_MODULES)
  )

  // Step 3 data — owner account
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPin, setOwnerPin] = useState('')

  // Step 4 data — temp admin access
  const [enableSupport, setEnableSupport] = useState(true)

  // If it's a bar, auto-enable bar checklist
  const effectiveType = businessType

  function toggleModule(id: string) {
    setEnabledModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setEnabledModules(new Set(ALL_MODULES.map(m => m.id)))
  }

  function selectDefaults() {
    setEnabledModules(new Set(DEFAULT_ENABLED_MODULES))
  }

  async function handleFinish() {
    if (!locName.trim() || !ownerName.trim() || ownerPin.length !== 4) {
      setError('Uzupełnij wszystkie wymagane pola')
      return
    }

    setSaving(true)
    setError('')

    try {
      // 1. Create location
      const { data: loc, error: locErr } = await supabase
        .from('locations')
        .insert({
          name: locName.trim(),
          address: locAddress.trim() || null,
          business_type: businessType,
          enabled_modules: Array.from(enabledModules),
          setup_completed: true,
        })
        .select('id')
        .single()

      if (locErr) throw locErr

      // 2. Create owner via API (handles auth.users + profiles)
      const workerRes = await fetch('/api/add-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: ownerName.trim(),
          pin: ownerPin,
          role: 'owner',
          location_id: loc.id,
        }),
      })

      const workerData = await workerRes.json()
      if (!workerRes.ok || !workerData.ok) throw new Error(workerData.error || 'Błąd tworzenia konta')

      const profileId = workerData.id

      // 3. Update location with owner_id
      await supabase
        .from('locations')
        .update({ owner_id: profileId })
        .eq('id', loc.id)

      // 5. Grant temp admin access if enabled
      if (enableSupport) {
        await fetch('/api/admin/temp-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: loc.id, days: 7 }),
        })
      }

      // 6. Auto-login as owner
      const userData = {
        id: profileId,
        email: ownerEmail.trim() || '',
        full_name: ownerName.trim(),
        role: 'owner',
        location_id: loc.id,
        location_name: locName.trim(),
      }
      localStorage.setItem('kitchenops_user', JSON.stringify(userData))
      localStorage.setItem('kitchenops_login_time', Date.now().toString())
      localStorage.setItem('kitchenops_last_activity', Date.now().toString())

      router.push('/onboarding')
    } catch (err: any) {
      console.error('Setup error:', err)
      setError(err.message || 'Błąd podczas tworzenia lokacji')
    } finally {
      setSaving(false)
    }
  }

  // Group modules by category for step 2
  const categories = ALL_MODULES.reduce((acc, mod) => {
    if (!acc[mod.category]) acc[mod.category] = []
    acc[mod.category].push(mod)
    return acc
  }, {} as Record<string, typeof ALL_MODULES>)

  const progress = (step / 4) * 100

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Progress bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-500">Krok {step} z 4</div>
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-sm text-brand-600 font-medium"
            >
              ← Wstecz
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* ─── STEP 1: Restaurant info ─── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-5xl mb-3">🏪</div>
              <h1 className="text-2xl font-bold text-gray-900">Nowy lokal</h1>
              <p className="text-gray-500 mt-1">Jak nazywa się Twoja restauracja?</p>
            </div>

            <div className="card space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nazwa lokalu *
                </label>
                <input
                  value={locName}
                  onChange={e => setLocName(e.target.value)}
                  placeholder="np. WOKI WOKI"
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Adres (opcjonalnie)
                </label>
                <input
                  value={locAddress}
                  onChange={e => setLocAddress(e.target.value)}
                  placeholder="np. Dworcowa 8, Bielsko-Biała"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Typ lokalu
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BUSINESS_TYPES.map(bt => (
                    <button
                      key={bt.value}
                      onClick={() => setBusinessType(bt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        businessType === bt.value
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="text-xl">{bt.icon}</div>
                      <div className="text-sm font-semibold mt-1">{bt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!locName.trim()}
              className="btn-orange w-full"
            >
              Dalej — wybierz moduły →
            </button>
          </div>
        )}

        {/* ─── STEP 2: Module selection ─── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-5xl mb-3">🧩</div>
              <h1 className="text-2xl font-bold text-gray-900">Wybierz moduły</h1>
              <p className="text-gray-500 mt-1">
                Co chcesz mieć w <strong>{locName}</strong>?
              </p>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="flex-1 py-2 px-3 rounded-xl bg-brand-50 text-brand-700 text-sm font-semibold border border-brand-200"
              >
                Zaznacz wszystko
              </button>
              <button
                onClick={selectDefaults}
                className="flex-1 py-2 px-3 rounded-xl bg-gray-50 text-gray-700 text-sm font-semibold border border-gray-200"
              >
                Domyślne
              </button>
            </div>

            {/* Module categories */}
            {Object.entries(categories).map(([category, mods]) => (
              <div key={category} className="card">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {mods.map(mod => {
                    // Skip settings — always enabled for owner
                    if (mod.id === '/settings') return null
                    const isOn = enabledModules.has(mod.id)
                    return (
                      <button
                        key={mod.id}
                        onClick={() => toggleModule(mod.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                          isOn
                            ? 'bg-brand-50 border-2 border-brand-300'
                            : 'bg-gray-50 border-2 border-transparent'
                        }`}
                      >
                        <div className="text-2xl">{mod.icon}</div>
                        <div className="text-left flex-1">
                          <div className={`font-semibold text-sm ${isOn ? 'text-gray-900' : 'text-gray-400'}`}>
                            {mod.title}
                          </div>
                          <div className="text-xs text-gray-400">{mod.subtitle}</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full flex items-center transition-all ${
                          isOn ? 'bg-brand-500 justify-end' : 'bg-gray-200 justify-start'
                        }`}>
                          <div className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="text-center text-sm text-gray-400">
              Włączone: {enabledModules.size} modułów · Możesz to zmienić później w Ustawieniach
            </div>

            <button
              onClick={() => setStep(3)}
              className="btn-orange w-full"
            >
              Dalej — konto właściciela →
            </button>
          </div>
        )}

        {/* ─── STEP 3: Owner account ─── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-5xl mb-3">🥷</div>
              <h1 className="text-2xl font-bold text-gray-900">Konto właściciela</h1>
              <p className="text-gray-500 mt-1">Twoje dane do logowania</p>
            </div>

            <div className="card space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Imię i nazwisko *
                </label>
                <input
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  placeholder="np. Jan Kowalski"
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Email (opcjonalnie)
                </label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={e => setOwnerEmail(e.target.value)}
                  placeholder="np. jan@restaurant.pl"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  PIN logowania (4 cyfry) *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={ownerPin}
                  onChange={e => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="input text-center text-2xl tracking-[0.5em] font-bold"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Tym PINem będziesz się logować do aplikacji
                </p>
              </div>
            </div>

            <button
              onClick={() => setStep(4)}
              disabled={!ownerName.trim() || ownerPin.length !== 4}
              className="btn-orange w-full"
            >
              Dalej — podsumowanie →
            </button>
          </div>
        )}

        {/* ─── STEP 4: Summary ─── */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-5xl mb-3">🚀</div>
              <h1 className="text-2xl font-bold text-gray-900">Wszystko gotowe!</h1>
              <p className="text-gray-500 mt-1">Sprawdź i uruchom</p>
            </div>

            <div className="card space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🏪</div>
                <div>
                  <div className="font-bold text-gray-900">{locName}</div>
                  <div className="text-sm text-gray-500">
                    {BUSINESS_TYPES.find(b => b.value === businessType)?.label}
                    {locAddress && ` · ${locAddress}`}
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="flex items-center gap-3">
                <div className="text-3xl">🧩</div>
                <div>
                  <div className="font-bold text-gray-900">{enabledModules.size} modułów</div>
                  <div className="text-sm text-gray-500">
                    {Array.from(enabledModules).slice(0, 4).map(id => {
                      const mod = ALL_MODULES.find(m => m.id === id)
                      return mod?.icon || ''
                    }).join(' ')}{enabledModules.size > 4 ? ` +${enabledModules.size - 4}` : ''}
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="flex items-center gap-3">
                <div className="text-3xl">🥷</div>
                <div>
                  <div className="font-bold text-gray-900">{ownerName}</div>
                  <div className="text-sm text-gray-500">Owner · PIN: ****</div>
                </div>
              </div>
            </div>

            {/* Temp admin support toggle */}
            <div className="card">
              <button
                onClick={() => setEnableSupport(!enableSupport)}
                className="w-full flex items-center gap-3"
              >
                <div className="text-2xl">🛟</div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-sm text-gray-900">
                    Wsparcie KitchenOps (7 dni)
                  </div>
                  <div className="text-xs text-gray-400">
                    Administrator pomoże Ci skonfigurować lokal i sprawdzić czy wszystko działa
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full flex items-center transition-all ${
                  enableSupport ? 'bg-brand-500 justify-end' : 'bg-gray-200 justify-start'
                }`}>
                  <div className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                </div>
              </button>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium text-center">
                {error}
              </div>
            )}

            <button
              onClick={handleFinish}
              disabled={saving}
              className="btn-orange w-full text-lg py-4"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Tworzę lokal...
                </span>
              ) : (
                'Uruchom KitchenOps 🚀'
              )}
            </button>

            <p className="text-center text-xs text-gray-400">
              Następny krok: konfiguracja krok po kroku — zespół, sprzęt, checklist
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
