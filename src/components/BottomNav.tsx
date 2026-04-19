'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { ROLES, normalizeRole } from '@/lib/roles'
import type { RoleType } from '@/lib/roles'

export default function BottomNav() {
  const { user } = useUser()
  const pathname = usePathname()

  if (!user) return null
  // Nie pokazuj na loginie
  if (pathname === '/login') return null

  const role: RoleType = normalizeRole(user.role)
  const nav = ROLES[role].bottomNav

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="max-w-lg mx-auto flex justify-around items-center px-1 py-1.5">
        {nav.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[56px] transition-colors ${
                isActive
                  ? 'text-gray-900'
                  : 'text-gray-400'
              }`}
            >
              <span className={`text-xl ${isActive ? '' : 'grayscale opacity-60'}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] leading-tight ${
                isActive ? 'font-bold text-gray-900' : 'font-medium text-gray-400'
              }`}>
                {item.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-gray-900 -mt-0.5" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
