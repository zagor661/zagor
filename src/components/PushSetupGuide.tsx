'use client'
import { useState, useEffect } from 'react'

type Step = 'loading' | 'add-to-home' | 'open-from-icon' | 'enable-push' | 'done'

export default function PushSetupGuide() {
  const [step, setStep] = useState<Step>('loading')
  const [dismissed, setDismissed] = useState(true) // hide until we know
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    // Don't show if user already dismissed
    if (localStorage.getItem('pushSetupDismissed')) {
      setDismissed(true)
      return
    }

    // Must be logged in
    const stored = localStorage.getItem('kitchenops_user')
    if (!stored) return

    // Detect current state
    const isStandalone =
      (navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches

    const hasSW = 'serviceWorker' in navigator
    const hasPush = 'PushManager' in window
    const hasNotification = 'Notification' in window

    if (!isStandalone) {
      // Step 1: not added to home screen yet
      setStep('add-to-home')
      setDismissed(false)
      return
    }

    if (!hasSW || !hasPush || !hasNotification) {
      // Browser doesn't support push — nothing to do
      setDismissed(true)
      return
    }

    if (Notification.permission === 'granted') {
      // Check if actually subscribed
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          // All done — don't show
          localStorage.setItem('pushSetupDismissed', '1')
          setDismissed(true)
        } else {
          setStep('enable-push')
          setDismissed(false)
        }
      })
      return
    }

    if (Notification.permission === 'denied') {
      // User blocked — can't do anything
      setDismissed(true)
      return
    }

    // permission === 'default' — need to ask
    setStep('enable-push')
    setDismissed(false)
  }, [])

  function handleDismiss() {
    localStorage.setItem('pushSetupDismissed', '1')
    setDismissed(true)
  }

  function handleRemindLater() {
    // Just hide for this session, don't set permanent flag
    setDismissed(true)
  }

  async function handleEnablePush() {
    setSubscribing(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setSubscribing(false)
        return
      }

      const vapidKey =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        'BB_PzIt5V3lNL_HmrHnBAaLKjfN9N4wWx8EP9a7eLy_KYJqPMIlpMUq8aSSBqVmecpL86HkJHbrw-7Y8BBZ8SWs'

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const padding = '='.repeat((4 - (vapidKey.length % 4)) % 4)
        const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/')
        const rawData = atob(base64)
        const key = new Uint8Array(rawData.length)
        for (let i = 0; i < rawData.length; i++) key[i] = rawData.charCodeAt(i)

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
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
      }

      setStep('done')
      setTimeout(() => {
        localStorage.setItem('pushSetupDismissed', '1')
        setDismissed(true)
      }, 3000)
    } catch (err) {
      console.error('[PushSetup]', err)
      setSubscribing(false)
    }
  }

  if (dismissed || step === 'loading') return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden animate-slide-up">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 px-6 pt-8 pb-6 text-white text-center relative">
          <div className="text-4xl mb-3">
            {step === 'done' ? '🎉' : '🔔'}
          </div>
          <h2 className="text-xl font-bold">
            {step === 'done'
              ? 'Gotowe!'
              : 'Wlacz powiadomienia'}
          </h2>
          <p className="text-sm text-white/80 mt-1">
            {step === 'done'
              ? 'Bedziesz otrzymywac powiadomienia o zadaniach'
              : 'Nie przegap zadan i przypomnien'}
          </p>

          {/* Step indicators */}
          {step !== 'done' && (
            <div className="flex justify-center gap-2 mt-4">
              <div className={`h-1.5 w-8 rounded-full ${step === 'add-to-home' ? 'bg-white' : 'bg-white/40'}`} />
              <div className={`h-1.5 w-8 rounded-full ${step === 'open-from-icon' ? 'bg-white' : 'bg-white/40'}`} />
              <div className={`h-1.5 w-8 rounded-full ${step === 'enable-push' ? 'bg-white' : 'bg-white/40'}`} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-6">

          {step === 'add-to-home' && (
            <div className="space-y-5">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">1</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">Kliknij ikone udostepniania</p>
                  <p className="text-xs text-gray-500 mt-0.5">Na dole ekranu w Safari — kwadrat ze strzalka w gore</p>
                  <div className="mt-2 bg-gray-50 rounded-xl p-3 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">2</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">Wybierz &quot;Dodaj do ekranu glownego&quot;</p>
                  <p className="text-xs text-gray-500 mt-0.5">Przewin w dol i kliknij opcje z ikonka +</p>
                  <div className="mt-2 bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-xl font-light">+</div>
                    <span className="text-sm text-gray-700 font-medium">Dodaj do ekranu glownego</span>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">3</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">Kliknij &quot;Dodaj&quot;</p>
                  <p className="text-xs text-gray-500 mt-0.5">Aplikacja pojawi sie na ekranie glownym</p>
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-3 flex gap-2">
                <span className="text-amber-500 text-lg">💡</span>
                <p className="text-xs text-amber-800">Po dodaniu, otworz KitchenOps z ikony na pulpicie — nie z Safari!</p>
              </div>
            </div>
          )}

          {step === 'open-from-icon' && (
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-lg">✓</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">Aplikacja dodana!</p>
                  <p className="text-xs text-gray-500 mt-0.5">Teraz zamknij Safari i otworz KitchenOps z ikony na pulpicie</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                  <span className="text-3xl">🍳</span>
                </div>
                <span className="text-sm font-bold text-gray-700">KitchenOps</span>
                <p className="text-xs text-gray-400 text-center">Kliknij ikone na ekranie glownym</p>
              </div>
            </div>
          )}

          {step === 'enable-push' && (
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-lg">✓</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">Aplikacja zainstalowana!</p>
                  <p className="text-xs text-gray-500 mt-0.5">Ostatni krok — wlacz powiadomienia</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-sm text-gray-700 text-center font-medium">Bedziesz dostawac powiadomienia o:</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>📋</span> Nowe zadania
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>🌡️</span> Temperatury
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>✅</span> Checklista
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>⏰</span> Zmiany
                  </div>
                </div>
              </div>

              <button
                onClick={handleEnablePush}
                disabled={subscribing}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-2xl text-base shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {subscribing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Wlaczam...
                  </span>
                ) : (
                  '🔔  Wlacz powiadomienia'
                )}
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center space-y-4 py-2">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">Powiadomienia wlaczone! Bedziesz dostawac przypomnienia o zadaniach, temperaturach i checklistach.</p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {step !== 'done' && (
          <div className="px-6 pb-8 flex gap-3">
            <button
              onClick={handleRemindLater}
              className="flex-1 py-3 text-sm text-gray-500 bg-gray-100 rounded-xl font-medium active:scale-95 transition-transform"
            >
              Pozniej
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 py-3 text-sm text-gray-400 bg-gray-50 rounded-xl font-medium active:scale-95 transition-transform"
            >
              Nie pokazuj
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
