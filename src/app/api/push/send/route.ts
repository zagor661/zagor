// ============================================================
// POST /api/push/send
// Body: { locationId, title, body, url?, tag?, profileIds?: string[] }
// Wysyła push notification do wszystkich w lokacji (lub wybranych)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToLocation, type PushPayload, type PushSubscription } from '@/lib/webpush'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@kitchenops.app'

    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    const body = await req.json()
    const { locationId, title, body: msgBody, url, tag, profileIds } = body

    if (!locationId || !title || !msgBody) {
      return NextResponse.json({ error: 'Missing: locationId, title, body' }, { status: 400 })
    }

    // Get subscriptions
    let query = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('location_id', locationId)

    if (profileIds && profileIds.length > 0) {
      query = query.in('profile_id', profileIds)
    }

    const { data: subs, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, message: 'No subscriptions found' })
    }

    const payload: PushPayload = {
      title,
      body: msgBody,
      icon: '/icon-192.png',
      url: url || '/',
      tag: tag || 'kitchen-ops',
    }

    const result = await sendPushToLocation(
      subs as PushSubscription[],
      payload,
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject
    )

    // Clean up expired subscriptions
    if (result.expired.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', result.expired)
    }

    return NextResponse.json({
      sent: result.sent,
      failed: result.failed,
      expired: result.expired.length,
    })
  } catch (err: any) {
    console.error('[push/send] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
