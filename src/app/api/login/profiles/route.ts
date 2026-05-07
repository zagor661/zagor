import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/login/profiles?loc=LOCATION_ID
// Returns profiles linked to a specific location via user_locations
// Uses service key to bypass RLS

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get('loc')
  if (!locationId) {
    return NextResponse.json({ error: 'Missing loc parameter' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Get user IDs linked to this location
  const { data: links, error: linksErr } = await supabase
    .from('user_locations')
    .select('user_id')
    .eq('location_id', locationId)

  if (linksErr) {
    return NextResponse.json({ error: linksErr.message }, { status: 500 })
  }

  if (!links || links.length === 0) {
    return NextResponse.json({ profiles: [], stars: {} })
  }

  const userIds = links.map(l => l.user_id)

  // Load profiles
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('is_active', true)
    .in('id', userIds)
    .order('full_name')

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  // Load star counts
  const { data: starData } = await supabase
    .from('worker_stars')
    .select('profile_id')
    .eq('location_id', locationId)

  const stars: Record<string, number> = {}
  if (starData) {
    for (const s of starData) {
      stars[s.profile_id] = (stars[s.profile_id] || 0) + 1
    }
  }

  return NextResponse.json({ profiles: profiles || [], stars })
}
