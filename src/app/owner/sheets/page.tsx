'use client'
import { useUser } from '@/lib/useUser'

const SHEETS = [
  { name: 'Grafik zmianowy', desc: 'Grafik pracy wszystkich pracownikow', icon: '📅', url: '' },
  { name: 'Food Cost', desc: 'Kalkulacja kosztow surowcow', icon: '🥘', url: '' },
  { name: 'Raporty dzienne', desc: 'Checklista, temperatury, zadania', icon: '📋', url: '' },
  { name: 'Lista plac', desc: 'Godziny pracy i wynagrodzenia', icon: '💰', url: '' },
  { name: 'Zamowienia MAKRO', desc: 'Listy zakupow od dostawcow', icon: '🛒', url: '' },
  { name: 'Inwentaryzacja', desc: 'Historia remanentow', icon: '📦', url: '' },
]

export default function SheetsPage() {
  const { user } = useUser()

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Arkusze Google</h1>
        <p className="text-gray-500 text-sm mt-1">Wszystkie dokumenty {user?.location_name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SHEETS.map((sheet, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{sheet.icon}</span>
              <h3 className="text-white font-bold text-sm group-hover:text-indigo-400 transition-colors">
                {sheet.name}
              </h3>
            </div>
            <p className="text-gray-500 text-xs">{sheet.desc}</p>
            <div className="mt-4 pt-3 border-t border-gray-800">
              {sheet.url ? (
                <a
                  href={sheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 text-xs font-medium hover:text-indigo-300"
                >
                  Otworz w Google Sheets &rarr;
                </a>
              ) : (
                <span className="text-gray-600 text-xs">Skonfiguruj link w ustawieniach</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-white font-bold text-sm mb-2">Dodaj link do arkusza</h3>
        <p className="text-gray-500 text-xs mb-4">
          Wklej URL do arkusza Google Sheets zeby miec szybki dostep
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
          <button className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-500">
            Dodaj
          </button>
        </div>
      </div>
    </div>
  )
}
