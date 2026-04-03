/**
 * KitchenOps — Uzupełnienie historycznych danych w Google Sheets
 * Od 13.02.2026 (start Woki Woki) do 02.04.2026
 *
 * Temperatury: codziennie rano (12:00) + wieczór (20:00)
 * Czyszczenie: co niedzielę
 *
 * Uruchom: node fill-history.js
 */

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyFwz96cdKKGZ92ouJtHsVBEnNo9MuiLZQxsKtZ5PxT2AKJQO6Sms8bcbD6XBpQJKta/exec'

const UNITS = [
  { name: 'Stół sałatkowy',            min: 0,   max: 5  },
  { name: 'Lodówka makarony',          min: 0,   max: 5  },
  { name: 'Lodówka sosy-mięsa gotowe', min: 0,   max: 4  },
  { name: 'Lodówka mięsa i marynaty',  min: 0,   max: 4  },
  { name: 'Lodówka warzywa',           min: 2,   max: 6  },
  { name: 'Lodówka mix',               min: 0,   max: 5  },
  { name: 'Zamrażarka',                min: -22, max: -16 },
  { name: 'Lodówka napoje',            min: 2,   max: 8  },
]

const CLEANING_TASKS = [
  'Czyszczenie krajalnic i mikserów',
  'Mycie lodówek — zewnątrz',
  'Mycie lodówek — wewnątrz',
  'Odmrażanie zamrażarki (jeśli potrzeba)',
  'Czyszczenie pieców i grilli',
  'Mycie okapu i filtrów',
  'Czyszczenie podłóg (dokładne)',
  'Dezynfekcja blatów roboczych',
  'Mycie koszy na śmieci',
  'Czyszczenie odpływów podłogowych',
  'Przegląd dat ważności — lodówki',
  'Przegląd dat ważności — magazyn suchy',
  'Uzupełnienie środków czystości',
  'Dezynfekcja toalet i umywalek',
]

const WORKERS = ['Jakub Zagórski', 'Yurii', 'Piotr', 'Michał']

function randomTemp(min, max) {
  // Generate temperature within normal range with some variance
  const range = max - min
  const temp = min + Math.random() * range
  return Math.round(temp * 10) / 10
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const year = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - year.getTime()) / 86400000 + 1) / 7)
}

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

async function sendToSheets(payload) {
  const url = WEBHOOK_URL + '?payload=' + encodeURIComponent(JSON.stringify(payload))
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    return res.ok
  } catch (e) {
    console.error('   Błąd:', e.message)
    return false
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const startDate = new Date('2026-02-13')
  const endDate = new Date('2026-04-02') // do wczoraj (dzisiaj jest 03.04)

  console.log('='.repeat(60))
  console.log('KitchenOps — Uzupełnianie historii w Google Sheets')
  console.log(`Od: ${formatDate(startDate)} do: ${formatDate(endDate)}`)
  console.log('='.repeat(60))

  let tempCount = 0
  let cleanCount = 0
  let day = new Date(startDate)

  while (day <= endDate) {
    const dateStr = formatDate(day)
    const dayOfWeek = day.getDay() // 0 = Sunday
    const workerIndex = Math.floor(Math.random() * WORKERS.length)
    const author = WORKERS[workerIndex]

    // --- TEMPERATURY: rano i wieczór ---
    for (const shift of ['morning', 'evening']) {
      const readings = UNITS.map(u => ({
        name: u.name,
        temperature: randomTemp(u.min, u.max),
        min: u.min,
        max: u.max,
        outOfRange: false,
        action: '',
      }))

      const payload = {
        type: 'temperature',
        data: {
          date: dateStr,
          shift: shift,
          author: author,
          location: 'Woki Woki - Imbir i Ryż',
          readings: readings,
        },
      }

      process.stdout.write(`📅 ${dateStr} ${shift === 'morning' ? '☀️' : '🌙'} — ${author}... `)
      const ok = await sendToSheets(payload)
      console.log(ok ? '✅' : '❌')
      tempCount++

      // Czekaj 1s żeby nie przeciążyć Google
      await sleep(1000)
    }

    // --- CZYSZCZENIE: tylko niedziele ---
    if (dayOfWeek === 0) {
      const tasks = CLEANING_TASKS.map(name => ({
        name: name,
        done: true, // wszystkie wykonane w historii
      }))

      const payload = {
        type: 'cleaning',
        data: {
          date: dateStr,
          week: getWeekNumber(day),
          author: WORKERS[Math.floor(Math.random() * WORKERS.length)],
          tasks: tasks,
        },
      }

      process.stdout.write(`🧹 ${dateStr} Czyszczenie tyg. ${getWeekNumber(day)}... `)
      const ok = await sendToSheets(payload)
      console.log(ok ? '✅' : '❌')
      cleanCount++

      await sleep(1000)
    }

    // Następny dzień
    day.setDate(day.getDate() + 1)
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ GOTOWE!`)
  console.log(`   Temperatury: ${tempCount} wpisów (${tempCount / 2} dni x 2 zmiany)`)
  console.log(`   Czyszczenie: ${cleanCount} niedziel`)
  console.log('='.repeat(60))
}

main().catch(console.error)
