import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { name, pin, locationId } = await req.json()

    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (!serviceKey) {
      return NextResponse.json({ ok: false, error: 'No service key' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    )

    // Create auth user
    const email = name.toLowerCase().replace(/\s+/g, '.') + '@kitchenops.local'
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: 'worker1234',
      email_confirm: true,
      user_metadata: { full_name: name },
    })

    if (authErr) throw authErr

    // Update profile with pin
    await admin.from('profiles').update({ pin, role: 'worker' }).eq('id', authUser.user.id)

    // Link to location
    if (locationId) {
      await admin.from('user_locations').upsert({
        user_id: authUser.user.id,
        location_id: locationId,
        is_primary: true,
      }, { onConflict: 'user_id,location_id' })
    }

    return NextResponse.json({ ok: true, id: authUser.user.id, name, pin })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
