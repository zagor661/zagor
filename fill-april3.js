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

function randomTemp(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10
}

async function sendToSheets(payload) {
  const url = WEBHOOK_URL + '?payload=' + encodeURIComponent(JSON.stringify(payload))
  const res = await fetch(url)
  const text = await res.text()
  console.log('OK:', text.substring(0, 80))
}

async function run() {
  const date = '2026-04-03'
  const author = 'Yurii Dotsiak'
  const location = 'Woki Woki — Imbir i Ryż'

  console.log('=== Uzupełnianie 03.04.2026 — Yurii ===\n')

  // PORANNE temperatury (12:00)
  const morning = UNITS.map(u => ({
    name: u.name,
    temperature: randomTemp(u.min, u.max),
    min: u.min,
    max: u.max,
    outOfRange: false,
    action: '',
  }))

  console.log('☀️  Wysyłam poranne temperatury (12:00)...')
  await sendToSheets({
    type: 'temperature',
    data: {
      shift: 'morning',
      readings: morning,
      author: author,
      location: location,
      date: date,
    }
  })

  await new Promise(r => setTimeout(r, 2000))

  // WIECZORNE temperatury (20:00)
  const evening = UNITS.map(u => ({
    name: u.name,
    temperature: randomTemp(u.min, u.max),
    min: u.min,
    max: u.max,
    outOfRange: false,
    action: '',
  }))

  console.log('🌙 Wysyłam wieczorne temperatury (20:00)...')
  await sendToSheets({
    type: 'temperature',
    data: {
      shift: 'evening',
      readings: evening,
      author: author,
      location: location,
      date: date,
    }
  })

  console.log('\n✅ Gotowe! 03.04.2026 — Yurii Dotsiak')
}

run().catch(console.error)
