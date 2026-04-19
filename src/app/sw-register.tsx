'use client'
import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[SW] Registered:', reg.scope)
      }).catch((err) => {
        console.log('[SW] Registration failed:', err)
      })
    }
  }, [])

  return null
}
