'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

export default function Dashboard() {
  const { user, loading, logout } = useUser()
  const [showReminder, setShowReminder] = useState<string | null>(null)

  useEffect(() => {
    // Check reminders
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const day = now.getDay() // 0 = Sunday

    // Temperature reminders: 11:30-13:00 and 19:30-21:00
    if ((hour === 11 && minute >= 30) || hour === 12 || (hour === 13 && minute === 0)) {
      setShowReminder('🌡️ Pora na pomiary temperatur — zmiana PORANNA!')
    } else if ((hour === 19 && minute >= 30) || hour === 20 || (hour === 21 && minute === 0)) {
      setShowReminder('🌡️ Pora na pomiary temperatur — zmiana WIECZORNA!')
    }

    // Sunday cleaning reminder
    if (day === 0) {
      setShowReminder(prev => prev
        ? prev + '\n🧹 Niedziela — czas na tygodniowe sprzątanie!'
        : '🧹 Niedziela — czas na tygodniowe sprzątanie!'
      )
    }

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Set up notification interval (check every 30 min)
    const interval = setInterval(() => {
      const h = new Date().getHours()
      if (h === 12 || h === 20) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('KitchenOps 🌡️', { body: 'Pora na pomiary temperatur!' })
        }
      }
      if (new Date().getDay() === 0 && h === 10) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('KitchenOps 🧹', { body: 'Niedziela — tygodniowe sprzątanie!' })
        }
      }
    }, 30 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  if (loading || !user) return null

  const today = format(new Date(), 'EEEE, d MMMM', { locale: pl })
  const isAdmin = user.role === 'admin' || user.role === 'manager'

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cześć, {user.full_name.split(' ')[0]}! 👋</h1>
            <p className="text-gray-500 text-sm mt-0.5">{today}</p>
            <p className="text-gray-400 text-xs">{user.location_name}</p>
          </div>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 px-3 py-2">
            Wyloguj
          </button>
        </div>

        {/* Reminder banner */}
        {showReminder && (
          <div className="rounded-2xl bg-red-50 border-2 border-red-200 p-4">
            {showReminder.split('\n').map((line, i) => (
              <p key={i} className="text-red-700 font-bold text-sm">{line}</p>
            ))}
          </div>
        )}

        {/* Main actions */}
        <div className="space-y-3">
          <Link href="/temperature" className="block card border-2 border-blue-100 bg-blue-50 hover:shadow-md transition-shadow active:scale-98">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🌡️</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Temperatury lodówek</h2>
                <p className="text-sm text-gray-500">Pomiary 2x dziennie — 8 urządzeń</p>
              </div>
            </div>
          </Link>

          <Link href="/cleaning" className="block card border-2 border-green-100 bg-green-50 hover:shadow-md transition-shadow active:scale-98">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🧹</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sprzątanie tygodniowe</h2>
                <p className="text-sm text-gray-500">14 zadań czystości HACCP</p>
              </div>
            </div>
          </Link>

          <Link href="/tasks" className="block card border-2 border-amber-100 bg-amber-50 hover:shadow-md transition-shadow active:scale-98">
            <div className="flex items-center gap-4">
              <span className="text-4xl">📋</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Zadania</h2>
                <p className="text-sm text-gray-500">
                  {isAdmin ? 'Przypisuj i zarządzaj zadaniami' : 'Twoje zadania do wykonania'}
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* Quick info */}
        <div className="card bg-brand-50 border-2 border-brand-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📍</span>
            <div>
              <div className="font-bold text-sm">{user.location_name}</div>
              <div className="text-xs text-gray-500">{user.role === 'admin' ? '👑 Admin' : user.role === 'manager' ? '⭐ Manager' : '👨‍🍳 Pracownik'}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
