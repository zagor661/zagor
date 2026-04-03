'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

interface Unit {
  id: string
  name: string
  unit_type: string
  temp_min: number
  temp_max: number
}

interface SavedReading {
  unit_id: string
  temperature: number
  is_out_of_range: boolean
  corrective_action: string | null
}

export default function TemperaturePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useUser()
  const [units, setUnits] = useState<Unit[]>([])

  // Morning temps & actions
  const [morningTemps, setMorningTemps] = useState<Record<string, string>>({})
  const [morningActions, setMorningActions] = useState<Record<string, string>>({})
  const [morningSaved, setMorningSaved] = useState(false)
  const [morningLogId, setMorningLogId] = useState<string | null>(null)

  // Evening temps & actions
  const [eveningTemps, setEveningTemps] = useState<Record<string, string>>({})
  const [eveningActions, setEveningActions] = useState<Record<string, string>>({})
  const [eveningSaved, setEveningSaved] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'morning' | 'evening' | null>(null)
  const [done, setDone] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (authLoading || !user) return
    async function load() {
      // Load units
      const { data: unitsData } = await supabase
        .from('cooling_units')
        .select('*')
        .eq('location_id', user!.location_id)
        .eq('is_active', true)
        .order('sort_order')
      if (unitsData) setUnits(unitsData)

      // Check if morning already saved today
      const { data: existingLogs } = await supabase
        .from('temperature_logs')
        .select('id, shift_type')
        .eq('location_id', user!.location_id)
        .eq('record_date', today)

      if (existingLogs) {
        const morningLog = existingLogs.find((l: any) => l.shift_type === 'morning')
        const eveningLog = existingLogs.find((l: any) => l.shift_type === 'evening')

        if (morningLog) {
          setMorningLogId(morningLog.id)
          setMorningSaved(true)
          // Load morning readings
          const { data: readings } = await supabase
            .from('temperature_readings')
            .select('*')
            .eq('log_id', morningLog.id)
          if (readings) {
            const t: Record<string, string> = {}
            const a: Record<string, string> = {}
            readings.forEach((r: SavedReading) => {
              t[r.unit_id] = r.temperature.toString()
              if (r.corrective_action) a[r.unit_id] = r.corrective_action
            })
            setMorningTemps(t)
            setMorningActions(a)
          }
        }

        if (eveningLog) {
          setEveningSaved(true)
          const { data: readings } = await supabase
            .from('temperature_readings')
            .select('*')
            .eq('log_id', eveningLog.id)
          if (readings) {
            const t: Record<string, string> = {}
            const a: Record<string, string> = {}
            readings.forEach((r: SavedReading) => {
              t[r.unit_id] = r.temperature.toString()
              if (r.corrective_action) a[r.unit_id] = r.corrective_action
            })
            setEveningTemps(t)
            setEveningActions(a)
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [user, authLoading])

  const isOutOfRange = (unit: Unit, val: string) => {
    const n = parseFloat(val)
    if (isNaN(n)) return false
    return n < unit.temp_min || n > unit.temp_max
  }

  const morningFilledCount = Object.values(morningTemps).filter(v => v !== '').length
  const eveningFilledCount = Object.values(eveningTemps).filter(v => v !== '').length

  const handleSave = async (shift: 'morning' | 'evening') => {
    if (!user) return
    setSaving(shift)

    const temps = shift === 'morning' ? morningTemps : eveningTemps
    const actions = shift === 'morning' ? morningActions : eveningActions

    try {
      // Create log
      const { data: log, error: logErr } = await supabase
        .from('temperature_logs')
        .insert({
          location_id: user.location_id,
          recorded_by: user.id,
          record_date: today,
          record_time: new Date().toTimeString().split(' ')[0].slice(0, 5),
          shift_type: shift,
          status: 'submitted',
        })
        .select()
        .single()

      if (logErr) throw logErr

      // Create readings
      const rows = units
        .filter(u => temps[u.id] && temps[u.id] !== '')
        .map(u => ({
          log_id: log.id,
          unit_id: u.id,
          temperature: parseFloat(temps[u.id]),
          is_out_of_range: isOutOfRange(u, temps[u.id]),
          corrective_action: actions[u.id] || null,
        }))

      if (rows.length > 0) {
        const { error } = await supabase.from('temperature_readings').insert(rows)
        if (error) throw error
      }

      if (shift === 'morning') {
        setMorningSaved(true)
        setMorningLogId(log.id)
      } else {
        setEveningSaved(true)

        // Evening save → send full report (morning + evening)
        // Fetch fresh morning data from DB to avoid stale state
        try {
          let freshMorningReadings: any[] = []
          if (morningLogId) {
            const { data: dbReadings } = await supabase
              .from('temperature_readings')
              .select('*, cooling_units:unit_id(name, temp_min, temp_max)')
              .eq('log_id', morningLogId)
            if (dbReadings) {
              freshMorningReadings = dbReadings.map((r: any) => ({
                name: r.cooling_units?.name || '',
                temperature: r.temperature,
                min: r.cooling_units?.temp_min || 0,
                max: r.cooling_units?.temp_max || 0,
                outOfRange: r.is_out_of_range,
                action: r.corrective_action || '',
                shift: 'morning',
              }))
            }
          }
          // Fallback to state if DB fetch failed
          const morningReadings = freshMorningReadings.length > 0
            ? freshMorningReadings
            : units
              .filter(u => morningTemps[u.id] && morningTemps[u.id] !== '')
              .map(u => ({
                name: u.name,
                temperature: morningTemps[u.id],
                min: u.temp_min,
                max: u.temp_max,
                outOfRange: isOutOfRange(u, morningTemps[u.id]),
                action: morningActions[u.id] || '',
                shift: 'morning',
              }))

          const eveningReadings = units
            .filter(u => eveningTemps[u.id] && eveningTemps[u.id] !== '')
            .map(u => ({
              name: u.name,
              temperature: eveningTemps[u.id],
              min: u.temp_min,
              max: u.temp_max,
              outOfRange: isOutOfRange(u, eveningTemps[u.id]),
              action: eveningActions[u.id] || '',
              shift: 'evening',
            }))

          await fetch('/api/send-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'temperature',
              data: {
                date: today,
                shift: 'full_day',
                author: user.full_name,
                location: user.location_name,
                morningReadings,
                eveningReadings,
                readings: [...morningReadings, ...eveningReadings],
              },
            }),
          })
        } catch (e) { console.log('Report skip:', e) }

        setDone(true)
        setTimeout(() => router.push('/'), 2000)
      }
    } catch (err: any) {
      alert('Błąd: ' + (err.message || 'Nieznany'))
    } finally {
      setSaving(null)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-700">Raport wysłany!</h2>
          <p className="text-gray-500 mt-2">Pomiary poranne + wieczorne zapisane i wysłane.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/')} className="text-brand-600 text-sm font-medium">← Powrót</button>
            <h1 className="text-xl font-bold mt-1">🌡️ Pomiary temperatur</h1>
            <p className="text-xs text-gray-400">{today}</p>
          </div>
        </div>

        {/* Status bar */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`py-2 px-3 rounded-xl text-center text-sm font-bold ${morningSaved ? 'bg-green-100 text-green-700' : 'bg-yellow-50 text-yellow-700 border-2 border-yellow-200'}`}>
            ☀️ Poranna {morningSaved ? '✅' : `(${morningFilledCount}/${units.length})`}
          </div>
          <div className={`py-2 px-3 rounded-xl text-center text-sm font-bold ${eveningSaved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            🌙 Wieczorna {eveningSaved ? '✅' : `(${eveningFilledCount}/${units.length})`}
          </div>
        </div>

        {/* MORNING SECTION */}
        {!morningSaved && (
          <>
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl px-4 py-3">
              <h2 className="font-bold text-orange-800">☀️ Zmiana poranna (12:00)</h2>
              <p className="text-xs text-orange-600">Wpisz temperatury z poranka</p>
            </div>

            {units.map(unit => {
              const val = morningTemps[unit.id] || ''
              const bad = isOutOfRange(unit, val)
              return (
                <div key={`m-${unit.id}`} className={`card border-2 ${bad ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-sm text-gray-900">{unit.name}</h3>
                      <span className="text-xs text-gray-400">
                        {unit.unit_type === 'freezer' ? '🧊 Zamrażarka' : unit.unit_type === 'salad_bar' ? '🥗 Stół sałatkowy' : '❄️ Lodówka'}
                      </span>
                    </div>
                    <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">
                      {unit.temp_min}° – {unit.temp_max}°C
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      placeholder="—"
                      value={val}
                      onChange={e => setMorningTemps(p => ({ ...p, [unit.id]: e.target.value }))}
                      className={`w-24 text-center text-2xl font-bold py-2.5 rounded-xl border-2 focus:outline-none focus:ring-2 ${
                        bad
                          ? 'border-red-400 text-red-700 bg-red-50 focus:ring-red-200'
                          : 'border-gray-200 focus:border-brand-500 focus:ring-brand-100'
                      }`}
                    />
                    <span className="text-gray-400">°C</span>
                    {bad && <span className="text-red-600 font-bold text-xs">⚠️ POZA NORMĄ</span>}
                  </div>
                  {bad && (
                    <textarea
                      placeholder="Działanie korygujące..."
                      value={morningActions[unit.id] || ''}
                      onChange={e => setMorningActions(p => ({ ...p, [unit.id]: e.target.value }))}
                      className="mt-2 w-full text-sm rounded-xl border-2 border-red-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                      rows={2}
                    />
                  )}
                </div>
              )
            })}

            <button
              onClick={() => handleSave('morning')}
              disabled={saving !== null || morningFilledCount === 0}
              className="btn-orange"
            >
              {saving === 'morning' ? 'Zapisuję...' : `☀️ Zapisz poranne (${morningFilledCount}/${units.length})`}
            </button>
          </>
        )}

        {/* Morning saved summary */}
        {morningSaved && !eveningSaved && (
          <div className="card border-2 border-green-200 bg-green-50">
            <h3 className="font-bold text-green-800 mb-2">☀️ Poranne — zapisane ✅</h3>
            <div className="space-y-1">
              {units.map(unit => {
                const val = morningTemps[unit.id]
                if (!val) return null
                const bad = isOutOfRange(unit, val)
                return (
                  <div key={`ms-${unit.id}`} className="flex justify-between text-sm">
                    <span className="text-gray-700">{unit.name}</span>
                    <span className={`font-bold ${bad ? 'text-red-600' : 'text-green-700'}`}>
                      {val}°C {bad ? '⚠️' : '✅'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* EVENING SECTION */}
        {morningSaved && !eveningSaved && (
          <>
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl px-4 py-3">
              <h2 className="font-bold text-indigo-800">🌙 Zmiana wieczorna (20:00)</h2>
              <p className="text-xs text-indigo-600">Wpisz temperatury z wieczora — raport zostanie wysłany</p>
            </div>

            {units.map(unit => {
              const val = eveningTemps[unit.id] || ''
              const bad = isOutOfRange(unit, val)
              return (
                <div key={`e-${unit.id}`} className={`card border-2 ${bad ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-sm text-gray-900">{unit.name}</h3>
                      <span className="text-xs text-gray-400">
                        {unit.unit_type === 'freezer' ? '🧊 Zamrażarka' : unit.unit_type === 'salad_bar' ? '🥗 Stół sałatkowy' : '❄️ Lodówka'}
                      </span>
                    </div>
                    <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">
                      {unit.temp_min}° – {unit.temp_max}°C
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      placeholder="—"
                      value={val}
                      onChange={e => setEveningTemps(p => ({ ...p, [unit.id]: e.target.value }))}
                      className={`w-24 text-center text-2xl font-bold py-2.5 rounded-xl border-2 focus:outline-none focus:ring-2 ${
                        bad
                          ? 'border-red-400 text-red-700 bg-red-50 focus:ring-red-200'
                          : 'border-gray-200 focus:border-brand-500 focus:ring-brand-100'
                      }`}
                    />
                    <span className="text-gray-400">°C</span>
                    {bad && <span className="text-red-600 font-bold text-xs">⚠️ POZA NORMĄ</span>}
                  </div>
                  {bad && (
                    <textarea
                      placeholder="Działanie korygujące..."
                      value={eveningActions[unit.id] || ''}
                      onChange={e => setEveningActions(p => ({ ...p, [unit.id]: e.target.value }))}
                      className="mt-2 w-full text-sm rounded-xl border-2 border-red-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                      rows={2}
                    />
                  )}
                </div>
              )
            })}

            <button
              onClick={() => handleSave('evening')}
              disabled={saving !== null || eveningFilledCount === 0}
              className="btn-orange"
            >
              {saving === 'evening' ? 'Zapisuję i wysyłam raport...' : `🌙 Zapisz wieczorne i wyślij raport (${eveningFilledCount}/${units.length})`}
            </button>
          </>
        )}

        {/* Both saved */}
        {morningSaved && eveningSaved && (
          <div className="card border-2 border-green-200 bg-green-50 text-center py-6">
            <div className="text-4xl mb-2">✅</div>
            <h3 className="font-bold text-green-800">Dzisiejsze pomiary zakończone!</h3>
            <p className="text-sm text-green-600 mt-1">Poranne i wieczorne zapisane, raport wysłany.</p>
          </div>
        )}

        {units.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-gray-500">Brak urządzeń. Uruchom: node setup-db.js</p>
          </div>
        )}
      </div>
    </div>
  )
}
