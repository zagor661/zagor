'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { normalizeRole, canAccess } from '@/lib/roles'

interface RoleGuardProps {
  children: React.ReactNode
}

/**
 * RoleGuard — opakowuje stronę i sprawdza czy aktualna rola
 * użytkownika ma dostęp do tej ścieżki. Jeśli nie → redirect na /.
 *
 * Użycie: w layout.tsx lub bezpośrednio w page.tsx:
 *   <RoleGuard>{children}</RoleGuard>
 */
export default function RoleGuard({ children }: RoleGuardProps) {
  const { user, loading } = useUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading || !user) return
    const role = normalizeRole(user.role)
    if (!canAccess(role, pathname)) {
      router.push('/')
    }
  }, [user, loading, pathname])

  if (loading || !user) return null

  const role = normalizeRole(user.role)
  if (!canAccess(role, pathname)) return null

  return <>{children}</>
}
