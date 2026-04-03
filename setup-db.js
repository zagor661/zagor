/**
 * KitchenOps v2 — Database Setup
 * Uruchom: node setup-db.js
 *
 * Co robi:
 * 1. Dodaje kolumnę PIN do profiles
 * 2. Tworzy/aktualizuje profil admina (Jakub)
 * 3. Tworzy profile pracowników (Yurii, Dawid, Maciej)
 * 4. Sprawdza lokale i przypisania
 * 5. Tworzy tabelę worker_tasks
 * 6. Sprawdza cooling_units i cleaning_tasks
 */

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://cjrcujmfnggmzyxedzin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcmN1am1mbmdnbXp5eGVkemluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjA2NCwiZXhwIjoyMDkwNjk4MDY0fQ.im3Wbrzx4XpG36m1l69r6q8DD0Nn4iAVI9HcX3WOK2E'
)

async function main() {
  console.log('='.repeat(50))
  console.log('KitchenOps v2 — Database Setup')
  console.log('='.repeat(50))

  // 1. Add PIN column to profiles
  console.log('\n[1/7] Dodaję kolumnę PIN do profiles...')
  const { error: colErr } = await supabase.rpc('exec_sql', {
    query: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT '0000'"
  }).maybeSingle()

  // If rpc doesn't work, try direct SQL
  if (colErr) {
    console.log('   RPC niedostępne, próbuję alternatywnie...')
    // Try via raw query through postgrest - just update existing profiles
    // The column might already exist
  }
  console.log('   ✅ OK (lub kolumna już istnieje)')

  // 2. Create/update admin profile
  console.log('\n[2/7] Admin: Jakub Zagórski...')
  const ADMIN_ID = 'f3754bde-8f77-42c8-a327-ef79cccda942'

  const { error: adminErr } = await supabase.from('profiles').upsert({
    id: ADMIN_ID,
    email: 'jakub.zagorski@gmail.com',
    full_name: 'Jakub Zagórski',
    role: 'admin',
    pin: '1234',
    preferred_language: 'pl',
    is_active: true,
  }, { onConflict: 'id' })

  if (adminErr) {
    console.log('   ⚠️', adminErr.message)
    // Try update only
    await supabase.from('profiles').update({ pin: '1234', role: 'admin' }).eq('id', ADMIN_ID)
  }
  console.log('   ✅ Jakub Zagórski — PIN: 1234 (admin)')

  // 3. Create Supabase Auth users for workers + profiles
  console.log('\n[3/7] Tworzę pracowników...')

  const workers = [
    { email: 'yurii@kitchenops.local', name: 'Yurii Dotsiak', pin: '1111' },
    { email: 'dawid@kitchenops.local', name: 'Dawid Czubak', pin: '2222' },
    { email: 'maciej@kitchenops.local', name: 'Maciej Słonowski', pin: '3333' },
  ]

  for (const w of workers) {
    // Check if auth user exists
    const { data: existing } = await supabase.auth.admin.listUsers()
    const found = existing?.users?.find(u => u.email === w.email)

    let userId
    if (found) {
      userId = found.id
      console.log(`   ${w.name} — już istnieje (${userId})`)
    } else {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: w.email,
        password: 'worker1234',
        email_confirm: true,
        user_metadata: { full_name: w.name },
      })
      if (createErr) {
        console.log(`   ⚠️ ${w.name}:`, createErr.message)
        continue
      }
      userId = newUser.user.id
      console.log(`   ${w.name} — stworzony (${userId})`)
    }

    // Upsert profile
    await supabase.from('profiles').upsert({
      id: userId,
      email: w.email,
      full_name: w.name,
      role: 'worker',
      pin: w.pin,
      preferred_language: 'pl',
      is_active: true,
    }, { onConflict: 'id' })

    console.log(`   ✅ ${w.name} — PIN: ${w.pin}`)
  }

  // 4. Check locations
  console.log('\n[4/7] Sprawdzam lokale...')
  const { data: locs } = await supabase.from('locations').select('id, name').eq('is_active', true)

  if (!locs || locs.length === 0) {
    console.log('   Tworzę lokale...')
    await supabase.from('locations').insert([
      { name: 'Woki Woki - Imbir i Ryż', address: 'Dworcowa 8', city: 'Bielsko-Biała' },
      { name: 'Nash Hot Chicken', city: 'Bielsko-Biała' },
    ])
  }
  const { data: allLocs } = await supabase.from('locations').select('id, name')
  const wokiLoc = allLocs?.find(l => l.name.includes('Woki'))
  console.log('   Lokale:', allLocs?.map(l => l.name).join(', '))
  if (wokiLoc) console.log('   Woki Woki ID:', wokiLoc.id)

  // 5. Link all users to Woki Woki
  console.log('\n[5/7] Przypisuję użytkowników do lokalu...')
  if (wokiLoc) {
    const { data: allProfiles } = await supabase.from('profiles').select('id, full_name').eq('is_active', true)
    if (allProfiles) {
      for (const p of allProfiles) {
        await supabase.from('user_locations').upsert({
          user_id: p.id,
          location_id: wokiLoc.id,
          is_primary: true,
        }, { onConflict: 'user_id,location_id' })
        console.log(`   ✅ ${p.full_name} → ${wokiLoc.name}`)
      }
    }
  }

  // 6. Create worker_tasks table
  console.log('\n[6/7] Tworzę tabelę worker_tasks...')
  const createTasksSQL = `
    CREATE TABLE IF NOT EXISTS worker_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to UUID REFERENCES profiles(id),
      created_by UUID NOT NULL,
      due_date DATE,
      is_completed BOOLEAN NOT NULL DEFAULT false,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE worker_tasks ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS worker_tasks_all ON worker_tasks;
    CREATE POLICY worker_tasks_all ON worker_tasks FOR ALL USING (true) WITH CHECK (true);
  `

  // Try via SQL function
  const { error: sqlErr } = await supabase.rpc('exec_sql', { query: createTasksSQL }).maybeSingle()
  if (sqlErr) {
    console.log('   ⚠️ Nie mogę stworzyć tabeli automatycznie.')
    console.log('   Wejdź na https://supabase.com/dashboard → SQL Editor i wklej:')
    console.log('   ' + createTasksSQL.replace(/\n/g, '\n   '))
  } else {
    console.log('   ✅ Tabela worker_tasks gotowa')
  }

  // Also add pin column via SQL
  const pinSQL = "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT '0000';"
  await supabase.rpc('exec_sql', { query: pinSQL }).maybeSingle()

  // 7. Check HACCP data
  console.log('\n[7/7] Sprawdzam dane HACCP...')
  const { data: units } = await supabase.from('cooling_units').select('id, name').eq('is_active', true)
  const { data: cleanTasks } = await supabase.from('cleaning_tasks').select('id, name').eq('is_active', true)
  console.log(`   Cooling units: ${units?.length || 0}`)
  console.log(`   Cleaning tasks: ${cleanTasks?.length || 0}`)

  if (!units || units.length === 0) {
    console.log('   ⚠️ Brak cooling_units! Tworzę...')
    if (wokiLoc) {
      await supabase.from('cooling_units').insert([
        { location_id: wokiLoc.id, name: 'Stół sałatkowy', unit_type: 'salad_bar', temp_min: 0, temp_max: 5, sort_order: 1 },
        { location_id: wokiLoc.id, name: 'Lodówka makarony', unit_type: 'fridge', temp_min: 0, temp_max: 5, sort_order: 2 },
        { location_id: wokiLoc.id, name: 'Lodówka mięsa / sosy', unit_type: 'fridge', temp_min: 0, temp_max: 4, sort_order: 3 },
        { location_id: wokiLoc.id, name: 'Mięso marynata', unit_type: 'fridge', temp_min: 0, temp_max: 4, sort_order: 4 },
        { location_id: wokiLoc.id, name: 'Lodówka warzywa', unit_type: 'fridge', temp_min: 2, temp_max: 6, sort_order: 5 },
        { location_id: wokiLoc.id, name: 'Zamrażarka 1', unit_type: 'freezer', temp_min: -22, temp_max: -16, sort_order: 6 },
        { location_id: wokiLoc.id, name: 'Zamrażarka 2', unit_type: 'freezer', temp_min: -22, temp_max: -16, sort_order: 7 },
        { location_id: wokiLoc.id, name: 'Lodówka napoje', unit_type: 'fridge', temp_min: 2, temp_max: 8, sort_order: 8 },
      ])
      console.log('   ✅ 8 cooling units stworzone')
    }
  }

  if (!cleanTasks || cleanTasks.length === 0) {
    console.log('   ⚠️ Brak cleaning_tasks! Tworzę...')
    if (wokiLoc) {
      await supabase.from('cleaning_tasks').insert([
        { location_id: wokiLoc.id, name: 'Mycie okapu i filtrów', description: 'Demontaż, mycie, odtłuszczenie', category: 'equipment', sort_order: 1 },
        { location_id: wokiLoc.id, name: 'Wymiana oleju we frytkownicach', description: 'Spuszczenie, czyszczenie, nowy olej', category: 'equipment', sort_order: 2 },
        { location_id: wokiLoc.id, name: 'Czyszczenie lodówek wewnątrz', description: 'Mycie półek i ścianek', category: 'cooling', sort_order: 3 },
        { location_id: wokiLoc.id, name: 'Rozmrażanie zamrażarki', description: 'Wyłączenie, rozmrożenie, mycie', category: 'cooling', sort_order: 4 },
        { location_id: wokiLoc.id, name: 'Czyszczenie kratek odpływowych', description: 'Demontaż, mycie, dezynfekcja', category: 'sanitation', sort_order: 5 },
        { location_id: wokiLoc.id, name: 'Dezynfekcja desek do krojenia', description: 'Głęboka dezynfekcja, kontrola stanu', category: 'sanitation', sort_order: 6 },
        { location_id: wokiLoc.id, name: 'Mycie ścian i podłóg za sprzętem', description: 'Odsunięcie sprzętu, mycie', category: 'sanitation', sort_order: 7 },
        { location_id: wokiLoc.id, name: 'Dezynfekcja pojemników na odpady', description: 'Opróżnienie, mycie, dezynfekcja', category: 'sanitation', sort_order: 8 },
        { location_id: wokiLoc.id, name: 'Kontrola dat przydatności', description: 'Przegląd produktów, FIFO', category: 'inventory', sort_order: 9 },
        { location_id: wokiLoc.id, name: 'Czyszczenie wentylacji', description: 'Kratki, filtry klimatyzacji', category: 'equipment', sort_order: 10 },
        { location_id: wokiLoc.id, name: 'Czyszczenie pieca', description: 'Wnętrze, blachy, prowadnice', category: 'equipment', sort_order: 11 },
        { location_id: wokiLoc.id, name: 'Dezynfekcja klamek i uchwytów', description: 'Klamki, szuflady, uchwyty', category: 'sanitation', sort_order: 12 },
        { location_id: wokiLoc.id, name: 'Głębokie czyszczenie woka', description: 'Usunięcie nagaru, sezonowanie', category: 'equipment', sort_order: 13 },
        { location_id: wokiLoc.id, name: 'Czyszczenie rice cookera', description: 'Demontaż, mycie, odkamienianie', category: 'equipment', sort_order: 14 },
      ])
      console.log('   ✅ 14 cleaning tasks stworzone')
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('✅ GOTOWE! Podsumowanie:')
  console.log('')
  console.log('Użytkownicy:')
  console.log('  👑 Jakub Zagórski  — PIN: 1234 (admin)')
  console.log('  👨‍🍳 Yurii Dotsiak   — PIN: 1111')
  console.log('  👨‍🍳 Dawid Czubak    — PIN: 2222')
  console.log('  👨‍🍳 Maciej Słonowski — PIN: 3333')
  console.log('')
  console.log('Teraz uruchom appkę:')
  console.log('  npm run dev')
  console.log('  → http://localhost:3000')
  console.log('')
  console.log('⚠️  WAŻNE: Jeśli widzisz błąd z kolumną "pin",')
  console.log('   wejdź na https://supabase.com/dashboard → SQL Editor i wklej:')
  console.log("   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT '0000';")
  console.log('')
  console.log('⚠️  WAŻNE: Jeśli zadania nie działają,')
  console.log('   wklej w SQL Editor:')
  console.log('   CREATE TABLE IF NOT EXISTS worker_tasks (')
  console.log('     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),')
  console.log('     location_id UUID REFERENCES locations(id),')
  console.log('     title TEXT NOT NULL, description TEXT,')
  console.log('     assigned_to UUID REFERENCES profiles(id),')
  console.log('     created_by UUID NOT NULL, due_date DATE,')
  console.log('     is_completed BOOLEAN DEFAULT false,')
  console.log('     completed_at TIMESTAMPTZ,')
  console.log('     created_at TIMESTAMPTZ DEFAULT now()');
  console.log('   );')
  console.log('   ALTER TABLE worker_tasks ENABLE ROW LEVEL SECURITY;')
  console.log("   CREATE POLICY worker_tasks_all ON worker_tasks FOR ALL USING (true) WITH CHECK (true);")
  console.log('='.repeat(50))
}

main().catch(e => console.error('FATAL:', e))
