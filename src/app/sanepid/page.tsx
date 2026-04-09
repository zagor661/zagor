'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useUser } from '@/lib/useUser'

export default function SanepidHub() {
  const { user, loading } = useUser()
  const router = useRouter()

  // Tryb kontroli — state
  const [inspMode, setInspMode] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [reportResult, setReportResult] = useState<{
    url: string
    reportId: string
    compliance: any
  } | null>(null)
  const [email, setEmail] = useState('')
  const [inspectorNote, setInspectorNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)

  if (loading || !user) return null

  // Oblicz zakres dat: bieżący miesiąc od 1. do dziś
  const getCurrentMonthRange = () => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const fromDate = first.toISOString().split('T')[0]
    const toDate = now.toISOString().split('T')[0]
    return { fromDate, toDate }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setReportResult(null)
    setSendResult(null)
    try {
      const { fromDate, toDate } = getCurrentMonthRange()
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
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nie udało się wygenerować raportu')
      }
      setReportResult({
        url: data.url,
        reportId: data.reportId,
        compliance: data.compliance,
      })
    } catch (err: any) {
      alert('Błąd: ' + (err.message || 'Nieznany'))
    } finally {
      setGenerating(false)
    }
  }

  const handleSendEmail = async () => {
    if (!email || !reportResult) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSendResult({ ok: false, msg: 'Nieprawidłowy adres email' })
      return
    }
    setSending(true)
    setSendResult(null)
    try {
      const { fromDate, toDate } = getCurrentMonthRange()
      const res = await fetch('/api/sanepid/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate,
          toDate,
          userId: user.id,
          locationId: user.location_id,
          email,
          inspectorNote: inspectorNote || undefined,
        }),
      })
      const data = await res.json()
      if (data.email?.sent) {
        setSendResult({ ok: true, msg: `Raport wysłany na ${email} ✅` })
      } else {
        setSendResult({
          ok: false,
          msg: data.email?.error || data.error || 'Nie udało się wysłać maila',
        })
      }
    } catch (err: any) {
      setSendResult({ ok: false, msg: err.message || 'Błąd wysyłki' })
    } finally {
      setSending(false)
    }
  }

  const complianceBadge = (status: string) => {
    if (status === 'ok') return { emoji: '🟢', label: 'ZGODNY', color: 'text-green-700 bg-green-50 border-green-200' }
    if (status === 'warn') return { emoji: '🟡', label: 'Z UWAGAMI', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
    return { emoji: '🔴', label: 'NIEZGODNY', color: 'text-red-700 bg-red-50 border-red-200' }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-900">
            ← Wróć
          </button>
          <div className="text-right">
            <p className="text-xs text-gray-400">{user.location_name}</p>
          </div>
        </div>

        {/* Title */}
        <div className="text-center py-2">
          <div className="text-5xl mb-2">🧾</div>
          <h1 className="text-2xl font-bold text-gray-900">Sanepid / HACCP</h1>
          <p className="text-sm text-gray-500 mt-1">Compliance i monitoring bezpieczeństwa żywności</p>
        </div>

        {/* Submenu */}
        <div className="space-y-3">

          <Link href="/temperature" className="block card border-2 border-blue-100 bg-blue-50 hover:shadow-md transition-shadow active:scale-98">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🌡️</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Temperatury lodówek</h2>
                <p className="text-sm text-gray-500">Pomiary 2x dziennie — 8 urządzeń</p>
              </div>
              <span className="text-gray-300 text-2xl">›</span>
            </div>
          </Link>

          <Link href="/cleaning" className="block card border-2 border-green-100 bg-green-50 hover:shadow-md transition-shadow active:scale-98">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🧹</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Sprzątanie tygodniowe</h2>
                <p className="text-sm text-gray-500">14 zadań czystości HACCP</p>
              </div>
              <span className="text-gray-300 text-2xl">›</span>
            </div>
          </Link>

          <Link href="/straty" className="block card border-2 border-red-100 bg-red-50 hover:shadow-md transition-shadow active:scale-98">
            <div className="flex items-center gap-4">
              <span className="text-4xl">📉</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Lista strat</h2>
                <p className="text-sm text-gray-500">Zgłoś stratę produktową z wyceną</p>
              </div>
              <span className="text-gray-300 text-2xl">›</span>
            </div>
          </Link>

          <Link href="/sanepid/raport" className="block card border-2 border-teal-200 bg-gradient-to-br from-teal-50 to-blue-50 hover:shadow-md transition-shadow active:scale-98">
            <div className="flex items-center gap-4">
              <span className="text-4xl">📄</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Raport Sanepid (PDF)</h2>
                <p className="text-sm text-gray-500">Generator raportu HACCP — miesięczny lub custom zakres</p>
              </div>
              <span className="text-gray-300 text-2xl">›</span>
            </div>
          </Link>

        </div>

        {/* Info footer */}
        <div className="text-center text-xs text-gray-400 pt-4">
          Wszystkie dane trafiają do raportu HACCP dla inspektora Sanepidu.
        </div>

        {/* ========================================================
            TRYB KONTROLI — szybki generator + wysyłka do inspektora
            ======================================================== */}
        <div className="pt-6">
          {!inspMode ? (
            <button
              onClick={() => setInspMode(true)}
              className="w-full rounded-2xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-orange-50 py-4 px-5 text-left hover:shadow-md active:scale-98 transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🚨</span>
                <div className="flex-1">
                  <div className="text-base font-bold text-red-800">Tryb kontroli</div>
                  <div className="text-xs text-red-600 mt-0.5">
                    Natychmiastowe wygenerowanie pełnego pakietu dokumentów dla inspektora
                  </div>
                </div>
                <span className="text-red-300 text-2xl">›</span>
              </div>
            </button>
          ) : (
            <div className="rounded-2xl border-2 border-red-300 bg-white p-5 space-y-4 shadow-lg">

              {/* Header sekcji */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                    🚨 Tryb kontroli
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Zakres: od 1. dnia bieżącego miesiąca do dziś
                  </p>
                </div>
                <button
                  onClick={() => {
                    setInspMode(false)
                    setReportResult(null)
                    setEmail('')
                    setInspectorNote('')
                    setSendResult(null)
                  }}
                  className="text-gray-400 hover:text-gray-700 text-xl leading-none"
                  aria-label="Zamknij"
                >
                  ✕
                </button>
              </div>

              {/* Info box */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 leading-relaxed">
                <b className="text-gray-800">Pełny pakiet dokumentów HACCP</b> zawiera:
                monitoring temperatur urządzeń chłodniczych, ewidencję sprzątania tygodniowego,
                rejestr strat produktowych oraz podsumowanie działań korygujących.
                Raport generuje się na świeżo — dane zawsze aktualne.
              </div>

              {/* Krok 1: Generowanie */}
              {!reportResult && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-bold py-3.5 transition"
                >
                  {generating ? '⏳ Generuję pełny raport…' : '📄 Generuj pełny pakiet'}
                </button>
              )}

              {/* Krok 2: Wynik + akcje */}
              {reportResult && (
                <div className="space-y-3">
                  {/* Status zgodności */}
                  {(() => {
                    const b = complianceBadge(reportResult.compliance?.overall || 'ok')
                    return (
                      <div className={`rounded-xl border-2 ${b.color} px-4 py-3 text-center font-bold`}>
                        {b.emoji} Status: {b.label}
                      </div>
                    )
                  })()}

                  <div className="text-xs text-gray-500 text-center font-mono">
                    {reportResult.reportId}
                  </div>

                  {/* Podgląd PDF */}
                  <a
                    href={reportResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 text-center transition"
                  >
                    👁️ Podgląd PDF
                  </a>

                  {/* Separator */}
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 uppercase tracking-wide">lub wyślij mailem</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {/* Email form */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-700">
                      Email inspektora
                    </label>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      placeholder="inspektor@sanepid.gov.pl"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-700">
                      Wiadomość (opcjonalnie)
                    </label>
                    <textarea
                      placeholder="Np. Szanowny Panie Inspektorze, w załączeniu raport HACCP za bieżący miesiąc."
                      value={inspectorNote}
                      onChange={e => setInspectorNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                  </div>

                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !email}
                    className="w-full rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 transition"
                  >
                    {sending ? '⏳ Wysyłam…' : '📧 Wyślij do inspektora'}
                  </button>

                  {sendResult && (
                    <div
                      className={`rounded-xl px-4 py-3 text-sm font-medium ${
                        sendResult.ok
                          ? 'bg-green-50 border border-green-200 text-green-800'
                          : 'bg-red-50 border border-red-200 text-red-800'
                      }`}
                    >
                      {sendResult.msg}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
