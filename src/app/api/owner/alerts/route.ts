import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/owner/alerts?locationId=xxx&limit=20&unreadOnly=true
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('locationId')
  const limit = parseInt(searchParams.get('limit') || '20')
  const unreadOnly = searchParams.get('unreadOnly') === 'true'

  if (!locationId) {
    return NextResponse.json({ error: 'Missing locationId' }, { status: 400 })
  }

  let query = supabase
    .from('ai_alerts')
    .select('*')
    .eq('location_id', locationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Count unread
  const { count } = await supabase
    .from('ai_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locationId)
    .eq('is_read', false)

  return NextResponse.json({ alerts: data || [], unreadCount: count || 0 })
}

// POST /api/owner/alerts — mark as read
export async function POST(req: NextRequest) {
  const { alertIds, locationId, markAllRead } = await req.json()

  if (!locationId) {
    return NextResponse.json({ error: 'Missing locationId' }, { status: 400 })
  }

  if (markAllRead) {
    await supabase
      .from('ai_alerts')
      .update({ is_read: true })
      .eq('location_id', locationId)
      .eq('is_read', false)
  } else if (alertIds?.length) {
    await supabase
      .from('ai_alerts')
      .update({ is_read: true })
      .in('id', alertIds)
  }

  return NextResponse.json({ ok: true })
}
