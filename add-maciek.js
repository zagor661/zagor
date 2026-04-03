const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://cjrcujmfnggmzyxedzin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcmN1am1mbmdnbXp5eGVkemluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEyMjA2NCwiZXhwIjoyMDkwNjk4MDY0fQ.im3Wbrzx4XpG36m1l69r6q8DD0Nn4iAVI9HcX3WOK2E'
)

async function main() {
  console.log('Dodaję Maciek...')

  const { data: user, error } = await supabase.auth.admin.createUser({
    email: 'maciek@kitchenops.local',
    password: 'worker1234',
    email_confirm: true,
    user_metadata: { full_name: 'Maciek' },
  })

  if (error) { console.log('Błąd:', error.message); return }
  console.log('Auth user:', user.user.id)

  await supabase.from('profiles').update({ pin: '4444', role: 'worker' }).eq('id', user.user.id)

  const { data: loc } = await supabase.from('locations').select('id').ilike('name', '%Woki%').limit(1)
  if (loc && loc[0]) {
    await supabase.from('user_locations').upsert({
      user_id: user.user.id,
      location_id: loc[0].id,
      is_primary: true,
    }, { onConflict: 'user_id,location_id' })
  }

  console.log('✅ Maciek dodany — PIN: 4444')
}

main().catch(e => console.error(e))
