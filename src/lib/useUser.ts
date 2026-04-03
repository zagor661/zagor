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

const SESSION_KEY = 'kitchenops_user'
const SESSION_TIME_KEY = 'kitchenops_login_time'
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000 // 8 hours

export function useUser(redirectIfNoUser = true) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    const loginTime = localStorage.getItem(SESSION_TIME_KEY)

    if (stored) {
      // Check session timeout
      if (loginTime && Date.now() - parseInt(loginTime) > SESSION_TIMEOUT) {
        // Session expired
        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(SESSION_TIME_KEY)
        if (redirectIfNoUser) router.push('/login')
      } else {
        try {
          setUser(JSON.parse(stored))
        } catch {
          localStorage.removeItem(SESSION_KEY)
          localStorage.removeItem(SESSION_TIME_KEY)
          if (redirectIfNoUser) router.push('/login')
        }
      }
    } else if (redirectIfNoUser) {
      router.push('/login')
    }
    setLoading(false)
  }, [])

  const login = (userData: User) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
    localStorage.setItem(SESSION_TIME_KEY, Date.now().toString())
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_TIME_KEY)
    window.location.href = '/login'
  }

  return { user, loading, login, logout }
}
