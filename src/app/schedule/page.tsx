'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { format, isSameDay, startOfWeek, addDays, isAfter, isBefore, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

interface Shift {
  start: string
  end: string
  hours: number
  section: string
  workers: string[]
}

export default function SchedulePage() {
  const { user, loading } = useUser()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    return startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  })

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/schedule')
        const data = await res.json()
        if (data.ok) {
          setShifts(data.shifts)
        } else {
          setError(data.error || 'Błąd pobierania grafiku')
        }
      } catch {
        setError('Nie udało się pobrać grafiku')
      }
      setLoadingData(false)
    }
    load()
  }, [])

  if (loading || !user) return null

  const firstName = user.full_name.split(' ')[0].toUpperCase()

  // Generate days for selected week
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(selectedWeekStart, i))

  // Filter shifts for this week
  const weekShifts = shifts.filter(s => {
    const shiftDate = parseISO(s.start)
    return !isBefore(shiftDate, selectedWeekStart) && !isAfter(shiftDate, addDays(selectedWeekStart, 6))
  })

  // Count user's shifts this week
  const myShiftsCount = weekShifts.filter(s =>
    s.workers.some(w => w.toUpperCase().includes(firstName))
  ).length

  // Total hours this week
  const myHoursThisWeek = weekShifts
    .filter(s => s.workers.some(w => w.toUpperCase().includes(firstName)))
    .reduce((sum, s) => sum + s.hours, 0)

  const prevWeek = () => setSelectedWeekStart(addDays(selectedWeekStart, -7))
  const nextWeek = () => setSelectedWeekStart(addDays(selectedWeekStart, 7))
  const goToday = () => setSelectedWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))

  const isCurrentWeek = isSameDay(selectedWeekStart, startOfWeek(new Date(), { weekStartsOn: 1 }))

  const sectionColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    'KUCHNIA': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
    'SALA': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-brand-600 font-medium text-sm">← Powrót</Link>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">📅 Grafik zmianowy</h1>
          <p className="text-gray-500 text-sm mt-1">Woki Woki — Imbir i Ryż</p>
        </div>

        {/* Week navigation */}
        <div className="card flex items-center justify-between">
          <button onClick={prevWeek} className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-transform">
            <span className="text-xl">◀</span>
          </button>
          <div className="text-center">
            <div className="font-bold text-sm">
              {format(selectedWeekStart, 'd MMM', { locale: pl })} – {format(addDays(selectedWeekStart, 6), 'd MMM yyyy', { locale: pl })}
            </div>
            {!isCurrentWeek && (
              <button onClick={goToday} className="text-brand-600 text-xs font-medium mt-1">
                → Bieżący tydzień
              </button>
            )}
          </div>
          <button onClick={nextWeek} className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-transform">
            <span className="text-xl">▶</span>
          </button>
        </div>

        {/* My week summary */}
        <div className="card bg-brand-50 border-2 border-brand-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Twój tydzień</div>
              <div className="text-lg font-bold mt-0.5">{myShiftsCount} {myShiftsCount === 1 ? 'zmiana' : myShiftsCount < 5 ? 'zmiany' : 'zmian'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase font-semibold">Godziny</div>
              <div className="text-lg font-bold mt-0.5">{myHoursThisWeek}h</div>
            </div>
          </div>
        </div>

        {/* Loading / Error */}
        {loadingData && (
          <div className="flex justify-center py-8">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
          </div>
        )}

        {error && (
          <div className="card bg-red-50 border-2 border-red-200 text-red-700 text-sm font-medium text-center">
            {error}
          </div>
        )}

        {/* Days */}
        {!loadingData && !error && weekDays.map(day => {
          const dayShifts = shifts.filter(s => {
            try { return isSameDay(parseISO(s.start), day) } catch { return false }
          })

          const isToday = isSameDay(day, new Date())
          const dayName = format(day, 'EEEE', { locale: pl })
          const dayDate = format(day, 'd MMMM', { locale: pl })
          const isMine = dayShifts.some(s => s.workers.some(w => w.toUpperCase().includes(firstName)))

          return (
            <div key={day.toISOString()} className={`card ${isToday ? 'border-2 border-brand-400 shadow-md' : ''} ${isMine && !isToday ? 'border-2 border-green-200' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-bold capitalize">{dayName}</span>
                  <span className="text-gray-400 text-sm ml-2">{dayDate}</span>
                </div>
                <div className="flex gap-1.5">
                  {isToday && <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full font-bold">DZIŚ</span>}
                  {isMine && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">TWOJA</span>}
                </div>
              </div>

              {dayShifts.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-2">Brak zmian</p>
              ) : (
                <div className="space-y-2">
                  {dayShifts.map((shift, idx) => {
                    const colors = sectionColors[shift.section.toUpperCase()] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700' }
                    const startTime = format(parseISO(shift.start), 'HH:mm')
                    const endTime = shift.end ? format(parseISO(shift.end), 'HH:mm') : '?'
                    const imOnThis = shift.workers.some(w => w.toUpperCase().includes(firstName))

                    return (
                      <div key={idx} className={`rounded-xl p-3 ${colors.bg} border ${colors.border} ${imOnThis ? 'ring-2 ring-green-300' : ''}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
                              {shift.section || 'ZMIANA'}
                            </span>
                            <span className="text-sm font-bold">{startTime} – {endTime}</span>
                          </div>
                          <span className="text-xs text-gray-500">{shift.hours}h</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {shift.workers.map((w, wi) => {
                            const isMe = w.toUpperCase().includes(firstName)
                            return (
                              <span
                                key={wi}
                                className={`text-xs px-2 py-1 rounded-full font-medium ${isMe ? 'bg-green-500 text-white' : 'bg-white/70 text-gray-700'}`}
                              >
                                {isMe ? `⭐ ${w}` : w}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Footer */}
        {!loadingData && !error && (
          <p className="text-center text-gray-300 text-xs pt-2">
            Grafik aktualizowany automatycznie z Google Sheets
          </p>
        )}

      </div>
    </div>
  )
}
