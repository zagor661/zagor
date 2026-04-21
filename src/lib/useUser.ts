'use client'
import { useEffect, useState, useCallback } from 'react'
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
const SESSION_ACTIVITY_KEY = 'kitchenops_last_activity'
const SESSION_TIMEOUT = 14 * 60 * 60 * 1000 // 14 hours — covers full shift (11:00–21:00) + buffer
const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000 // 2 hours of zero activity = logout

export function useUser(redirectIfNoUser = true) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Refresh activity timestamp — called on user interactions
  const refreshActivity = useCallback(() => {
    localStorage.setItem(SESSION_ACTIVITY_KEY, Date.now().toString())
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    const loginTime = localStorage.getItem(SESSION_TIME_KEY)
    const lastActivity = localStorage.getItem(SESSION_ACTIVITY_KEY)

    if (stored) {
      const now = Date.now()
      const loginAge = loginTime ? now - parseInt(loginTime) : 0
      const idleTime = lastActivity ? now - parseInt(lastActivity) : 0

      // Expire if: absolute session > 14h OR idle > 2h (with no activity at all)
      const sessionExpired = loginTime && loginAge > SESSION_TIMEOUT
      const idleExpired = lastActivity && idleTime > INACTIVITY_TIMEOUT

      if (sessionExpired || idleExpired) {
        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(SESSION_TIME_KEY)
        localStorage.removeItem(SESSION_ACTIVITY_KEY)
        if (redirectIfNoUser) router.push('/login')
        setLoading(false)
        return
      }

      try {
        const parsed = JSON.parse(stored)
        setUser(parsed)
        // Refresh activity on each page load / PWA resume
        refreshActivity()
      } catch {
        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(SESSION_TIME_KEY)
        localStorage.removeItem(SESSION_ACTIVITY_KEY)
        if (redirectIfNoUser) router.push('/login')
      }
    } else if (redirectIfNoUser) {
      router.push('/login')
    }
    setLoading(false)
  }, [])

  // Listen for user interactions to keep session alive
  useEffect(() => {
    if (!user) return

    const onActivity = () => refreshActivity()

    // Touch, click, scroll = activity (throttle via passive listeners)
    window.addEventListener('touchstart', onActivity, { passive: true })
    window.addEventListener('click', onActivity, { passive: true })

    // Also refresh when app comes back from background (PWA resume)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshActivity()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('click', onActivity)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user, refreshActivity])

  const login = (userData: User) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
    localStorage.setItem(SESSION_TIME_KEY, Date.now().toString())
    localStorage.setItem(SESSION_ACTIVITY_KEY, Date.now().toString())
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_TIME_KEY)
    localStorage.removeItem(SESSION_ACTIVITY_KEY)
    window.location.href = '/login'
  }

  return { user, loading, login, logout }
}
