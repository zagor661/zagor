/**
 * Jednorazowy skrypt: import grafiku kwiecien 2026 z Google Sheets → Supabase
 *
 * Uzycie:
 *   cd "MOJE PROJEKTY/KITCHEN OPS/kitchen-ops-v2"
 *   npx tsx scripts/import-april-schedule.ts
 *
 * Wymaga zmiennych srodowiskowych (lub wstaw ponizej):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (lub NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Brak SUPABASE_URL lub SUPABASE_KEY w .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Grafik z Google Sheets: GRAFIK_WOKI_WOKI kwiecien 2026 ─────
const SCHEDULE = [
  { date: '2026-04-01', workers: ['PIOTR', 'YURII', 'ZUZIA'] },
  { date: '2026-04-02', workers: ['YURII', 'PIOTR', 'ZUZIA'] },
  { date: '2026-04-03', workers: ['MACIEK', 'YURII', 'KASIA'] },
  { date: '2026-04-04', workers: ['MACIEK', 'MICHAŁ', 'KASIA'] },
  { date: '2026-04-05', workers: ['MICHAŁ', 'PIOTR', 'KASIA'] },
  { date: '2026-04-06', workers: ['YURII', 'PIOTR', 'ZUZIA'] },
  { date: '2026-04-07', workers: ['YURII', 'MACIEK', 'ZUZIA'] },
  { date: '2026-04-08', workers: ['MACIEK', 'KASIA', 'PIOTR'] },
  { date: '2026-04-09', workers: ['PIOTR', 'KASIA', 'YURII'] },
  { date: '2026-04-10', workers: ['YURII', 'MACIEK', 'ZUZIA'] },
  { date: '2026-04-11', workers: ['YURII', 'PIOTR', 'ZUZIA'] },
  { date: '2026-04-12', workers: ['MACIEK', 'PIOTR', 'KASIA'] },
  { date: '2026-04-13', workers: ['PIOTR', 'MACIEK', 'ZUZIA'] },
  { date: '2026-04-14', workers: ['YURII', 'PIOTR', 'ZUZIA'] },
  { date: '2026-04-15', workers: ['YURII', 'MACIEK', 'KASIA'] },
  { date: '2026-04-16', workers: ['MACIEK', 'MICHAŁ', 'ZUZIA'] },
  { date: '2026-04-17', workers: ['MICHAŁ', 'PIOTR', 'KASIA'] },
  { date: '2026-04-18', workers: ['YURII', 'KASIA'] },
  { date: '2026-04-19', workers: ['YURII', 'MICHAŁ', 'KASIA'] },
  { date: '2026-04-20', workers: ['YURII', 'MICHAŁ', 'ZUZIA'] },
  { date: '2026-04-21', workers: ['YURII', 'MICHAŁ', 'ZUZIA'] },
  { date: '2026-04-22', workers: ['MICHAŁ', 'PIOTR', 'KASIA'] },
  { date: '2026-04-23', workers: ['PIOTR', 'MICHAŁ', 'KASIA'] },
  { date: '2026-04-24', workers: ['PIOTR', 'YURII', 'ZUZIA'] },
  { date: '2026-04-25', workers: ['MICHAŁ', 'PIOTR', 'ZUZIA'] },
  { date: '2026-04-26', workers: ['YURII', 'MICHAŁ', 'KASIA'] },
  { date: '2026-04-27', workers: ['YURII', 'PIOTR', 'KASIA'] },
  { date: '2026-04-28', workers: ['MICHAŁ', 'YURII', 'ZUZIA'] },
  { date: '2026-04-29', workers: ['MICHAŁ', 'PIOTR', 'ZUZIA'] },
  { date: '2026-04-30', workers: ['YURII', 'MICHAŁ', 'KASIA'] },
]

// Zdrobnienia → pelne imiona
const NICKNAMES: Record<string, string[]> = {
  'KASIA': ['KATARZYNA'],
  'KATARZYNA': ['KASIA'],
  'ZUZIA': ['ZUZANNA'],
  'ZUZANNA': ['ZUZIA'],
  'MACIEK': ['MACIEJ'],
  'MACIEJ': ['MACIEK'],
  'MICHAŁ': ['MICHAL'],
  'MICHAL': ['MICHAŁ'],
}

async function main() {
  console.log('🔄 Importuje grafik kwiecien 2026...\n')

  // 1) Pobierz profile
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, location_id')
    .eq('is_active', true)

  if (profErr || !profiles?.length) {
    console.error('❌ Nie moge pobrac profili:', profErr?.message)
    process.exit(1)
  }

  // Uzyj location_id z pierwszego profilu (WOKI WOKI)
  const locationId = profiles[0].location_id
  console.log(`📍 Location: ${locationId}`)
  console.log(`👥 Profile: ${profiles.map(p => p.full_name).join(', ')}\n`)

  // 2) Zbuduj mape imion
  const nameMap: Record<string, { id: string; role: string }> = {}
  for (const p of profiles) {
    const firstName = p.full_name.split(' ')[0].toUpperCase()
    nameMap[firstName] = { id: p.id, role: p.role }
    const aliases = NICKNAMES[firstName] || []
    for (const alias of aliases) {
      nameMap[alias] = { id: p.id, role: p.role }
    }
  }

  // 3) Buduj zmiany
  const shifts: any[] = []
  const unmatched = new Set<string>()

  for (const day of SCHEDULE) {
    for (const name of day.workers) {
      const key = name.trim().toUpperCase()
      const match = nameMap[key]
      if (!match) {
        unmatched.add(key)
        continue
      }
      shifts.push({
        location_id: locationId,
        worker_id: match.id,
        shift_date: day.date,
        department: match.role === 'hall' ? 'hall' : 'kitchen',
        start_time: '11:00',
        end_time: '21:00',
        status: 'scheduled',
        schedule_month: '2026-04-01',
      })
    }
  }

  if (unmatched.size > 0) {
    console.warn(`⚠️  Nie znaleziono profili dla: ${[...unmatched].join(', ')}`)
    console.warn('    Sprawdz czy te osoby maja profil w Supabase z odpowiednim imieniem.\n')
  }

  console.log(`📋 Przygotowano ${shifts.length} zmian na ${SCHEDULE.length} dni`)

  // 4) Usun stare zmiany kwiecien 2026
  const { error: delErr } = await supabase
    .from('schedule_shifts')
    .delete()
    .eq('location_id', locationId)
    .eq('schedule_month', '2026-04-01')

  if (delErr) {
    console.error('❌ Blad usuwania starych zmian:', delErr.message)
    process.exit(1)
  }
  console.log('🗑️  Usunieto stare zmiany kwiecien 2026')

  // 5) Wstaw nowe w batchach
  const batchSize = 50
  let inserted = 0
  for (let i = 0; i < shifts.length; i += batchSize) {
    const batch = shifts.slice(i, i + batchSize)
    const { error: insErr } = await supabase
      .from('schedule_shifts')
      .insert(batch)
    if (insErr) {
      console.error(`❌ Blad insertu batch ${i}:`, insErr.message)
      process.exit(1)
    }
    inserted += batch.length
  }

  console.log(`\n✅ Zaimportowano ${inserted} zmian!`)
  console.log('   Kuchnia: YURII, PIOTR, MACIEK, MICHAŁ')
  console.log('   Sala: KASIA (Katarzyna), ZUZIA (Zuzanna)')
  console.log('\n🎉 Grafik kwiecien 2026 zsynchronizowany z Google Sheets.')
}

main().catch(e => {
  console.error('❌ Fatal:', e)
  process.exit(1)
})
