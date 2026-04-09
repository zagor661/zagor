'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

interface Breakdown {
  id: string
  location_id: string
  reporter_id: string
  reporter_name: string
  breakdown_type: string
  priority: 'Niski' | 'Średni' | 'Wysoki' | 'Krytyczny'
  description: string
  photo_data: string | null
  status: 'Zgłoszone' | 'W naprawie' | 'Naprawione' | 'Do wymiany'
  resolution_note: string | null
  resolved_at: string | null
  created_at: string
}

const BREAKDOWN_TYPES = [
  'Sprzęt kuchenny',
  'Chłodnictwo (lodówka / zamrażarka)',
  'Wentylacja / klimatyzacja',
  'Instalacja elektryczna',
  'Instalacja wodno-kanalizacyjna',
  'Nagłośnienie / oświetlenie',
  'Meble / wyposażenie',
  'POS / kasa',
  'Inne',
]

const PRIORITIES: { value: Breakdown['priority']; label: string; color: string }[] = [
  { value: 'Niski',     label: '🟢 Niski',     color: 'bg-green-50 border-green-300 text-green-700' },
  { value: 'Średni',    label: '🟠 Średni',    color: 'bg-orange-50 border-orange-300 text-orange-700' },
  { value: 'Wysoki',    label: '🔴 Wysoki',    color: 'bg-red-50 border-red-300 text-red-700' },
  { value: 'Krytyczny', label: '⚠️ Krytyczny', color: 'bg-red-100 border-red-500 text-red-900' },
]

const STATUSES: Breakdown['status'][] = ['Zgłoszone', 'W naprawie', 'Naprawione', 'Do wymiany']

function priorityBadge(p: Breakdown['priority']) {
  switch (p) {
    case 'Niski':     return 'bg-green-100 text-green-700'
    case 'Średni':    return 'bg-orange-100 text-orange-700'
    case 'Wysoki':    return 'bg-red-100 text-red-700'
    case 'Krytyczny': return 'bg-red-600 text-white'
  }
}

function statusBadge(s: Breakdown['status']) {
  switch (s) {
    case 'Zgłoszone':   return 'bg-blue-100 text-blue-700'
    case 'W naprawie':  return 'bg-yellow-100 text-yellow-700'
    case 'Naprawione':  return 'bg-green-100 text-green-700'
    case 'Do wymiany':  return 'bg-gray-200 text-gray-700'
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

// Compress image to max 1280px, JPEG 0.7 quality → base64
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const maxDim = 1280
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = reject
      img.src = e.target!.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function BreakdownsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useUser()

  const [view, setView] = useState<'list' | 'new'>('list')
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Breakdown | null>(null)

  // Form state
  const [type, setType] = useState('')
  const [priority, setPriority] = useState<Breakdown['priority'] | ''>('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  useEffect(() => {
    if (authLoading || !user) return
    load()
  }, [user, authLoading])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('breakdowns')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error(error)
    } else if (data) {
      setBreakdowns(data as Breakdown[])
    }
    setLoading(false)
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoBusy(true)
    try {
      const compressed = await compressImage(file)
      setPhoto(compressed)
    } catch (err) {
      alert('Nie udało się wczytać zdjęcia')
    } finally {
      setPhotoBusy(false)
    }
  }

  function removePhoto() {
    setPhoto(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function resetForm() {
    setType('')
    setPriority('')
    setDescription('')
    removePhoto()
  }

  async function handleSubmit() {
    if (!user) return
    if (!type || !priority || !description.trim()) {
      alert('Wypełnij wszystkie wymagane pola')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('breakdowns').insert({
        location_id: user.location_id,
        reporter_id: user.id,
        reporter_name: user.full_name,
        breakdown_type: type,
        priority,
        description: description.trim(),
        photo_data: photo,
        status: 'Zgłoszone',
      })
      if (error) throw error

      // Try sending report email — non-blocking, matches temperature pattern
      try {
        await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'breakdown',
            data: {
              reporter: user.full_name,
              location: user.location_name,
              breakdown_type: type,
              priority,
              description: description.trim(),
              photo_data: photo,
              created_at: new Date().toISOString(),
            },
          }),
        })
      } catch (e) { console.log('Report skip:', e) }

      resetForm()
      await load()
      setView('list')
    } catch (err: any) {
      alert('Błąd: ' + (err.message || 'Nieznany'))
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: string, newStatus: Breakdown['status'], note?: string) {
    const patch: any = { status: newStatus }
    if (note !== undefined) patch.resolution_note = note
    const { error } = await supabase.from('breakdowns').update(patch).eq('id', id)
    if (error) {
      alert('Błąd: ' + error.message)
      return
    }
    await load()
    if (selected && selected.id === id) {
      setSelected({ ...selected, status: newStatus, resolution_note: note ?? selected.resolution_note })
    }
  }

  async function deleteBreakdown(id: string) {
    if (!confirm('Usunąć to zgłoszenie?')) return
    const { error } = await supabase.from('breakdowns').delete().eq('id', id)
    if (error) {
      alert('Błąd: ' + error.message)
      return
    }
    setSelected(null)
    await load()
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  const openCount = breakdowns.filter(b => b.status === 'Zgłoszone' || b.status === 'W naprawie').length

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/')} className="text-brand-600 text-sm font-medium">← Powrót</button>
            <h1 className="text-xl font-bold mt-1">🔧 Zgłoszenia awarii</h1>
            <p className="text-xs text-gray-400">{user?.location_name}</p>
          </div>
          {view === 'list' && (
            <button
              onClick={() => setView('new')}
              className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-sm"
            >
              + Nowe
            </button>
          )}
          {view === 'new' && (
            <button
              onClick={() => { resetForm(); setView('list') }}
              className="text-gray-500 text-sm px-3 py-2"
            >
              Anuluj
            </button>
          )}
        </div>

        {/* LIST VIEW */}
        {view === 'list' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="py-2 px-3 rounded-xl text-center text-sm font-bold bg-yellow-50 text-yellow-700 border-2 border-yellow-200">
                🛠️ Otwarte: {openCount}
              </div>
              <div className="py-2 px-3 rounded-xl text-center text-sm font-bold bg-gray-100 text-gray-600">
                📚 Wszystkie: {breakdowns.length}
              </div>
            </div>

            {breakdowns.length === 0 && (
              <div className="card text-center py-10">
                <div className="text-5xl mb-2">✅</div>
                <p className="font-bold text-gray-700">Brak zgłoszeń</p>
                <p className="text-sm text-gray-500 mt-1">Wszystko działa jak należy!</p>
              </div>
            )}

            {breakdowns.map(b => (
              <button
                key={b.id}
                onClick={() => setSelected(b)}
                className="block w-full text-left card border-2 border-gray-100 hover:border-brand-300 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-sm text-gray-900">{b.breakdown_type}</h3>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatDate(b.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2 mb-2">{b.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${priorityBadge(b.priority)}`}>{b.priority}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(b.status)}`}>{b.status}</span>
                  <span className="text-xs text-gray-500">👤 {b.reporter_name}</span>
                  {b.photo_data && <span className="text-xs text-blue-600">📷</span>}
                </div>
              </button>
            ))}
          </>
        )}

        {/* NEW VIEW */}
        {view === 'new' && (
          <div className="card border-2 border-gray-100 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Rodzaj usterki *</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none text-sm"
              >
                <option value="">— wybierz —</option>
                {BREAKDOWN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Zgłasza</label>
              <div className="px-3 py-3 rounded-xl bg-gray-50 border-2 border-gray-200 text-sm text-gray-700">
                👤 {user?.full_name}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Priorytet *</label>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`py-2.5 rounded-xl border-2 text-sm font-bold transition ${
                      priority === p.value ? p.color + ' ring-2 ring-offset-1 ring-brand-300' : 'border-gray-200 bg-white text-gray-500'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Opis usterki *</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Co nie działa, gdzie, od kiedy..."
                rows={4}
                className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Zdjęcie usterki</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto}
                className="hidden"
                id="photo-input"
              />
              {!photo ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoBusy}
                  className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm hover:border-brand-400 hover:text-brand-600 transition"
                >
                  {photoBusy ? 'Wczytuję...' : '📷 Kliknij aby zrobić zdjęcie'}
                </button>
              ) : (
                <div className="relative">
                  <img src={photo} alt="podgląd" className="w-full rounded-xl border-2 border-gray-200 max-h-64 object-cover" />
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="absolute top-2 right-2 bg-black/60 text-white w-8 h-8 rounded-full font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving || !type || !priority || !description.trim()}
              className="btn-orange"
            >
              {saving ? 'Wysyłam...' : '📤 Wyślij zgłoszenie'}
            </button>
          </div>
        )}

        {/* DETAIL MODAL */}
        {selected && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
            onClick={() => setSelected(null)}
          >
            <div
              className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold">{selected.breakdown_type}</h2>
                  <p className="text-xs text-gray-400">{formatDate(selected.created_at)}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl leading-none">×</button>
              </div>

              {selected.photo_data && (
                <img src={selected.photo_data} alt="usterka" className="w-full rounded-xl border-2 border-gray-100 max-h-72 object-contain" />
              )}

              <div className="space-y-2 text-sm">
                <div className="flex gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${priorityBadge(selected.priority)}`}>{selected.priority}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(selected.status)}`}>{selected.status}</span>
                </div>

                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">Opis</div>
                  <p className="text-gray-800 whitespace-pre-wrap">{selected.description}</p>
                </div>

                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Zgłosił(a)</span>
                  <span className="font-medium">{selected.reporter_name}</span>
                </div>
                {selected.resolved_at && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Rozwiązane</span>
                    <span className="font-medium">{formatDate(selected.resolved_at)}</span>
                  </div>
                )}
                {selected.resolution_note && (
                  <div className="bg-green-50 rounded-xl p-3">
                    <div className="text-xs text-green-700 mb-1">Notatka z naprawy</div>
                    <p className="text-green-900">{selected.resolution_note}</p>
                  </div>
                )}
              </div>

              {/* Status actions */}
              <div>
                <div className="text-xs font-bold text-gray-600 mb-1">Zmień status</div>
                <div className="grid grid-cols-2 gap-2">
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        if (s === 'Naprawione' || s === 'Do wymiany') {
                          const note = prompt('Notatka z naprawy (opcjonalna):') || undefined
                          updateStatus(selected.id, s, note)
                        } else {
                          updateStatus(selected.id, s)
                        }
                      }}
                      disabled={selected.status === s}
                      className={`py-2 rounded-xl text-xs font-bold border-2 transition ${
                        selected.status === s
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-brand-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={() => deleteBreakdown(selected.id)}
                  className="w-full py-2 rounded-xl border-2 border-red-200 text-red-600 text-sm font-bold hover:bg-red-50"
                >
                  🗑️ Usuń zgłoszenie
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
