'use client'
import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(async (reg) => {
        console.log('[SW] Registered:', reg.scope)

        // Auto-subscribe to push if VAPID key is available
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey || !('PushManager' in window)) return

        try {
          let subscription = await reg.pushManager.getSubscription()
          if (!subscription) {
            // Ask permission
            const permission = await Notification.requestPermission()
            if (permission !== 'granted') {
              console.log('[Push] Permission denied')
              return
            }

            // Subscribe
            subscription = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey),
            })
            console.log('[Push] Subscribed:', subscription.endpoint)
          }

          // Save to server — read user from localStorage
          const stored = localStorage.getItem('kitchenops_user')
          if (stored) {
            const user = JSON.parse(stored)
            await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                profileId: user.id,
                locationId: user.location_id,
                subscription: subscription.toJSON(),
              }),
            })
            console.log('[Push] Subscription saved to server')
          }
        } catch (err) {
          console.log('[Push] Subscription error:', err)
        }
      }).catch((err) => {
        console.log('[SW] Registration failed:', err)
      })
    }
  }, [])

  return null
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
