import { NextResponse } from 'next/server'

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '14PQAd_omauQWHuoMH07CiuTFMKr4a5mduwdh_4F8pY4'

export async function GET() {
  try {
    // Use Google Sheets CSV export — simpler, no JSONP parsing needed
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`

    const res = await fetch(url, {
      cache: 'no-store', // always fresh data
    })

    if (!res.ok) {
      console.error('Google Sheets fetch failed:', res.status)
      return NextResponse.json({ ok: false, error: 'Nie udało się pobrać grafiku. Sprawdź czy arkusz jest udostępniony.' }, { status: 500 })
    }

    const csv = await res.text()
    const lines = csv.split('\n').map(line => parseCSVLine(line))

    // Skip header row
    const shifts: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]
      if (!cols || cols.length < 5) continue

      // Column A: Start zmiany
      const startRaw = cols[0]?.trim()
      if (!startRaw) continue

      // Column B: Koniec zmiany
      const endRaw = cols[1]?.trim()

      // Column C: Ilość godzin
      const hours = parseFloat(cols[2]?.trim()) || 0

      // Column D: Część (KUCHNIA / SALA)
      const section = cols[3]?.trim() || ''

      // Columns E+: Workers
      const workers: string[] = []
      for (let j = 4; j < cols.length; j++) {
        const name = cols[j]?.trim()
        if (name) workers.push(name)
      }

      if (workers.length === 0) continue

      // Parse dates
      const startDate = parseSheetDate(startRaw)
      const endDate = endRaw ? parseSheetDate(endRaw) : ''

      if (!startDate) continue

      shifts.push({
        start: startDate,
        end: endDate,
        hours,
        section,
        workers,
      })
    }

    return NextResponse.json({ ok: true, shifts })
  } catch (err: any) {
    console.error('Schedule API error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// Parse CSV line handling quoted fields with commas
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// Parse various date formats from Google Sheets
function parseSheetDate(raw: string): string {
  if (!raw) return ''

  // Try format: "4/1/2026 11:00:00" or "04/01/2026 11:00:00"
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/)
  if (usMatch) {
    const [, month, day, year, hour, min, sec] = usMatch
    const d = new Date(+year, +month - 1, +day, +hour, +min, +(sec || 0))
    return d.toISOString()
  }

  // Try format: "2026-04-01 11:00:00"
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):?(\d{2})?/)
  if (isoMatch) {
    const [, year, month, day, hour, min, sec] = isoMatch
    const d = new Date(+year, +month - 1, +day, +hour, +min, +(sec || 0))
    return d.toISOString()
  }

  // Try format: "1.04.2026 11:00" (Polish)
  const plMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/)
  if (plMatch) {
    const [, day, month, year, hour, min, sec] = plMatch
    const d = new Date(+year, +month - 1, +day, +hour, +min, +(sec || 0))
    return d.toISOString()
  }

  // Fallback — try native Date parse
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch {}

  return ''
}
