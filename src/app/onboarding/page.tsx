'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import supabase from '@/lib/supabase'

// ============================================================
// Onboarding Wizard — 5 steps after Setup
// Step 1: Welcome + walkthrough of what KitchenOps does
// Step 2: Add workers (name, role, PIN)
// Step 3: Equipment (fridges, ovens, etc. for temperature & breakdowns)
// Step 4: Checklist & cleaning config
// Step 5: Food Cost Excel link
// ============================================================

const ROLES = [
  { value: 'kitchen', label: 'Kuchnia', icon: '🍳', desc: 'Kucharz, pomoc kuchenna' },
  { value: 'hall', label: 'Sala', icon: '🍽️', desc: 'Kelner, hostess' },
  { value: 'bar', label: 'Bar', icon: '🍸', desc: 'Barman, barista' },
  { value: 'manager', label: 'Menager', icon: '👔', desc: 'Kierownik zmiany' },
]

const EQUIPMENT_PRESETS = [
  { type: 'fridge', label: 'Lodówka', icon: '🧊', temp_min: 0, temp_max: 5 },
  { type: 'freezer', label: 'Zamrażarka', icon: '❄️', temp_min: -22, temp_max: -16 },
  { type: 'display_fridge', label: 'Witryna chłodnicza', icon: '🥗', temp_min: 0, temp_max: 7 },
  { type: 'oven', label: 'Piec', icon: '🔥', temp_min: 0, temp_max: 300 },
  { type: 'dishwasher', label: 'Zmywarka', icon: '🍽️', temp_min: 55, temp_max: 85 },
]

const BREAKDOWN_TYPE_PRESETS = [
  'Sprzęt kuchenny',
  'Chłodnictwo (lodówka / zamrażarka)',
  'Wentylacja / klimatyzacja',
  'Instalacja elektryczna',
  'Instalacja wodno-kanalizacyjna',
  'Nagłośnienie / oświetlenie',
  'Meble / wyposażenie',
  'POS / kasa',
]

const DEFAULT_CHECKLIST = {
  morning: [
    'Sprawdzić temperatury lodówek',
    'Przygotować stanowiska pracy',
    'Sprawdzić stan zapasów',
    'Włączyć sprzęt (piekarnik, frytownica)',
    'Umyć ręce / założyć rękawiczki',
  ],
  evening: [
    'Wyczyścić stanowiska pracy',
    'Zamknąć i zabezpieczyć lodówki',
    'Wyczyścić podłogi kuchni',
    'Opróżnić kosze na śmieci',
    'Sprawdzić zamknięcie drzwi i okien',
  ],
}

const DEFAULT_CLEANING_ZONES = [
  { name: 'Kuchnia — blaty i powierzchnie', frequency: 'codziennie' },
  { name: 'Kuchnia — podłoga', frequency: 'codziennie' },
  { name: 'Sala — stoliki', frequency: 'codziennie' },
  { name: 'Toalety', frequency: 'codziennie' },
  { name: 'Okap / wentylacja', frequency: 'co tydzień' },
  { name: 'Lodówki — wewnątrz', frequency: 'co tydzień' },
  { name: 'Zmywarka — filtr i wnętrze', frequency: 'co tydzień' },
  { name: 'Okna', frequency: 'co miesiąc' },
]

interface NewWorker {
  name: string
  role: string
  pin: string
  position: string
}

interface NewEquipment {
  name: string
  type: string
  temp_min: number
  temp_max: number
}

const TOTAL_STEPS = 5

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useUser()
  const [step, setStep] = useState(1)

  // Step 2: Workers
  const [workers, setWorkers] = useState<NewWorker[]>([])
  const [wName, setWName] = useState('')
  const [wRole, setWRole] = useState('kitchen')
  const [wPin, setWPin] = useState('')
  const [wPosition, setWPosition] = useState('')
  const [addingWorker, setAddingWorker] = useState(false)

  // Step 3: Equipment
  const [equipment, setEquipment] = useState<NewEquipment[]>([])
  const [eqName, setEqName] = useState('')
  const [eqType, setEqType] = useState('fridge')
  const [savingEquipment, setSavingEquipment] = useState(false)

  // Step 4: Checklist + Cleaning
  const [morningItems, setMorningItems] = useState<string[]>([...DEFAULT_CHECKLIST.morning])
  const [eveningItems, setEveningItems] = useState<string[]>([...DEFAULT_CHECKLIST.evening])
  const [cleaningZones, setCleaningZones] = useState([...DEFAULT_CLEANING_ZONES])
  const [newCheckItem, setNewCheckItem] = useState('')
  const [newCleanZone, setNewCleanZone] = useState('')

  // Step 5: Food Cost
  const [foodCostUrl, setFoodCostUrl] = useState('')

  // General
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading])

  if (authLoading || !user) return null

  const progress = (step / TOTAL_STEPS) * 100

  // ─── Add worker ───
  async function handleAddWorker() {
    if (!wName.trim() || wPin.length !== 4) return
    setAddingWorker(true)
    setError('')

    try {
      const res = await fetch('/api/add-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: wName.trim(),
          pin: wPin,
          role: wRole,
          location_id: user.location_id,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Błąd')

      setWorkers(prev => [...prev, { name: wName.trim(), role: wRole, pin: wPin, position: wPosition }])
      setWName('')
      setWPin('')
      setWPosition('')
    } catch (err: any) {
      setError(err.message)
    }
    setAddingWorker(false)
  }

  // ─── Add equipment ───
  function addEquipmentToList() {
    if (!eqName.trim()) return
    const preset = EQUIPMENT_PRESETS.find(p => p.type === eqType)
    setEquipment(prev => [...prev, {
      name: eqName.trim(),
      type: eqType,
      temp_min: preset?.temp_min ?? 0,
      temp_max: preset?.temp_max ?? 10,
    }])
    setEqName('')
  }

  // ─── Save equipment to DB ───
  async function saveEquipment() {
    if (equipment.length === 0) return
    setSavingEquipment(true)
    for (const eq of equipment) {
      await supabase.from('cooling_units').insert({
        location_id: user.location_id,
        name: eq.name,
        unit_type: eq.type,
        temp_min: eq.temp_min,
        temp_max: eq.temp_max,
        is_active: true,
        sort_order: 0,
      })
    }
    setSavingEquipment(false)
  }

  // ─── Save checklist config ───
  async function saveChecklist() {
    const items = [
      ...morningItems.map((text, i) => ({ shift: 'morning', text, sort_order: i })),
      ...eveningItems.map((text, i) => ({ shift: 'evening', text, sort_order: i })),
    ]
    for (const item of items) {
      await supabase.from('checklist_items').insert({
        location_id: user.location_id,
        shift_type: item.shift,
        item_text: item.text,
        sort_order: item.sort_order,
        is_active: true,
      })
    }
  }

  // ─── Save cleaning zones ───
  async function saveCleaningZones() {
    for (const zone of cleaningZones) {
      await supabase.from('cleaning_zones').insert({
        location_id: user.location_id,
        zone_name: zone.name,
        frequency: zone.frequency,
        is_active: true,
      })
    }
  }

  // ─── Save food cost link ───
  async function saveFoodCostUrl() {
    if (!foodCostUrl.trim()) return
    await supabase.from('locations').update({
      food_cost_sheet_url: foodCostUrl.trim(),
    }).eq('id', user.location_id)
  }

  // ─── Handle next step ───
  async function handleNext() {
    setSaving(true)
    setError('')
    try {
      if (step === 3 && equipment.length > 0) await saveEquipment()
      if (step === 4) {
        await saveChecklist()
        await saveCleaningZones()
      }
      if (step === 5) {
        await saveFoodCostUrl()
        // Mark onboarding complete
        await supabase.from('locations').update({ onboarding_completed: true }).eq('id', user.location_id)
        router.push('/')
        return
      }
      setStep(s => s + 1)
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Progress bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-brand-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-500">Konfiguracja {step} / {TOTAL_STEPS}</div>
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="text-sm text-brand-600 font-medium">
              ← Wstecz
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* ═══════════════════════════════════════════════════
            STEP 1: Welcome & what KitchenOps does
           ═══════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-6xl mb-3">👨‍🍳</div>
              <h1 className="text-2xl font-bold text-gray-900">Witaj w KitchenOps!</h1>
              <p className="text-gray-500 mt-2">
                Za chwilę skonfigurujemy Twój lokal krok po kroku.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { icon: '👥', title: 'Zespół', desc: 'Dodaj pracowników — każdy dostanie swój PIN do logowania. Przypisz rolę (kuchnia/sala/bar/menager) żeby widzieli odpowiednie moduły.' },
                { icon: '🧊', title: 'Sprzęt', desc: 'Dodaj lodówki, zamrażarki, piece — system będzie kontrolował temperatury i pozwoli zgłaszać usterki dla konkretnych urządzeń.' },
                { icon: '✅', title: 'Checklist zmianowy', desc: 'Lista zadań na każdą zmianę (poranną i wieczorną). Pracownicy odhaczają punkty — Ty widzisz postęp w czasie rzeczywistym.' },
                { icon: '🧹', title: 'Sprzątanie', desc: 'Harmonogram sprzątania — codziennie, co tydzień, co miesiąc. Każda strefa z listą do odhaczenia.' },
                { icon: '💰', title: 'Food Cost', desc: 'Podłącz arkusz Excel z cenami produktów — system policzy koszt surowca na każde danie i porówna ceny na fakturach.' },
              ].map((item, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 flex gap-3 shadow-sm">
                  <div className="text-3xl flex-shrink-0">{item.icon}</div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{item.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <div className="text-sm text-blue-800 font-medium">
                💡 Nie musisz wypełniać wszystkiego teraz — możesz pominąć krok i wrócić do niego później w Ustawieniach.
              </div>
            </div>

            <button onClick={() => setStep(2)} className="btn-orange w-full text-lg py-4">
              Zaczynamy! 🚀
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 2: Add workers
           ═══════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-5xl mb-2">👥</div>
              <h1 className="text-2xl font-bold text-gray-900">Dodaj zespół</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Każdy pracownik dostanie swój PIN do logowania na telefonie.
                Rola decyduje jakie moduły widzi.
              </p>
            </div>

            {/* Added workers */}
            {workers.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-sm">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  Dodani ({workers.length})
                </div>
                <div className="space-y-1.5">
                  {workers.map((w, i) => {
                    const r = ROLES.find(r => r.value === w.role)
                    return (
                      <div key={i} className="flex items-center gap-3 bg-emerald-50 rounded-xl px-3 py-2">
                        <span className="text-lg">{r?.icon || '👤'}</span>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">{w.name}</div>
                          <div className="text-[10px] text-gray-500">{r?.label} · PIN: {w.pin}</div>
                        </div>
                        <span className="text-emerald-500 text-sm">✓</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Add worker form */}
            <div className="bg-white rounded-2xl border-2 border-brand-200 p-4 shadow-sm space-y-3">
              <div className="text-[11px] font-semibold text-brand-600 uppercase tracking-wider">
                Nowy pracownik
              </div>

              <input
                value={wName}
                onChange={e => setWName(e.target.value)}
                placeholder="Imię i nazwisko *"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-brand-500 focus:outline-none"
                autoFocus
              />

              <input
                value={wPosition}
                onChange={e => setWPosition(e.target.value)}
                placeholder="Stanowisko (np. Szef kuchni, Kelnerka)"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-brand-500 focus:outline-none"
              />

              {/* Role selection */}
              <div>
                <div className="text-[10px] text-gray-400 uppercase mb-1.5">Rola w systemie</div>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setWRole(r.value)}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                        wRole === r.value
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{r.icon}</span>
                        <div>
                          <div className="text-sm font-semibold">{r.label}</div>
                          <div className="text-[10px] text-gray-400">{r.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* PIN */}
              <div>
                <div className="text-[10px] text-gray-400 uppercase mb-1">PIN (4 cyfry) *</div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={wPin}
                  onChange={e => setWPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="np. 1234"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-center tracking-[0.3em] font-bold focus:border-brand-500 focus:outline-none"
                />
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
              )}

              <button
                onClick={handleAddWorker}
                disabled={!wName.trim() || wPin.length !== 4 || addingWorker}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl disabled:opacity-40 transition-all active:scale-[0.97]"
              >
                {addingWorker ? 'Dodaję...' : `Dodaj ${wName.trim() || 'pracownika'}`}
              </button>
            </div>

            {/* Info box */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              <strong>Podpowiedź:</strong> Rola w systemie decyduje co widzi pracownik: Kuchnia → checklist kuchenny, temperatury. Sala → posiłki, zadania. Menager → pełny dostęp do raportów i zarządzania.
            </div>

            <button
              onClick={() => setStep(3)}
              className="btn-orange w-full"
            >
              {workers.length > 0 ? 'Dalej — sprzęt →' : 'Pomiń — dodasz później →'}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 3: Equipment (fridges, freezers, etc.)
           ═══════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-5xl mb-2">🧊</div>
              <h1 className="text-2xl font-bold text-gray-900">Sprzęt i urządzenia</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Dodaj lodówki i zamrażarki — system będzie kontrolował ich temperatury 2x dziennie (rano i wieczorem). Usterki zgłaszasz z wyborem konkretnego urządzenia.
              </p>
            </div>

            {/* Quick-add presets */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Szybkie dodawanie
              </div>
              <div className="grid grid-cols-2 gap-2">
                {EQUIPMENT_PRESETS.map(preset => (
                  <button
                    key={preset.type}
                    onClick={() => {
                      setEqType(preset.type)
                      setEqName(preset.label)
                    }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      eqType === preset.type && eqName === preset.label
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="text-xl">{preset.icon}</div>
                    <div className="text-xs font-semibold mt-1">{preset.label}</div>
                    <div className="text-[10px] text-gray-400">{preset.temp_min}° – {preset.temp_max}°C</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom name + add */}
            <div className="bg-white rounded-2xl border-2 border-brand-200 p-4 shadow-sm space-y-3">
              <input
                value={eqName}
                onChange={e => setEqName(e.target.value)}
                placeholder="Nazwa urządzenia (np. Lodówka mięso)"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={addEquipmentToList}
                disabled={!eqName.trim()}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl disabled:opacity-40 transition-all active:scale-[0.97]"
              >
                Dodaj {eqName.trim() || 'urządzenie'}
              </button>
            </div>

            {/* Added list */}
            {equipment.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-sm">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  Dodane urządzenia ({equipment.length})
                </div>
                <div className="space-y-1.5">
                  {equipment.map((eq, i) => {
                    const preset = EQUIPMENT_PRESETS.find(p => p.type === eq.type)
                    return (
                      <div key={i} className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{preset?.icon || '🔧'}</span>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{eq.name}</div>
                            <div className="text-[10px] text-gray-400">{eq.temp_min}° – {eq.temp_max}°C</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setEquipment(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-red-500 text-sm"
                        >✕</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <button
              onClick={handleNext}
              disabled={saving}
              className="btn-orange w-full"
            >
              {saving ? 'Zapisuję...' : equipment.length > 0 ? 'Zapisz i dalej →' : 'Pomiń — dodasz później →'}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 4: Checklist + Cleaning
           ═══════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-5xl mb-2">✅</div>
              <h1 className="text-2xl font-bold text-gray-900">Checklist i sprzątanie</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Przygotowaliśmy domyślne pozycje — dostosuj je do swojego lokalu.
                Pracownicy będą odhaczać punkty na każdej zmianie.
              </p>
            </div>

            {/* Morning checklist */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🌅</span>
                <div className="text-sm font-bold text-gray-900">Zmiana poranna</div>
                <span className="text-[10px] text-gray-400 ml-auto">{morningItems.length} pozycji</span>
              </div>
              <div className="space-y-1.5">
                {morningItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-orange-50/50 rounded-xl px-3 py-2">
                    <span className="text-xs text-gray-400">{i + 1}.</span>
                    <span className="text-sm text-gray-700 flex-1">{item}</span>
                    <button
                      onClick={() => setMorningItems(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-300 hover:text-red-500 text-xs"
                    >✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={newCheckItem}
                  onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCheckItem.trim()) {
                      setMorningItems(prev => [...prev, newCheckItem.trim()])
                      setNewCheckItem('')
                    }
                  }}
                  placeholder="Dodaj punkt..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-brand-500 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (newCheckItem.trim()) {
                      setMorningItems(prev => [...prev, newCheckItem.trim()])
                      setNewCheckItem('')
                    }
                  }}
                  className="px-3 py-2 bg-brand-500 text-white rounded-xl text-sm font-bold"
                >+</button>
              </div>
            </div>

            {/* Evening checklist */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🌙</span>
                <div className="text-sm font-bold text-gray-900">Zmiana wieczorna</div>
                <span className="text-[10px] text-gray-400 ml-auto">{eveningItems.length} pozycji</span>
              </div>
              <div className="space-y-1.5">
                {eveningItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-violet-50/50 rounded-xl px-3 py-2">
                    <span className="text-xs text-gray-400">{i + 1}.</span>
                    <span className="text-sm text-gray-700 flex-1">{item}</span>
                    <button
                      onClick={() => setEveningItems(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-300 hover:text-red-500 text-xs"
                    >✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={step === 4 ? '' : ''}
                  onChange={e => {
                    const val = e.target.value
                    // We use a separate local approach for evening
                    e.target.dataset.val = val
                  }}
                  onKeyDown={e => {
                    const val = (e.target as HTMLInputElement).value
                    if (e.key === 'Enter' && val.trim()) {
                      setEveningItems(prev => [...prev, val.trim()])
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }}
                  placeholder="Dodaj punkt..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Cleaning zones */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🧹</span>
                <div className="text-sm font-bold text-gray-900">Strefy sprzątania</div>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Harmonogram sprzątania — pracownicy odhaczają w zakładce Sprzątanie.
                Domyślne strefy możesz edytować lub usunąć.
              </p>
              <div className="space-y-1.5">
                {cleaningZones.map((zone, i) => (
                  <div key={i} className="flex items-center justify-between bg-emerald-50/50 rounded-xl px-3 py-2">
                    <div>
                      <div className="text-sm text-gray-700">{zone.name}</div>
                      <div className="text-[10px] text-gray-400">{zone.frequency}</div>
                    </div>
                    <button
                      onClick={() => setCleaningZones(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-300 hover:text-red-500 text-xs"
                    >✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={newCleanZone}
                  onChange={e => setNewCleanZone(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCleanZone.trim()) {
                      setCleaningZones(prev => [...prev, { name: newCleanZone.trim(), frequency: 'co tydzień' }])
                      setNewCleanZone('')
                    }
                  }}
                  placeholder="Nowa strefa..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-brand-500 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (newCleanZone.trim()) {
                      setCleaningZones(prev => [...prev, { name: newCleanZone.trim(), frequency: 'co tydzień' }])
                      setNewCleanZone('')
                    }
                  }}
                  className="px-3 py-2 bg-brand-500 text-white rounded-xl text-sm font-bold"
                >+</button>
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            <button
              onClick={handleNext}
              disabled={saving}
              className="btn-orange w-full"
            >
              {saving ? 'Zapisuję...' : 'Zapisz i dalej — Food Cost →'}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5: Food Cost link
           ═══════════════════════════════════════════════════ */}
        {step === 5 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-5xl mb-2">💰</div>
              <h1 className="text-2xl font-bold text-gray-900">Food Cost</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Podaj link do arkusza Google Sheets lub Excel Online z cenami surowców.
                System automatycznie wyliczy koszt dań i porówna ceny na fakturach.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-4">
              <div>
                <div className="text-[10px] text-gray-400 uppercase mb-1">Link do arkusza z cenami</div>
                <input
                  value={foodCostUrl}
                  onChange={e => setFoodCostUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-2">
                <div className="font-semibold">Jak przygotować arkusz?</div>
                <div>1. Stwórz arkusz z kolumnami: <strong>Nazwa produktu</strong>, <strong>Jednostka</strong> (kg/szt/l), <strong>Cena netto</strong></div>
                <div>2. Udostępnij arkusz jako "Każdy z linkiem może wyświetlać"</div>
                <div>3. Wklej link tutaj</div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              <strong>Nie masz jeszcze arkusza?</strong> Spokojnie — możesz pominąć ten krok i dodać link później w Ustawieniach → Food Cost.
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            <button
              onClick={handleNext}
              disabled={saving}
              className="btn-orange w-full text-lg py-4"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Zapisuję...
                </span>
              ) : (
                foodCostUrl.trim() ? 'Zakończ konfigurację ✅' : 'Pomiń i przejdź do aplikacji →'
              )}
            </button>

            {/* Summary of what was configured */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Co już skonfigurowałeś
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className={workers.length > 0 ? 'text-emerald-500' : 'text-gray-300'}>
                    {workers.length > 0 ? '✓' : '○'}
                  </span>
                  <span className="text-gray-700">
                    Pracownicy: {workers.length > 0 ? `${workers.length} dodanych` : 'pominięto'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={equipment.length > 0 ? 'text-emerald-500' : 'text-gray-300'}>
                    {equipment.length > 0 ? '✓' : '○'}
                  </span>
                  <span className="text-gray-700">
                    Sprzęt: {equipment.length > 0 ? `${equipment.length} urządzeń` : 'pominięto'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span className="text-gray-700">
                    Checklist: {morningItems.length + eveningItems.length} pozycji
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span className="text-gray-700">
                    Sprzątanie: {cleaningZones.length} stref
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
