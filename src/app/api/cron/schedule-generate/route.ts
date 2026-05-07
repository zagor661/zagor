// ============================================================
// GET /api/cron/schedule-generate
// Auto-generuje grafik na NASTĘPNY miesiąc
// Uruchamiany codziennie — działa tylko 7 dni przed końcem miesiąca
// Pomija jeśli grafik na kolejny miesiąc już istnieje
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  // Current date in Poland (UTC+2)
  const now = new Date()
  const polandTime = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const today = polandTime.getUTCDate()
  const currentMonth = polandTime.getUTCMonth() // 0-based
  const currentYear = polandTime.getUTCFullYear()

  // How many days left in current month?
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const daysLeft = daysInMonth - today

  // Only run 7 days before end of month (days 24-31 for a 31-day month)
  if (daysLeft > 7) {
    return NextResponse.json({
      skipped: true,
      message: `${daysLeft} dni do końca miesiąca — za wcześnie na generowanie`,
    })
  }

  // Next month
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
  const nextMonthStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`
  const scheduleMonth = `${nextMonthStr}-01`

  // Get all locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, owner_id')

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'Brak lokali' })
  }

  const results: any[] = []

  for (const loc of locations) {
    // Check if schedule already exists for next month
    const { data: existing } = await supabase
      .from('schedule_shifts')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', loc.id)
      .eq('schedule_month', scheduleMonth)

    if (existing && (existing as any).length > 0) {
      // Use count check instead
      const { count } = await supabase
        .from('schedule_shifts')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', loc.id)
        .eq('schedule_month', scheduleMonth)

      if (count && count > 0) {
        results.push({ location: loc.name, status: 'exists', shifts: count })
        continue
      }
    }

    // Call the generate endpoint internally
    try {
      const generateUrl = `${supabaseUrl.replace('.supabase.co', '')}`
      // Use internal fetch to our own generate API
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || 'https://kitchen-ops-kappa.vercel.app'

      const res = await fetch(`${baseUrl}/api/schedule/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: loc.id,
          month: nextMonthStr,
          userId: loc.owner_id || 'system',
        }),
      })

      const data = await res.json()
      results.push({
        location: loc.name,
        status: res.ok ? 'generated' : 'error',
        ...data,
      })
    } catch (err: any) {
      results.push({
        location: loc.name,
        status: 'error',
        error: err.message,
      })
    }
  }

  console.log('[cron/schedule-generate]', JSON.stringify(results))
  return NextResponse.json({ results, nextMonth: nextMonthStr })
}
