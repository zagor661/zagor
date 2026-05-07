'use client'
import { useState, useEffect, useRef } from 'react'
import supabase from '@/lib/supabase'
import { ALL_MODULES, DEFAULT_ENABLED_MODULES } from '@/lib/roles'

// ============================================================
// /join — Landing + rejestracja w jednym flow
// Scrollowalny one-pager: powitanie → funkcje → coming soon → formularz
// ============================================================

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restauracja', icon: '🍽️' },
  { value: 'bar', label: 'Bar / Pub', icon: '🍺' },
  { value: 'club', label: 'Club', icon: '🪩' },
  { value: 'cafe', label: 'Kawiarnia', icon: '☕' },
  { value: 'fastfood', label: 'Fast food', icon: '🍔' },
  { value: 'hotel', label: 'Hotel / Catering', icon: '🏨' },
]

const FEATURES = [
  {
    icon: '✅', title: 'Checklist zmianowy',
    desc: 'Poranna i wieczorna lista zadań do odhaczenia. Tworzysz ją raz — pracownicy wypełniają codziennie. Widzisz postęp na żywo bez wchodzenia do kuchni.',
    details: 'Konfigurowalne per lokal. Osobne listy na zmianę poranną i wieczorną. Historia wykonania z datą i godziną.',
    tag: 'Operacje', tagColor: '#ec7a11',
  },
  {
    icon: '📋', title: 'Zadania',
    desc: 'Przydzielaj konkretne zadania konkretnym osobom. Ustaw priorytet, termin i śledź status: nowe → w toku → gotowe.',
    details: 'Push notification na telefon pracownika. Komentarze pod zadaniem. Filtrowanie po osobie i statusie.',
    tag: 'Operacje', tagColor: '#ec7a11',
  },
  {
    icon: '📅', title: 'Grafik pracy',
    desc: 'Grafik tygodniowy z widokiem dziennym. Każdy pracownik widzi tylko swoje zmiany — zero nieporozumień kto kiedy pracuje.',
    details: 'Import z Google Sheets jednym kliknięciem. Automatyczne liczenie godzin. Widok miesięczny.',
    tag: 'Zespół', tagColor: '#3b82f6',
  },
  {
    icon: '🌡️', title: 'Temperatury HACCP',
    desc: 'Kontrola temperatur lodówek, zamrażarek i pieców 2x dziennie. Alert gdy wartość wyjdzie poza normę — natychmiast na telefon.',
    details: 'Pełna historia pomiarów gotowa do pokazania przy kontroli Sanepidu. Dodawanie własnych urządzeń.',
    tag: 'HACCP', tagColor: '#16a34a',
  },
  {
    icon: '💰', title: 'Food Cost',
    desc: 'Podłącz arkusz Excel z cenami surowców. System policzy procent food costu i porówna z cenami na fakturach.',
    details: 'Widzisz dokładnie ile zarabiasz na każdym daniu. Alerty gdy dostawca podniesie cenę.',
    tag: 'Finanse', tagColor: '#be185d',
  },
  {
    icon: '🧾', title: 'Faktury OCR',
    desc: 'Zrób zdjęcie faktury telefonem — sztuczna inteligencja odczyta pozycje, ceny i dostawcę automatycznie.',
    details: 'Porównanie z cenami food cost. Koniec ręcznego wpisywania faktur. Archiwum wszystkich dokumentów.',
    tag: 'AI', tagColor: '#7c3aed',
  },
  {
    icon: '🧹', title: 'Harmonogram sprzątania',
    desc: 'Zdefiniuj strefy i częstotliwość — codziennie, co tydzień, co miesiąc. Pracownicy odhaczają z datą wykonania.',
    details: 'Historia do wglądu przy kontroli sanitarnej. Przypisywanie stref do konkretnych osób.',
    tag: 'HACCP', tagColor: '#16a34a',
  },
  {
    icon: '📡', title: 'WOKI TALKIE',
    desc: 'Wbudowany komunikator głosowy i tekstowy. Nagraj wiadomość — AI ją transkrybuje i automatycznie wyciąga z niej zadania.',
    details: 'Transkrypcja OpenAI Whisper. Automatyczne tworzenie zadań przez GPT. Nie potrzebujesz WhatsAppa.',
    tag: 'AI', tagColor: '#7c3aed',
  },
  {
    icon: '⭐', title: 'System gwiazdek',
    desc: 'Nagradzaj najlepszych pracowników. Pasy kolorów jak w karate — od żółtego do czarnego. Motywacja widoczna od logowania.',
    details: 'Ranking pracowników. Gwiazdki widoczne na ekranie logowania przy awatarze.',
    tag: 'Zespół', tagColor: '#3b82f6',
  },
  {
    icon: '📊', title: 'Raport dzienny',
    desc: 'Automatyczne podsumowanie dnia generowane o północy: co zrobiono, co pominięto, straty, temperatury.',
    details: 'Eksport do PDF. Porównanie z poprzednimi dniami. Rano masz pełen obraz bez pytania kogokolwiek.',
    tag: 'Raporty', tagColor: '#0891b2',
  },
  {
    icon: '🛡️', title: 'Sanepid Hub',
    desc: 'Pełna dokumentacja HACCP w jednym miejscu. 96-punktowa checklista kontroli sanitarnej gotowa do wydruku.',
    details: 'Generowanie raportu PDF na żądanie. Dostawy z odbiorem temperatury. Alergeny.',
    tag: 'HACCP', tagColor: '#16a34a',
  },
  {
    icon: '🔧', title: 'Awarie i usterki',
    desc: 'Zgłaszanie usterek sprzętu ze zdjęciem. Status naprawy widoczny dla zespołu. Historia serwisowa.',
    details: 'Priorytet: pilne / normalne. Powiadomienie do właściciela. Lista sprzętu z datami przeglądów.',
    tag: 'Operacje', tagColor: '#ec7a11',
  },
]

const COMING_SOON = [
  { icon: '🎓', title: 'Onboarding pracowników', desc: 'Szkolenia, materiały wideo, quiz wiedzy dla nowych osób w zespole' },
  { icon: '📱', title: 'Kiosk zamówień', desc: 'Integracja z systemem zamówień — klient zamawia na tablecie przy stoliku' },
  { icon: '📈', title: 'Analityka zaawansowana', desc: 'Trendy food costu, wydajność zespołu, porównanie miesięcy' },
  { icon: '🔗', title: 'Integracje', desc: 'GoPOS, Google Drive, systemy księgowe — automatyczny przepływ danych' },
  { icon: '🌍', title: 'Multi-język', desc: 'Interfejs w języku pracownika — ukraiński, angielski, polski' },
  { icon: '⏰', title: 'Rejestracja czasu pracy', desc: 'Clock IN/OUT z geolokalizacją, automatyczne liczenie godzin i nadgodzin' },
]

// Worker interface for form
interface NewWorker {
  name: string
  role: string
  pin: string
}

export default function JoinPage() {
  // Form state
  const [formStep, setFormStep] = useState(0) // 0=not started, 1=lokal, 2=owner, 3=workers, 4=modules, 5=done
  const [locName, setLocName] = useState('')
  const [locAddress, setLocAddress] = useState('')
  const [businessType, setBusinessType] = useState('restaurant')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPin, setOwnerPin] = useState('')
  const [workers, setWorkers] = useState<NewWorker[]>([])
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerRole, setNewWorkerRole] = useState('kitchen')
  const [newWorkerPin, setNewWorkerPin] = useState('')
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set(DEFAULT_ENABLED_MODULES))
  const [scheduleLink, setScheduleLink] = useState('')
  const [foodCostLink, setFoodCostLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  const [expandedFeature, setExpandedFeature] = useState<number | null>(null)
  const [debugInfo, setDebugInfo] = useState('')

  const formRef = useRef<HTMLDivElement>(null)

  function scrollToForm() {
    setFormStep(1)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  function generatePin(): string {
    return String(Math.floor(1000 + Math.random() * 9000))
  }

  function addWorker() {
    if (!newWorkerName.trim()) return
    const pin = newWorkerPin || generatePin()
    setWorkers(prev => [...prev, { name: newWorkerName.trim(), role: newWorkerRole, pin }])
    setNewWorkerName('')
    setNewWorkerPin('')
    setNewWorkerRole('kitchen')
  }

  function removeWorker(idx: number) {
    setWorkers(prev => prev.filter((_, i) => i !== idx))
  }

  function toggleModule(id: string) {
    setEnabledModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!locName.trim() || !ownerName.trim() || ownerPin.length !== 4) {
      setError('Uzupełnij wszystkie wymagane pola (nazwa lokalu, Twoje imię, 4-cyfrowy PIN)')
      return
    }
    // Validate Google Drive links if modules are enabled
    if (enabledModules.has('/schedule') && !scheduleLink.trim()) {
      setError('Moduł "Grafik pracy" wymaga linku do Google Sheets. Podaj link lub odznacz moduł.')
      return
    }
    if (enabledModules.has('/food-cost') && !foodCostLink.trim()) {
      setError('Moduł "Food Cost" wymaga linku do arkusza Google. Podaj link lub odznacz moduł.')
      return
    }
    setSaving(true)
    setError('')

    try {
      // 1. Create location (only columns that exist in DB)
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

      // 1b. Save Google Drive links in location_settings (if provided)
      const settingsPayload: Record<string, string> = {}
      if (scheduleLink.trim()) settingsPayload.schedule_sheet_url = scheduleLink.trim()
      if (foodCostLink.trim()) settingsPayload.food_cost_sheet_url = foodCostLink.trim()
      if (Object.keys(settingsPayload).length > 0) {
        // Try to save — if location_settings table doesn't exist, just log and continue
        try {
          await supabase.from('schedule_settings').upsert({
            location_id: loc.id,
            ...settingsPayload,
          }, { onConflict: 'location_id' })
        } catch (e) {
          console.warn('[join] Could not save sheet links to schedule_settings:', e)
        }
      }

      // 2. Create owner
      const debugLog: string[] = []
      debugLog.push(`Location created: ${loc.id}`)

      const ownerRes = await fetch('/api/add-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: ownerName.trim(), pin: ownerPin, role: 'owner', location_id: loc.id }),
      })
      const ownerData = await ownerRes.json()
      debugLog.push(`Owner API: status=${ownerRes.status} ok=${ownerData.ok} id=${ownerData.id || 'none'} error=${ownerData.error || 'none'}`)

      if (!ownerRes.ok || !ownerData.ok) throw new Error(ownerData.error || 'Błąd tworzenia konta')

      // Update location with owner_id
      await supabase.from('locations').update({ owner_id: ownerData.id }).eq('id', loc.id)

      // 3. Create workers (including additional owners)
      for (const w of workers) {
        try {
          const wRes = await fetch('/api/add-worker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: w.name, pin: w.pin, role: w.role, location_id: loc.id }),
          })
          const wData = await wRes.json()
          debugLog.push(`Worker "${w.name}": status=${wRes.status} ok=${wData.ok} id=${wData.id || 'none'} error=${wData.error || 'none'}`)
        } catch (e: any) {
          debugLog.push(`Worker "${w.name}": FETCH ERROR: ${e.message}`)
        }
      }

      // 4b. Verify user_locations
      const { data: verifyLinks, error: verifyErr } = await supabase
        .from('user_locations')
        .select('user_id')
        .eq('location_id', loc.id)
      debugLog.push(`user_locations for ${loc.id}: ${verifyLinks?.length || 0} entries, error=${verifyErr?.message || 'none'}`)

      setDebugInfo(debugLog.join('\n'))

      // 4. Grant temp admin access
      await fetch('/api/admin/temp-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: loc.id, days: 7 }),
      })

      setLoginUrl(`${window.location.origin}/login?loc=${loc.id}`)
      setFormStep(5)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Błąd podczas tworzenia — spróbuj ponownie')
    } finally {
      setSaving(false)
    }
  }

  const ROLE_OPTIONS = [
    { value: 'owner', label: 'Właściciel', icon: '🥷' },
    { value: 'manager', label: 'Menedżer', icon: '👔' },
    { value: 'kitchen', label: 'Kuchnia', icon: '👨‍🍳' },
    { value: 'hall', label: 'Sala', icon: '🍽️' },
    { value: 'bar', label: 'Bar', icon: '🍸' },
  ]

  const roleIcon = (r: string) => ROLE_OPTIONS.find(o => o.value === r)?.icon || '👤'
  const roleLabel = (r: string) => ROLE_OPTIONS.find(o => o.value === r)?.label || r

  // Group modules by category
  const categories = ALL_MODULES.reduce((acc, mod) => {
    if (!acc[mod.category]) acc[mod.category] = []
    acc[mod.category].push(mod)
    return acc
  }, {} as Record<string, typeof ALL_MODULES>)

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* ━━━ HERO ━━━ */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #fef7ee 0%, #fff 100%)' }}>
        <div className="max-w-3xl mx-auto px-6 pt-20 pb-24 text-center relative z-10">
          <div className="text-6xl mb-6">👨‍🍳</div>
          <h1 className="text-5xl sm:text-6xl font-black text-gray-900 tracking-tight leading-none mb-6">
            Kitchen<span className="text-brand-500">Ops</span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-400 font-light max-w-lg mx-auto mb-4 leading-relaxed">
            System zarządzania restauracją<br />stworzony przez restauratora.
          </p>
          <div className="inline-flex items-center gap-3 bg-white/80 backdrop-blur rounded-full px-5 py-2.5 border border-gray-100 shadow-sm mb-10">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-gray-500">Beta · Działa na żywo</span>
          </div>

          <div className="max-w-xl mx-auto text-left bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3 text-lg">Skąd się wziął KitchenOps?</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-3">
              KitchenOps powstał z prawdziwej potrzeby. Prowadzę restaurację i wiem, ile czasu zjadają codzienne operacje — checklisty na kartkach, grafik w Excelu, temperatury w zeszycie, komunikacja przez WhatsAppa.
            </p>
            <p className="text-gray-500 text-sm leading-relaxed mb-3">
              Postanowiłem zbudować jedno narzędzie, które zbierze to wszystko w jednym miejscu — na telefonie, bez szkoleń, gotowe w 5 minut.
            </p>
            <p className="text-gray-500 text-sm leading-relaxed">
              Jeśli prowadzisz restaurację, bar, kawiarnię czy club — to jest dla Ciebie. Bo <strong className="text-gray-700">w gastro ręka rękę myje</strong>.
            </p>
          </div>
        </div>
        {/* Decorative blobs */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, rgba(236,122,17,0.12) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgba(236,122,17,0.1) 0%, transparent 70%)' }} />
      </section>

      {/* ━━━ FEATURE SHOWCASE ━━━ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-3">Moduły</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight mb-4">Co dostajesz?</h2>
            <p className="text-gray-400 text-lg">Przewiń w dół i poznaj każdą funkcję. Kliknij żeby zobaczyć szczegóły.</p>
          </div>

          <div className="space-y-4">
            {FEATURES.map((f, i) => {
              const isOrange = i % 2 === 1
              const isExpanded = expandedFeature === i
              return (
                <div
                  key={i}
                  onClick={() => setExpandedFeature(isExpanded ? null : i)}
                  className="rounded-2xl border-2 cursor-pointer transition-all duration-300 overflow-hidden"
                  style={{
                    background: isOrange ? 'linear-gradient(135deg, #fef7ee 0%, #fdedd3 100%)' : '#fff',
                    borderColor: isExpanded ? '#ec7a11' : isOrange ? '#f9d7a5' : '#f3f4f6',
                    boxShadow: isExpanded ? '0 8px 32px rgba(236,122,17,0.12)' : 'none',
                  }}
                >
                  <div className="p-6 flex items-start gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                      style={{ background: isOrange ? 'rgba(236,122,17,0.1)' : '#f9fafb' }}
                    >
                      {f.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-extrabold text-gray-900 text-lg">{f.title}</h3>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md"
                          style={{ background: `${f.tagColor}15`, color: f.tagColor }}
                        >
                          {f.tag}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-200/50">
                          <p className="text-sm text-gray-600 leading-relaxed">{f.details}</p>
                        </div>
                      )}
                    </div>
                    <div className="text-gray-300 text-xl mt-1 flex-shrink-0 transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>
                      ▾
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ━━━ COMING SOON ━━━ */}
      <section className="py-20 px-6" style={{ background: 'linear-gradient(180deg, #f9fafb 0%, #fff 100%)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Coming soon</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight mb-4">Nad czym pracujemy</h2>
            <p className="text-gray-400 text-lg">Te funkcje są w trakcie budowy. Dołącz teraz — dostaniesz je jako pierwszy.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMING_SOON.map((item, i) => (
              <div key={i} className="flex items-start gap-4 bg-white rounded-xl border border-gray-100 p-5 opacity-75">
                <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-2xl flex-shrink-0">
                  {item.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-900 text-sm">{item.title}</h4>
                    <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded uppercase">Soon</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ CTA ━━━ */}
      <section className="py-24 px-6 text-center" style={{ background: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="text-5xl mb-6">🤝</div>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4 leading-tight">
            W gastro<br />ręka rękę myje.
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-md mx-auto leading-relaxed">
            Wiesz już, jak możemy Ci pomóc. Tematy, które zaprzątają Ci głowę — bierzemy na barki. Zaczynamy?
          </p>
          <button
            onClick={scrollToForm}
            className="inline-flex items-center gap-2 bg-brand-500 text-white font-bold text-lg px-10 py-5 rounded-2xl hover:bg-brand-600 transition-all active:scale-95 shadow-lg shadow-brand-500/20"
          >
            Tak, konfiguruj mój lokal →
          </button>
        </div>
      </section>

      {/* ━━━ REGISTRATION FORM ━━━ */}
      <div ref={formRef}>
        {formStep >= 1 && formStep < 5 && (
          <section className="py-20 px-6" style={{ background: 'linear-gradient(180deg, #fef7ee 0%, #fff 100%)' }}>
            <div className="max-w-lg mx-auto">

              {/* Progress */}
              <div className="mb-10">
                <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                  <span>Krok {formStep} z 4</span>
                  <span>{Math.round((formStep / 4) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${(formStep / 4) * 100}%` }} />
                </div>
              </div>

              {/* ─── KROK 1: LOKAL ─── */}
              {formStep === 1 && (
                <div>
                  <div className="text-center mb-8">
                    <div className="text-4xl mb-3">🏪</div>
                    <h3 className="text-2xl font-black text-gray-900 mb-2">Twój lokal</h3>
                    <p className="text-gray-400 text-sm">Podaj podstawowe informacje o restauracji</p>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Nazwa lokalu *</label>
                      <input
                        value={locName}
                        onChange={e => setLocName(e.target.value)}
                        placeholder="np. Moja Restauracja"
                        className="input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Adres (opcjonalnie)</label>
                      <input
                        value={locAddress}
                        onChange={e => setLocAddress(e.target.value)}
                        placeholder="np. ul. Główna 15, Kraków"
                        className="input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">Typ lokalu</label>
                      <div className="grid grid-cols-3 gap-2">
                        {BUSINESS_TYPES.map(bt => (
                          <button
                            key={bt.value}
                            onClick={() => setBusinessType(bt.value)}
                            className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${
                              businessType === bt.value
                                ? 'border-brand-500 bg-brand-50 shadow-sm'
                                : 'border-gray-100 bg-white hover:border-gray-200'
                            }`}
                          >
                            <span className="text-2xl">{bt.icon}</span>
                            <span className="text-xs font-bold text-gray-700">{bt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => { if (locName.trim()) setFormStep(2) }}
                    disabled={!locName.trim()}
                    className="btn-orange mt-8"
                  >
                    Dalej — Twoje konto →
                  </button>
                </div>
              )}

              {/* ─── KROK 2: OWNER ─── */}
              {formStep === 2 && (
                <div>
                  <div className="text-center mb-8">
                    <div className="text-4xl mb-3">🥷</div>
                    <h3 className="text-2xl font-black text-gray-900 mb-2">Twoje konto właściciela</h3>
                    <p className="text-gray-400 text-sm">To Ty będziesz mieć pełny dostęp do systemu</p>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Twoje imię i nazwisko *</label>
                      <input
                        value={ownerName}
                        onChange={e => setOwnerName(e.target.value)}
                        placeholder="np. Jan Kowalski"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">PIN do logowania (4 cyfry) *</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={ownerPin}
                        onChange={e => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="input text-center text-3xl tracking-[0.5em] font-bold"
                      />
                      <p className="text-xs text-gray-400 mt-2">Tym PINem będziesz się logować do aplikacji na telefonie</p>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button onClick={() => setFormStep(1)} className="btn-white flex-1">← Wstecz</button>
                    <button
                      onClick={() => { if (ownerName.trim() && ownerPin.length === 4) setFormStep(3) }}
                      disabled={!ownerName.trim() || ownerPin.length !== 4}
                      className="btn-orange flex-1"
                    >
                      Dalej →
                    </button>
                  </div>
                </div>
              )}

              {/* ─── KROK 3: PRACOWNICY ─── */}
              {formStep === 3 && (
                <div>
                  <div className="text-center mb-8">
                    <div className="text-4xl mb-3">👥</div>
                    <h3 className="text-2xl font-black text-gray-900 mb-2">Twój zespół</h3>
                    <p className="text-gray-400 text-sm">Dodaj pracowników — możesz to zrobić też później w aplikacji</p>
                  </div>

                  {/* List of added workers */}
                  {workers.length > 0 && (
                    <div className="space-y-2 mb-6">
                      {workers.map((w, i) => (
                        <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4">
                          <span className="text-2xl">{roleIcon(w.role)}</span>
                          <div className="flex-1">
                            <div className="font-bold text-gray-900 text-sm">{w.name}</div>
                            <div className="text-xs text-gray-400">{roleLabel(w.role)} · PIN: {w.pin}</div>
                          </div>
                          <button onClick={() => removeWorker(i)} className="text-red-400 hover:text-red-600 text-lg">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add worker form */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Imię i nazwisko</label>
                      <input
                        value={newWorkerName}
                        onChange={e => setNewWorkerName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addWorker()}
                        placeholder="np. Anna Nowak"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Stanowisko</label>
                      <div className="grid grid-cols-5 gap-2">
                        {ROLE_OPTIONS.map(r => (
                          <button
                            key={r.value}
                            onClick={() => setNewWorkerRole(r.value)}
                            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-center ${
                              newWorkerRole === r.value
                                ? 'border-brand-500 bg-brand-50'
                                : 'border-gray-100 bg-white hover:border-gray-200'
                            }`}
                          >
                            <span className="text-lg">{r.icon}</span>
                            <span className="text-[9px] font-bold text-gray-600 leading-tight">{r.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={addWorker}
                      disabled={!newWorkerName.trim()}
                      className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-all disabled:opacity-40"
                    >
                      + Dodaj pracownika
                    </button>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button onClick={() => setFormStep(2)} className="btn-white flex-1">← Wstecz</button>
                    <button onClick={() => setFormStep(4)} className="btn-orange flex-1">
                      {workers.length > 0 ? 'Dalej — Moduły →' : 'Pomiń — Moduły →'}
                    </button>
                  </div>
                </div>
              )}

              {/* ─── KROK 4: MODUŁY ─── */}
              {formStep === 4 && (
                <div>
                  <div className="text-center mb-8">
                    <div className="text-4xl mb-3">⚙️</div>
                    <h3 className="text-2xl font-black text-gray-900 mb-2">Wybierz moduły</h3>
                    <p className="text-gray-400 text-sm">Włącz te, których potrzebujesz. Możesz zmienić to w każdej chwili.</p>
                  </div>

                  <div className="flex gap-2 mb-6">
                    <button onClick={() => setEnabledModules(new Set(ALL_MODULES.map(m => m.id)))} className="text-xs font-bold text-brand-600 bg-brand-50 px-4 py-2 rounded-lg hover:bg-brand-100 transition-all">
                      Zaznacz wszystkie
                    </button>
                    <button onClick={() => setEnabledModules(new Set(DEFAULT_ENABLED_MODULES))} className="text-xs font-bold text-gray-500 bg-gray-100 px-4 py-2 rounded-lg hover:bg-gray-200 transition-all">
                      Domyślne
                    </button>
                  </div>

                  <div className="space-y-6">
                    {Object.entries(categories).map(([cat, mods]) => (
                      <div key={cat}>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{cat}</h4>
                        <div className="space-y-2">
                          {mods.map(mod => {
                            const isOn = enabledModules.has(mod.id)
                            const needsLink = mod.id === '/schedule' || mod.id === '/food-cost'
                            const linkValue = mod.id === '/schedule' ? scheduleLink : mod.id === '/food-cost' ? foodCostLink : ''
                            const setLinkValue = mod.id === '/schedule' ? setScheduleLink : mod.id === '/food-cost' ? setFoodCostLink : () => {}
                            return (
                              <div key={mod.id}>
                                <button
                                  onClick={() => toggleModule(mod.id)}
                                  className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                                    isOn ? 'border-brand-400 bg-brand-50/50' : 'border-gray-100 bg-white opacity-60'
                                  } ${needsLink && isOn ? 'rounded-b-none border-b-0' : ''}`}
                                >
                                  <span className="text-2xl mt-0.5">{mod.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-gray-900 text-sm">{mod.title}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">{mod.subtitle}</div>
                                  </div>
                                  <div className={`w-11 h-6 rounded-full flex items-center transition-all flex-shrink-0 mt-1 ${isOn ? 'bg-brand-500 justify-end' : 'bg-gray-200 justify-start'}`}>
                                    <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                                  </div>
                                </button>
                                {needsLink && isOn && (
                                  <div className="border-2 border-t-0 border-brand-400 bg-brand-50/30 rounded-b-xl px-4 py-3">
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">
                                      📎 Link do Google Sheets *
                                    </label>
                                    <input
                                      value={linkValue}
                                      onChange={e => setLinkValue(e.target.value)}
                                      onClick={e => e.stopPropagation()}
                                      placeholder="https://docs.google.com/spreadsheets/d/..."
                                      className="input text-sm"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      {mod.id === '/schedule'
                                        ? 'Link do arkusza z grafikiem pracy. Bez niego moduł nie zadziała.'
                                        : 'Link do arkusza z cenami surowców. Bez niego moduł nie zadziała.'}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 mt-8">
                    <button onClick={() => setFormStep(3)} className="btn-white flex-1">← Wstecz</button>
                    <button
                      onClick={handleSubmit}
                      disabled={saving}
                      className="btn-orange flex-1"
                    >
                      {saving ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Tworzę...
                        </span>
                      ) : (
                        'Stwórz mój lokal 🚀'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── KROK 5: SUKCES ─── */}
        {formStep === 5 && (
          <section className="py-24 px-6 text-center" style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #fff 100%)' }}>
            <div className="max-w-lg mx-auto">
              <div className="text-6xl mb-6">🎉</div>
              <h2 className="text-3xl font-black text-gray-900 mb-4">Gotowe!</h2>
              <p className="text-gray-500 text-lg mb-8">
                Twój lokal <strong className="text-gray-900">{locName}</strong> jest skonfigurowany.
                {workers.length > 0 && <> Dodano {workers.length} {workers.length === 1 ? 'pracownika' : 'pracowników'}.</>}
              </p>

              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-8">
                <p className="text-sm text-gray-400 mb-1 font-medium">Twój unikalny link do logowania:</p>
                <p className="text-xs text-gray-400 mb-3">Ten link jest tylko dla Twojego lokalu. Udostępnij go pracownikom.</p>
                <div className="bg-gray-50 rounded-xl px-4 py-3 font-mono text-sm text-gray-700 break-all border border-gray-200">
                  {loginUrl}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(loginUrl) }}
                  className="mt-3 text-sm font-bold text-brand-600 hover:text-brand-700"
                >
                  📋 Skopiuj link
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 text-left mb-8">
                <h4 className="font-bold text-gray-900 text-sm mb-3">Dane do logowania:</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Właściciel:</span>
                    <span className="font-bold text-gray-900">{ownerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">PIN:</span>
                    <span className="font-bold text-gray-900 font-mono">{ownerPin}</span>
                  </div>
                  {workers.map((w, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-400">{roleIcon(w.role)} {w.name}:</span>
                      <span className="font-bold text-gray-900 font-mono">{w.pin}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { localStorage.removeItem('kitchenops_user'); window.location.href = loginUrl }}
                className="btn-orange inline-block"
              >
                Zaloguj się teraz →
              </button>

              {/* Debug removed for production */}
            </div>
          </section>
        )}
      </div>

      {/* ━━━ FOOTER ━━━ */}
      <footer className="py-8 px-6 text-center border-t border-gray-100">
        <p className="text-sm text-gray-400">
          © 2026 KitchenOps · Zbudowany w Bielsku-Białej
        </p>
      </footer>
    </div>
  )
}
