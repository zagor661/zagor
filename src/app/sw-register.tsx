'use client'
import { useEffect, useState } from 'react'

// Register SW on load, but DON'T auto-request push (Safari blocks it)
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

// Button component — must be triggered by user click (Safari requirement)
export function PushNotificationBanner() {
  const [show, setShow] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    // Only show if: has SW, has PushManager, not yet subscribed, has user
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!('Notification' in window)) return

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) { console.log('[Push] No VAPID key'); return }

    const stored = localStorage.getItem('kitchenops_user')
    if (!stored) return

    // Check if already granted & subscribed
    if (Notification.permission === 'granted') {
      // Already granted — silently ensure subscription exists
      navigator.serviceWorker.ready.then(async (reg) => {
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          })
        }
        const user = JSON.parse(stored)
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: user.id,
            locationId: user.location_id,
            subscription: sub.toJSON(),
          }),
        })
        console.log('[Push] Subscription active')
      }).catch(() => {})
      return
    }

    if (Notification.permission === 'denied') return

    // permission === 'default' — show the banner
    // Small delay so page loads first
    const timer = setTimeout(() => setShow(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  async function handleEnable() {
    setSubscribing(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.log('[Push] User declined')
        setShow(false)
        setSubscribing(false)
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }

      const stored = localStorage.getItem('kitchenops_user')
      if (stored) {
        const user = JSON.parse(stored)
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: user.id,
            locationId: user.location_id,
            subscription: sub.toJSON(),
          }),
        })
        console.log('[Push] Subscribed & saved!')
      }
    } catch (err) {
      console.log('[Push] Error:', err)
    }
    setShow(false)
    setSubscribing(false)
  }

  if (!show) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-3 bg-brand-600 text-white text-center shadow-lg">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Wlacz powiadomienia push</span>
        <div className="flex gap-2">
          <button
            onClick={() => setShow(false)}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/20 hover:bg-white/30"
          >
            Nie teraz
          </button>
          <button
            onClick={handleEnable}
            disabled={subscribing}
            className="px-3 py-1.5 text-xs rounded-lg bg-white text-brand-700 font-bold hover:bg-white/90 disabled:opacity-50"
          >
            {subscribing ? '...' : 'Wlacz'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper: convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
