'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface User {
  id: string
  email: string
  full_name: string
  role: string
  location_id: string
  location_name: string
}

export function useUser(redirectIfNoUser = true) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('kitchenops_user')
    if (stored) {
      setUser(JSON.parse(stored))
    } else if (redirectIfNoUser) {
      router.push('/login')
    }
    setLoading(false)
  }, [])

  const login = (userData: User) => {
    localStorage.setItem('kitchenops_user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('kitchenops_user')
    window.location.href = '/login'
  }

  return { user, loading, login, logout }
}
