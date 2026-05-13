'use client'
import { useState, useEffect } from 'react'

export default function PushDebugPage() {
  const [info, setInfo] = useState<Record<string, string>>({})
  const [subscribing, setSubscribing] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    const data: Record<string, string> = {}

    data['userAgent'] = navigator.userAgent.slice(0, 80)
    data['standalone'] = String((navigator as any).standalone ?? window.matchMedia('(display-mode: standalone)').matches)
    data['serviceWorker'] = String('serviceWorker' in navigator)
    data['PushManager'] = String('PushManager' in window)
    data['Notification'] = String('Notification' in window)
    data['Notification.permission'] = ('Notification' in window) ? Notification.permission : 'N/A'

    const stored = localStorage.getItem('kitchenops_user')
    data['kitchenops_user'] = stored ? 'YES (' + (JSON.parse(stored).full_name || JSON.parse(stored).id) + ')' : 'NO'

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BB_PzIt5V3lNL_HmrHnBAaLKjfN9N4wWx8EP9a7eLy_KYJqPMIlpMUq8aSSBqVmecpL86HkJHbrw-7Y8BBZ8SWs'
    data['VAPID_KEY'] = vapidKey ? 'YES (' + vapidKey.slice(0, 10) + '...)' : 'NO'

    // Check SW registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        data['SW_registered'] = reg ? 'YES (scope: ' + reg.scope + ')' : 'NO'
        if (reg) {
          reg.pushManager.getSubscription().then(sub => {
            data['push_subscription'] = sub ? 'YES' : 'NO'
            if (sub) {
              data['endpoint'] = sub.endpoint.slice(0, 60) + '...'
            }
            setInfo({ ...data })
          })
        } else {
          setInfo({ ...data })
        }
      })
    } else {
      setInfo({ ...data })
    }
  }, [])

  async function handleSubscribe() {
    setSubscribing(true)
    setResult('')
    try {
      // 1. Request permission
      const permission = await Notification.requestPermission()
      setResult(`Permission: ${permission}`)
      if (permission !== 'granted') {
        setSubscribing(false)
        return
      }

      // 2. Register SW if needed
      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        setResult(prev => prev + '\nSW registered')
      }

      // 3. Subscribe
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BB_PzIt5V3lNL_HmrHnBAaLKjfN9N4wWx8EP9a7eLy_KYJqPMIlpMUq8aSSBqVmecpL86HkJHbrw-7Y8BBZ8SWs'
      const padding = '='.repeat((4 - (vapidKey.length % 4)) % 4)
      const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/')
      const rawData = atob(base64)
      const outputArray = new Uint8Array(rawData.length)
      for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i)
      }

      let sub = await reg!.pushManager.getSubscription()
      if (!sub) {
        sub = await reg!.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray,
        })
        setResult(prev => prev + '\nSubscribed!')
      } else {
        setResult(prev => prev + '\nAlready subscribed')
      }

      // 4. Save to server
      const stored = localStorage.getItem('kitchenops_user')
      if (stored) {
        const user = JSON.parse(stored)
        const resp = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: user.id,
            locationId: user.location_id,
            subscription: sub.toJSON(),
          }),
        })
        const data = await resp.json()
        setResult(prev => prev + '\nSaved: ' + JSON.stringify(data))
      } else {
        setResult(prev => prev + '\nNo user in localStorage!')
      }

      // 5. Test push
      const testResp = await fetch('/api/push/test')
      const testData = await testResp.json()
      setResult(prev => prev + '\nTest push: ' + JSON.stringify(testData))

    } catch (err: any) {
      setResult(prev => prev + '\nERROR: ' + err.message)
    }
    setSubscribing(false)
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">Push Debug</h1>

      <div className="bg-white rounded-xl p-4 shadow mb-4">
        <h2 className="font-bold mb-2">Status</h2>
        {Object.entries(info).map(([key, val]) => (
          <div key={key} className="flex justify-between py-1 border-b border-gray-100 text-sm">
            <span className="text-gray-500">{key}</span>
            <span className={val.startsWith('NO') || val === 'denied' ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
              {val}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubscribe}
        disabled={subscribing}
        className="w-full py-3 bg-brand-600 text-white font-bold rounded-xl disabled:opacity-50"
      >
        {subscribing ? 'Pracuję...' : '🔔 Włącz Push i Testuj'}
      </button>

      {result && (
        <pre className="mt-4 p-3 bg-gray-900 text-green-400 rounded-xl text-xs whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  )
}
