'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { format, subDays } from 'date-fns'
import { pl } from 'date-fns/locale'

interface ReportData {
  date: string
  checklist: { done: number; total: number }
  tasks: { created: number; completed: number; open: number }
  attendance: { name: string; clock_in: string | null; clock_out: string | null; hours: number | null; breaks_min: number }[]
  issues: { title: string; status: string }[]
  losses: { item_name: string; quantity: number; unit: string }[]
  meals: number
  commands: number
  temperature: { morning: boolean; evening: boolean }
}

export default function DailyReportPage() {
  const { user, loading } = useUser()
  const isAdmin = user ? isAdminRole(user.role) : false

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [report, setReport] = useState<ReportData | null>(null)
  const [loadingReport, setLoadingReport] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoadingReport(true)
    fetch(`/api/daily-report?date=${date}&location_id=${user.location_id}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setReport(data)
        setLoadingReport(false)
      })
      .catch(() => setLoadingReport(false))
  }, [user, date])

  if (loading || !user) return null

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="font-bold text-lg">Brak dostępu</h2>
          <Link href="/" className="mt-4 inline-block text-brand-600 font-medium text-sm">← Powrót</Link>
        </div>
      </div>
    )
  }

  const dateObj = new Date(date + 'T12:00:00')
  const isToday = date === format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4 flex items-center justify-between shadow-lg">
        <Link href="/" className="text-white/70 font-medium text-sm">← Powrót</Link>
        <div className="text-center">
          <h1 className="text-lg font-bold">📊 Raport dzienny</h1>
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em]">Podsumowanie zmiany</p>
        </div>
        <div className="w-16" />
      </div>

      {/* Date picker */}
      <div className="flex items-center justify-center gap-3 p-4 bg-white border-b">
        <button
          onClick={() => setDate(format(subDays(dateObj, 1), 'yyyy-MM-dd'))}
          className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200"
        >
          ←
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-gray-900">
            {isToday ? 'Dzisiaj' : format(dateObj, 'EEEE', { locale: pl })}
          </div>
          <div className="text-xs text-gray-400">
            {format(dateObj, 'd MMMM yyyy', { locale: pl })}
          </div>
        </div>
        <button
          onClick={() => {
            if (!isToday) setDate(format(new Date(dateObj.getTime() + 86400000), 'yyyy-MM-dd'))
          }}
          disabled={isToday}
          className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
        >
          →
        </button>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {loadingReport && (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500" />
          </div>
        )}

        {report && !loadingReport && (
          <>
            {/* ─── Score banner ────────────────────────── */}
            {(() => {
              let score = 0
              let maxScore = 0

              // Checklist (max 30)
              maxScore += 30
              if (report.checklist.total > 0) {
                score += Math.round((report.checklist.done / report.checklist.total) * 30)
              }

              // Temperature (max 20)
              maxScore += 20
              if (report.temperature.morning) score += 10
              if (report.temperature.evening) score += 10

              // Tasks completion (max 20)
              maxScore += 20
              if (report.tasks.created > 0) {
                score += Math.min(20, Math.round((report.tasks.completed / report.tasks.created) * 20))
              } else {
                score += 20 // no tasks = full score
              }

              // No issues = bonus (max 15)
              maxScore += 15
              if (report.issues.length === 0) score += 15
              else if (report.issues.every(i => i.status === 'resolved')) score += 10

              // Attendance (max 15)
              maxScore += 15
              if (report.attendance.length > 0) score += 15

              const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
              const color = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'
              const bg = pct >= 80 ? 'bg-green-50 border-green-200' : pct >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

              return (
                <div className={`rounded-2xl border-2 p-5 text-center ${bg}`}>
                  <div className={`text-4xl font-black ${color}`}>{pct}%</div>
                  <div className="text-xs text-gray-500 mt-1 font-semibold">
                    {pct >= 80 ? 'Świetny dzień!' : pct >= 60 ? 'Można lepiej' : 'Wymaga uwagi'}
                  </div>
                </div>
              )
            })()}

            {/* ─── Checklist ──────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-900">✅ Checklist</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  report.checklist.total === 0 ? 'bg-gray-100 text-gray-400'
                    : report.checklist.done === report.checklist.total ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {report.checklist.done}/{report.checklist.total}
                </span>
              </div>
              {report.checklist.total > 0 && (
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      report.checklist.done === report.checklist.total ? 'bg-green-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${(report.checklist.done / report.checklist.total * 100)}%` }}
                  />
                </div>
              )}
              {report.checklist.total === 0 && (
                <p className="text-xs text-gray-400">Brak wpisów z checklisty</p>
              )}
            </div>

            {/* ─── Temperature ────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">🌡️ Temperatury</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3 text-center ${report.temperature.morning ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="text-lg">{report.temperature.morning ? '✅' : '❌'}</div>
                  <div className="text-xs font-semibold mt-1">{report.temperature.morning ? 'Poranna OK' : 'Brak porannej'}</div>
                </div>
                <div className={`rounded-xl p-3 text-center ${report.temperature.evening ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="text-lg">{report.temperature.evening ? '✅' : '❌'}</div>
                  <div className="text-xs font-semibold mt-1">{report.temperature.evening ? 'Wieczorna OK' : 'Brak wieczornej'}</div>
                </div>
              </div>
            </div>

            {/* ─── Tasks ─────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">📋 Zadania</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-blue-50 rounded-xl p-2">
                  <div className="text-lg font-bold text-blue-600">{report.tasks.created}</div>
                  <div className="text-[10px] text-gray-400">Utworzone</div>
                </div>
                <div className="bg-green-50 rounded-xl p-2">
                  <div className="text-lg font-bold text-green-600">{report.tasks.completed}</div>
                  <div className="text-[10px] text-gray-400">Wykonane</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-2">
                  <div className="text-lg font-bold text-amber-600">{report.tasks.open}</div>
                  <div className="text-[10px] text-gray-400">Otwarte</div>
                </div>
              </div>
            </div>

            {/* ─── Attendance ─────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">👥 Obecność ({report.attendance.length})</h3>
              {report.attendance.length === 0 && (
                <p className="text-xs text-gray-400">Brak danych obecności</p>
              )}
              <div className="space-y-1.5">
                {report.attendance.map((a, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">{a.name}</span>
                    <div className="text-right">
                      <span className="text-xs text-gray-500">
                        {a.clock_in || '—'} → {a.clock_out || '...'}
                      </span>
                      {a.hours != null && (
                        <span className="text-xs font-bold text-green-600 ml-2">{a.hours}h</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── Issues ─────────────────────────────── */}
            {report.issues.length > 0 && (
              <div className="bg-white rounded-2xl border border-red-200 p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-2">🔧 Awarie ({report.issues.length})</h3>
                <div className="space-y-1.5">
                  {report.issues.map((issue, i) => (
                    <div key={i} className="flex items-center justify-between bg-red-50 rounded-xl px-3 py-2">
                      <span className="text-xs text-gray-700 truncate flex-1">{issue.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        issue.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {issue.status === 'resolved' ? 'OK' : 'Otwarta'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Losses ─────────────────────────────── */}
            {report.losses.length > 0 && (
              <div className="bg-white rounded-2xl border border-rose-200 p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-2">📉 Straty ({report.losses.length})</h3>
                <div className="space-y-1">
                  {report.losses.map((loss, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-rose-50 rounded-xl px-3 py-2">
                      <span className="text-gray-700">{loss.item_name}</span>
                      <span className="text-gray-500">{loss.quantity} {loss.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Quick stats ────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                <div className="text-2xl">🍽️</div>
                <div className="text-lg font-bold text-gray-900 mt-1">{report.meals}</div>
                <div className="text-[10px] text-gray-400">Posiłki</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                <div className="text-2xl">📻</div>
                <div className="text-lg font-bold text-gray-900 mt-1">{report.commands}</div>
                <div className="text-[10px] text-gray-400">Polecenia WOKI</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
