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
const WORKERS = ['Jakub Zagórski', 'Yurii', 'Piotr', 'Michał']

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
  const date = '2026-04-02'
  const worker = WORKERS[Math.floor(Math.random() * WORKERS.length)]

  console.log('=== Uzupełnianie 02.04.2026 ===')

  // Morning
  const morning = UNITS.map(u => ({
    unit_name: u.name, temperature: randomTemp(u.min, u.max), temp_min: u.min, temp_max: u.max,
  }))
  console.log('Wysyłam poranne temperatury...')
  await sendToSheets({ type: 'temperature', data: { shift: 'morning', readings: morning, worker_name: worker, date, time: '12:00' } })

  await new Promise(r => setTimeout(r, 2000))

  // Evening
  const evening = UNITS.map(u => ({
    unit_name: u.name, temperature: randomTemp(u.min, u.max), temp_min: u.min, temp_max: u.max,
  }))
  console.log('Wysyłam wieczorne temperatury...')
  await sendToSheets({ type: 'temperature', data: { shift: 'evening', readings: evening, worker_name: worker, date, time: '20:00' } })

  console.log('\n✅ Gotowe! 02.04.2026 uzupełnione.')
}

run().catch(console.error)
