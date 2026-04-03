import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '14PQAd_omauQWHuoMH07CiuTFMKr4a5mduwdh_4F8pY4'

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`
    const res = await fetch(url)

    if (!res.ok) {
      console.error('Google Sheets fetch failed:', res.status)
      return NextResponse.json({ ok: false, error: 'Nie udało się pobrać grafiku.' }, { status: 500 })
    }

    // Read as buffer to handle UTF-8 encoding properly
    const buffer = await res.arrayBuffer()
    const csv = new TextDecoder('utf-8').decode(buffer)
    const lines = csv.split('\n').map(line => parseCSVLine(line))

    // Header: Start zmiany, Koniec zmiany, Ilość godzin, Część, Osoby na zmianie, Uwagi przed, Uwagi po
    const shifts: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]
      if (!cols || cols.length < 5) continue

      const startRaw = cols[0]?.trim()
      if (!startRaw) continue

      const endRaw = cols[1]?.trim()
      const hours = parseFloat(cols[2]?.trim()) || 0
      const section = cols[3]?.trim() || ''

      // Column E: Workers — comma-separated in ONE cell like "PIOTR, YURII, ZUZIA"
      const workersRaw = cols[4]?.trim() || ''
      const workers = workersRaw
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0)

      if (workers.length === 0) continue

      // Column F: Notes before shift (optional)
      const notesBefore = cols[5]?.trim() || ''
      // Column G: Notes after shift (optional)
      const notesAfter = cols[6]?.trim() || ''

      // Parse dates WITHOUT timezone conversion — keep as local time
      const start = parseSheetDate(startRaw)
      const end = endRaw ? parseSheetDate(endRaw) : ''

      if (!start) continue

      shifts.push({
        start,
        end,
        hours,
        section,
        workers,
        notesBefore: notesBefore || undefined,
        notesAfter: notesAfter || undefined,
      })
    }

    return NextResponse.json({ ok: true, shifts })
  } catch (err: any) {
    console.error('Schedule API error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

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
    } else if (ch !== '\r') {
      current += ch
    }
  }
  result.push(current)
  return result
}

// Parse date WITHOUT timezone shift — return ISO-like string with no Z suffix
// so the client treats it as local time
function parseSheetDate(raw: string): string {
  if (!raw) return ''

  // Format: "4/1/2026 11:00:00"
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/)
  if (usMatch) {
    const [, month, day, year, hour, min] = usMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min.padStart(2, '0')}:00`
  }

  // Format: "2026-04-01 11:00:00"
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):?(\d{2})?/)
  if (isoMatch) {
    const [, year, month, day, hour, min] = isoMatch
    return `${year}-${month}-${day}T${hour.padStart(2, '0')}:${min.padStart(2, '0')}:00`
  }

  // Format: "1.04.2026 11:00"
  const plMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/)
  if (plMatch) {
    const [, day, month, year, hour, min] = plMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min.padStart(2, '0')}:00`
  }

  return ''
}
