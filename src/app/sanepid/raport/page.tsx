'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import supabase from '@/lib/supabase'

interface SanepidReport {
  id: string
  report_id: string
  from_date: string
  to_date: string
  file_name: string
  public_url: string
  overall_status: 'ok' | 'warn' | 'fail'
  created_at: string
  generated_by: string
  metrics: any
}

export default function RaportSanepidPage() {
  const { user, loading } = useUser()
  const router = useRouter()

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<SanepidReport[]>([])

  // Domyślnie: bieżący miesiąc
  useEffect(() => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setFromDate(first.toISOString().slice(0, 10))
    setToDate(last.toISOString().slice(0, 10))
  }, [])

  // Wczytaj historię raportów
  useEffect(() => {
    if (!user) return
    async function loadHistory() {
      const { data } = await supabase
        .from('sanepid_reports')
        .select('*')
        .eq('location_id', user!.location_id)
        .order('created_at', { ascending: false })
        .limit(20)
      setHistory((data as SanepidReport[]) || [])
    }
    loadHistory()
  }, [user])

  function setCurrentMonth() {
    const now = new Date()
    setFromDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
    setToDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))
  }
  function setPrevMonth() {
    const now = new Date()
    setFromDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10))
    setToDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10))
  }

  async function generateReport() {
    if (!user || !fromDate || !toDate) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/sanepid/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate,
          toDate,
          userId: user.id,
          locationId: user.location_id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Błąd generowania')

      // Otwórz PDF w nowej karcie
      window.open(json.url, '_blank')

      // Odśwież historię
      const { data } = await supabase
        .from('sanepid_reports')
        .select('*')
        .eq('location_id', user.location_id)
        .order('created_at', { ascending: false })
        .limit(20)
      setHistory((data as SanepidReport[]) || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading || !user) return null

  const statusBadge = (s: string) => {
    if (s === 'ok') return <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">🟢 ZGODNY</span>
    if (s === 'warn') return <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">🟡 UWAGI</span>
    return <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">🔴 BRAKI</span>
  }

  const fmtPl = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-5">

        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/sanepid')} className="text-sm text-gray-500 hover:text-gray-900">
            ← Wróć
          </button>
          <p className="text-xs text-gray-400">{user.location_name}</p>
        </div>

        <div className="text-center py-2">
          <div className="text-5xl mb-2">📄</div>
          <h1 className="text-2xl font-bold text-gray-900">Raport Sanepid</h1>
          <p className="text-sm text-gray-500 mt-1">Generator raportu HACCP — PDF dla inspektora</p>
        </div>

        {/* FORMULARZ */}
        <div className="card border-2 border-teal-200 bg-white p-5 space-y-4">
          <h2 className="font-bold text-gray-900">Wybierz zakres</h2>

          <div className="flex gap-2">
            <button onClick={setCurrentMonth} className="flex-1 bg-blue-50 text-blue-700 font-semibold py-2 px-3 rounded-lg text-sm border border-blue-200 hover:bg-blue-100">
              Bieżący miesiąc
            </button>
            <button onClick={setPrevMonth} className="flex-1 bg-gray-50 text-gray-700 font-semibold py-2 px-3 rounded-lg text-sm border border-gray-200 hover:bg-gray-100">
              Poprzedni miesiąc
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Od</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-gray-300 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Do</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-gray-300 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              ⚠ {error}
            </div>
          )}

          <button
            onClick={generateReport}
            disabled={generating || !fromDate || !toDate}
            className="w-full bg-gradient-to-r from-teal-600 to-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? '⏳ Generowanie PDF…' : '📄 Generuj Raport PDF'}
          </button>
        </div>

        {/* HISTORIA */}
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
            Historia raportów
          </h2>
          {history.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-6">Brak wcześniejszych raportów</div>
          ) : (
            <div className="space-y-2">
              {history.map((r) => (
                <a
                  key={r.id}
                  href={r.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📄</span>
                        <span className="font-bold text-sm text-gray-900 truncate">
                          {fmtPl(r.from_date)} — {fmtPl(r.to_date)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {r.report_id} • {fmtPl(r.created_at)}
                      </div>
                    </div>
                    {statusBadge(r.overall_status)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
