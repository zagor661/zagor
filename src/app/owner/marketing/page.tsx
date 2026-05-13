'use client'

export default function MarketingPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Marketing</h1>
        <p className="text-gray-500 text-sm mt-1">Kampanie, social media, promocje</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Instagram */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg">
              📸
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Instagram</h3>
              <p className="text-gray-500 text-xs">@wokiwoki_imbiriryz</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Obserwujacy</span>
              <span className="text-white font-bold">—</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Posty ten miesiac</span>
              <span className="text-white font-bold">—</span>
            </div>
            <a
              href="https://instagram.com/wokiwoki_imbiriryz"
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-3 text-center py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-xs font-bold hover:opacity-90"
            >
              Otworz Instagram
            </a>
          </div>
        </div>

        {/* Promocje */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-lg">
              🎯
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Promocje</h3>
              <p className="text-gray-500 text-xs">Aktywne kampanie</p>
            </div>
          </div>
          <div className="text-center py-6">
            <div className="text-3xl mb-2">📣</div>
            <p className="text-gray-500 text-xs">Brak aktywnych promocji</p>
            <button className="mt-3 px-4 py-2 bg-gray-800 text-gray-400 rounded-xl text-xs font-medium hover:bg-gray-700 hover:text-white">
              + Stworz promocje
            </button>
          </div>
        </div>

        {/* Google Reviews */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg">
              ⭐
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Opinie Google</h3>
              <p className="text-gray-500 text-xs">Monitoruj recenzje klientow</p>
            </div>
          </div>
          <div className="text-center py-4">
            <p className="text-gray-600 text-xs">Wkrotce — integracja z Google Business</p>
          </div>
        </div>

        {/* Content ideas */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-lg">
              💡
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Pomysly na posty</h3>
              <p className="text-gray-500 text-xs">AI generuje content</p>
            </div>
          </div>
          <div className="text-center py-4">
            <a
              href="/owner/ai"
              className="px-4 py-2 bg-indigo-600/20 text-indigo-400 rounded-xl text-xs font-medium hover:bg-indigo-600/30"
            >
              Zapytaj AI o pomysly &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
