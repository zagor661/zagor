import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/login/verify-pin
// Verifies PIN server-side — never exposes PIN to client
// Returns { ok: true, profile } on success, { ok: false } on failure

export async function POST(req: NextRequest) {
  try {
    const { user_id, pin, location_id } = await req.json()

    if (!user_id || !pin || !location_id) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // 1. Verify user belongs to this location
    const { data: link } = await supabase
      .from('user_locations')
      .select('user_id')
      .eq('user_id', user_id)
      .eq('location_id', location_id)
      .maybeSingle()

    if (!link) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 })
    }

    // 2. Get profile with PIN (server-side only)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, pin')
      .eq('id', user_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
    }

    // 3. Compare PIN server-side
    if (profile.pin !== pin) {
      return NextResponse.json({ ok: false, error: 'Wrong PIN' })
    }

    // 4. Return profile WITHOUT pin
    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
