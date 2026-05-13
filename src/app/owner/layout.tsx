'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/useUser'

const NAV_ITEMS = [
  { href: '/owner', label: 'Dashboard', icon: '📊' },
  { href: '/owner/sales', label: 'Sprzedaz', icon: '💰' },
  { href: '/owner/foodcost', label: 'Food Cost', icon: '🥘' },
  { href: '/owner/staff', label: 'Zespol', icon: '👥' },
  { href: '/owner/sheets', label: 'Arkusze', icon: '📋' },
  { href: '/owner/marketing', label: 'Marketing', icon: '📣' },
  { href: '/owner/ai', label: 'AI Asystent', icon: '🤖' },
]

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, loading, logout } = useUser()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Ladowanie...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Zaloguj sie aby kontynuowac</p>
          <Link href="/login" className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold">
            Zaloguj
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col fixed h-full">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg">
              🍜
            </div>
            <div>
              <h1 className="text-white font-bold text-sm">KitchenOps</h1>
              <p className="text-gray-500 text-xs">{user.location_name}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || (item.href !== '/owner' && pathname?.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User / back to mobile */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all"
          >
            <span>📱</span> Wroc do aplikacji
          </Link>
          <div className="flex items-center justify-between px-4">
            <div>
              <p className="text-white text-xs font-medium">{user.full_name}</p>
              <p className="text-gray-600 text-[10px] capitalize">{user.role}</p>
            </div>
            <button onClick={logout} className="text-[10px] text-gray-600 hover:text-red-400">
              Wyloguj
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}
