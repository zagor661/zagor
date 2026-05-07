// ============================================================
// POST /api/admin/temp-access
// Body: { locationId, adminEmail, days? }
// Grants temporary owner-level access to a KitchenOps admin
// for monitoring / onboarding support (default 7 days)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const KITCHENOPS_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@kitchenops.app'

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    const { locationId, adminEmail, days = 7 } = await req.json()

    if (!locationId) {
      return NextResponse.json({ error: 'Missing locationId' }, { status: 400 })
    }

    const email = adminEmail || KITCHENOPS_ADMIN_EMAIL

    // Find or create admin profile
    let { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (!adminProfile) {
      // Create admin profile if doesn't exist
      const { data: newProfile, error: profErr } = await supabase
        .from('profiles')
        .insert({
          full_name: 'KitchenOps Admin',
          email,
          role: 'owner',
          pin: '0000',
          is_active: true,
        })
        .select('id')
        .single()

      if (profErr) throw profErr
      adminProfile = newProfile
    }

    // Calculate expiry
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + days)

    // Upsert user_locations with expiry
    const { error: linkErr } = await supabase
      .from('user_locations')
      .upsert({
        user_id: adminProfile!.id,
        location_id: locationId,
        role: 'owner',
        is_primary: false,
        expires_at: expiresAt.toISOString(),
      }, { onConflict: 'user_id,location_id' })

    if (linkErr) throw linkErr

    return NextResponse.json({
      ok: true,
      adminId: adminProfile!.id,
      locationId,
      expiresAt: expiresAt.toISOString(),
      days,
    })
  } catch (err: any) {
    console.error('[admin/temp-access] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
