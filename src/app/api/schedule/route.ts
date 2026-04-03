import { NextResponse } from 'next/server'

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '14PQAd_omauQWHuoMH07CiuTFMKr4a5mduwdh_4F8pY4'
const SHEET_NAME = process.env.SCHEDULE_SHEET_NAME || 'Grafik zmianowy'

export async function GET() {
  try {
    // Use Google Sheets public CSV export
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`

    const res = await fetch(url, {
      next: { revalidate: 300 }, // cache 5 min
    })

    if (!res.ok) {
      console.error('Google Sheets fetch failed:', res.status)
      return NextResponse.json({ ok: false, error: 'Nie udało się pobrać grafiku' }, { status: 500 })
    }

    const text = await res.text()
    // Google returns JSONP-like: google.visualization.Query.setResponse({...})
    const jsonStr = text.replace(/^.*google\.visualization\.Query\.setResponse\(/, '').replace(/\);?\s*$/, '')
    const json = JSON.parse(jsonStr)

    const rows = json.table.rows
    const cols = json.table.cols

    // Parse schedule data
    // Expected columns: Start zmiany, Koniec zmiany, Ilość godzin, Część, Osoby...
    const shifts: any[] = []

    for (const row of rows) {
      const cells = row.c
      if (!cells || !cells[0]) continue

      // Column A: Start zmiany (date)
      const startCell = cells[0]
      if (!startCell || !startCell.v) continue

      let startDate: string
      if (typeof startCell.v === 'string' && startCell.v.startsWith('Date(')) {
        // Parse Date(year, month, day, hour, min, sec)
        const parts = startCell.v.replace('Date(', '').replace(')', '').split(',').map(Number)
        const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0)
        startDate = d.toISOString()
      } else {
        startDate = String(startCell.v)
      }

      // Column B: Koniec zmiany
      const endCell = cells[1]
      let endDate = ''
      if (endCell && endCell.v) {
        if (typeof endCell.v === 'string' && endCell.v.startsWith('Date(')) {
          const parts = endCell.v.replace('Date(', '').replace(')', '').split(',').map(Number)
          const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0)
          endDate = d.toISOString()
        } else {
          endDate = String(endCell.v)
        }
      }

      // Column C: Hours
      const hoursCell = cells[2]
      const hours = hoursCell && hoursCell.v ? Number(hoursCell.v) : 0

      // Column D: Section (KUCHNIA / SALA)
      const sectionCell = cells[3]
      const section = sectionCell && sectionCell.v ? String(sectionCell.v).trim() : ''

      // Columns E+: Workers
      const workers: string[] = []
      for (let i = 4; i < cells.length; i++) {
        if (cells[i] && cells[i].v) {
          const name = String(cells[i].v).trim()
          if (name) workers.push(name)
        }
      }

      if (workers.length === 0) continue

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
