import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = body.name || body.full_name
    const pin = body.pin
    const role = body.role || 'kitchen'
    const locationId = body.locationId || body.location_id

    if (!name || !pin) {
      return NextResponse.json({ ok: false, error: 'Missing name or pin' }, { status: 400 })
    }

    // Support both env var names (SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY)
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('[add-worker] No service key found! Check SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json({ ok: false, error: 'No service key configured' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    )

    // Generate unique email — include random suffix to avoid collisions between locations
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
    const suffix = Math.random().toString(36).substring(2, 8)
    const email = `${slug}.${suffix}@kitchenops.local`

    console.log(`[add-worker] Creating user: ${name}, role: ${role}, email: ${email}, location: ${locationId}`)

    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: 'worker' + pin + suffix,
      email_confirm: true,
      user_metadata: { full_name: name },
    })

    if (authErr) {
      console.error('[add-worker] createUser error:', authErr)
      throw authErr
    }

    console.log(`[add-worker] Auth user created: ${authUser.user.id}`)

    // Update profile with pin, role, full_name and is_active
    const { error: profErr } = await admin.from('profiles').update({
      full_name: name,
      pin,
      role,
      is_active: true,
    }).eq('id', authUser.user.id)

    if (profErr) {
      console.error('[add-worker] Profile update error:', profErr)
      // Profile might not exist yet (trigger delay) — try insert instead
      const { error: insertErr } = await admin.from('profiles').upsert({
        id: authUser.user.id,
        full_name: name,
        email,
        pin,
        role,
        is_active: true,
      })
      if (insertErr) console.error('[add-worker] Profile upsert error:', insertErr)
    }

    // Link to location
    if (locationId) {
      const { error: linkErr } = await admin.from('user_locations').upsert({
        user_id: authUser.user.id,
        location_id: locationId,
        is_primary: true,
      }, { onConflict: 'user_id,location_id' })

      if (linkErr) {
        console.error('[add-worker] user_locations link error:', linkErr)
      } else {
        console.log(`[add-worker] Linked ${authUser.user.id} to location ${locationId}`)
      }
    }

    return NextResponse.json({ ok: true, id: authUser.user.id, name, pin })
  } catch (err: any) {
    console.error('[add-worker] Error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
