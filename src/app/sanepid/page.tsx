'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'

export default function SanepidHub() {
  const { user, loading } = useUser()
  const router = useRouter()

  if (loading || !user) return null

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

      </div>
    </div>
  )
}
