// ============================================================
// GET /api/push/test
// Testowy endpoint — wysyła push do WSZYSTKICH subskrybentów
// Symuluje: zadanie, checklist, temperatura
// Usuń ten plik po testach!
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToLocation, type PushSubscription } from '@/lib/webpush'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@kitchenops.app'

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  // Pick notification type from ?type= param
  const type = req.nextUrl.searchParams.get('type') || 'task'

  const notifications: Record<string, { title: string; body: string; url: string; tag: string }> = {
    task: {
      title: '📋 Zadania do wykonania (2)',
      body: 'Umyć okap, Sprawdzić lodówkę',
      url: '/tasks',
      tag: 'task-reminder',
    },
    'task-overdue': {
      title: '🚨 Masz zaległe zadania (1)',
      body: 'Zamówić sos sojowy — termin minął!',
      url: '/tasks',
      tag: 'task-reminder',
    },
    checklist: {
      title: '📝 Checklist otwarcia',
      body: 'Czas wypełnić checklistę otwarcia lokalu!',
      url: '/checklist',
      tag: 'checklist-open',
    },
    'checklist-urgent': {
      title: '🚨 Checklist otwarcia — nie uzupełniony!',
      body: 'Checklist otwarcia wciąż nie jest wypełniony! Uzupełnij teraz.',
      url: '/checklist',
      tag: 'checklist-open',
    },
    temp: {
      title: '🌡️ Pomiary temperatur poranne',
      body: 'Pora na pomiary temperatur lodówek i zamrażarek!',
      url: '/temperature',
      tag: 'temp-morning',
    },
    'temp-urgent': {
      title: '🚨 Temperatury poranne — brak pomiarów!',
      body: 'Pomiary temperatur poranne wciąż nie uzupełnione! Zrób to teraz.',
      url: '/temperature',
      tag: 'temp-morning',
    },
    shift: {
      title: '⏰ Zmiana za 30 min',
      body: 'Twoja zmiana zaczyna się o 16:00. Przygotuj się!',
      url: '/',
      tag: 'shift-30',
    },
    'break': {
      title: '⚠️ Długa przerwa',
      body: 'Yurii — przerwa trwa 25 min',
      url: '/',
      tag: 'break-alert',
    },
    'mgr-checklist': {
      title: '⚠️ Checklist otwarcia — brak realizacji',
      body: 'Nikt nie uzupełnił checklisty otwarcia. Sprawdź sytuację.',
      url: '/checklist',
      tag: 'checklist-open-mgr',
    },
    'mgr-temp': {
      title: '⚠️ Temperatury poranne — brak realizacji',
      body: 'Nikt nie uzupełnił pomiarów temperatur poranne. Sprawdź sytuację.',
      url: '/temperature',
      tag: 'temp-morning-mgr',
    },
    'mgr-task': {
      title: '⚠️ Zaległe zadania — Yurii',
      body: 'Yurii ma 3 niewykonanych zadań: Umyć okap, Sprawdzić lodówkę (+1 więcej)',
      url: '/tasks',
      tag: 'task-overdue-mgr',
    },
  }

  const payload = notifications[type] || notifications['task']

  // Get ALL subscriptions
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: 'Brak subskrypcji push', subs: 0 }, { status: 404 })
  }

  const result = await sendPushToLocation(
    subs as PushSubscription[],
    { ...payload, icon: '/icon-192.png' },
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject
  )

  return NextResponse.json({
    type,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors || [],
    available_types: Object.keys(notifications),
  })
}
