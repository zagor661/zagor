import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, data, userEmail } = body

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log('RESEND_API_KEY not set — skipping email')
      return NextResponse.json({ ok: true, skipped: true })
    }

    const to = process.env.REPORT_EMAIL || 'jakub.zagorski@gmail.com'
    let subject = ''
    let html = ''
    let emailOk = false

    if (type === 'temperature') {
      const hasBothShifts = data.morningReadings && data.eveningReadings
      subject = `🌡️ KitchenOps — Raport temperatur — ${data.date}`

      const buildTable = (readings: any[], shiftLabel: string) => `
        <h3 style="color: #374151; margin-top: 20px;">${shiftLabel}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background: #f3f4f6;">
            <th style="text-align: left; padding: 8px; border: 1px solid #e5e7eb;">Urządzenie</th>
            <th style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">Temp.</th>
            <th style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">Norma</th>
            <th style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">Status</th>
          </tr>
          ${readings.map((r: any) => `
            <tr style="${r.outOfRange ? 'background: #fef2f2;' : ''}">
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${r.name}</td>
              <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; ${r.outOfRange ? 'color: #dc2626;' : ''}">${r.temperature}°C</td>
              <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb; color: #6b7280;">${r.min}° – ${r.max}°C</td>
              <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">${r.outOfRange ? '⚠️ POZA NORMĄ' : '✅ OK'}</td>
            </tr>
            ${r.outOfRange && r.action ? `<tr style="background: #fef2f2;"><td colspan="4" style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626; font-size: 13px;">↳ Działanie: ${r.action}</td></tr>` : ''}
          `).join('')}
        </table>
      `

      if (hasBothShifts) {
        html = `
          <div style="font-family: system-ui, sans-serif; max-width: 600px;">
            <h2 style="color: #ec7a11;">🌡️ Raport temperatur — cały dzień</h2>
            <p><strong>Data:</strong> ${data.date}</p>
            <p><strong>Zapisał:</strong> ${data.author}</p>
            <p><strong>Lokal:</strong> ${data.location}</p>
            ${buildTable(data.morningReadings, '☀️ Poranna (12:00)')}
            ${buildTable(data.eveningReadings, '🌙 Wieczorna (20:00)')}
            <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Wysłano automatycznie z KitchenOps</p>
          </div>
        `
      } else {
        html = `
          <div style="font-family: system-ui, sans-serif; max-width: 600px;">
            <h2 style="color: #ec7a11;">🌡️ Raport temperatur</h2>
            <p><strong>Data:</strong> ${data.date}</p>
            <p><strong>Zapisał:</strong> ${data.author}</p>
            <p><strong>Lokal:</strong> ${data.location}</p>
            ${buildTable(data.readings, data.shift === 'morning' ? '☀️ Poranna (12:00)' : '🌙 Wieczorna (20:00)')}
            <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Wysłano automatycznie z KitchenOps</p>
          </div>
        `
      }
    } else if (type === 'cleaning') {
      const doneCount = data.tasks.filter((t: any) => t.done).length
      subject = `🧹 KitchenOps — Czystość tyg. ${data.week} — ${doneCount}/${data.tasks.length} zadań — ${data.date}`
      html = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px;">
          <h2 style="color: #ec7a11;">🧹 Raport czystości tygodniowej</h2>
          <p><strong>Data:</strong> ${data.date}</p>
          <p><strong>Tydzień:</strong> ${data.week}</p>
          <p><strong>Zapisał:</strong> ${data.author}</p>
          <p><strong>Wykonano:</strong> ${doneCount}/${data.tasks.length} zadań</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <tr style="background: #f3f4f6;">
              <th style="text-align: center; padding: 8px; border: 1px solid #e5e7eb; width: 40px;">✓</th>
              <th style="text-align: left; padding: 8px; border: 1px solid #e5e7eb;">Zadanie</th>
            </tr>
            ${data.tasks.map((t: any) => `
              <tr style="${t.done ? 'background: #f0fdf4;' : ''}">
                <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">${t.done ? '✅' : '⬜'}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; ${t.done ? '' : 'color: #9ca3af;'}">${t.name}</td>
              </tr>
            `).join('')}
          </table>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Wysłano automatycznie z KitchenOps</p>
        </div>
      `
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'KitchenOps <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    })

    const result = await res.json()
    console.log('>>> Resend status:', res.status, 'result:', JSON.stringify(result))
    emailOk = res.ok
    if (!res.ok) {
      console.error('Resend error:', result)
    }

    // --- Google Sheets webhook ---
    const sheetsUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL
    let sheetsOk = false
    if (sheetsUrl) {
      try {
        const sheetsPayload: any = { type, data: {} }

        if (type === 'temperature') {
          sheetsPayload.data.date = data.date
          sheetsPayload.data.author = data.author
          sheetsPayload.data.location = data.location

          const mapReadings = (readings: any[]) => readings.map((r: any) => ({
            name: r.name,
            temperature: r.temperature,
            min: r.min,
            max: r.max,
            outOfRange: r.outOfRange,
            action: r.action || '',
          }))

          const sendToSheets = async (shift: string, readings: any[]) => {
            const payload = JSON.parse(JSON.stringify(sheetsPayload))
            payload.data.shift = shift
            payload.data.readings = mapReadings(readings)
            const jsonBody = JSON.stringify(payload)
            const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(jsonBody)
            console.log(`>>> Sending ${shift.toUpperCase()} to Google Sheets`)
            const res = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
            console.log(`>>> ${shift} sheets status:`, res.status)
            return res.ok
          }

          // Send morning readings
          if (data.morningReadings && data.morningReadings.length > 0) {
            await sendToSheets('morning', data.morningReadings)
          }

          // Send evening readings
          if (data.eveningReadings && data.eveningReadings.length > 0) {
            await sendToSheets('evening', data.eveningReadings)
          }

          // Fallback: if no morning/evening split, use readings
          if (!data.morningReadings && !data.eveningReadings && data.readings && data.readings.length > 0) {
            await sendToSheets(data.shift || 'unknown', data.readings)
          }

          sheetsOk = true
        } else if (type === 'cleaning') {
          sheetsPayload.data.date = data.date
          sheetsPayload.data.week = data.week
          sheetsPayload.data.author = data.author
          sheetsPayload.data.tasks = data.tasks.map((t: any) => ({
            name: t.name,
            done: t.done,
          }))

          const jsonBody = JSON.stringify(sheetsPayload)
          const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(jsonBody)
          console.log('>>> Sending CLEANING to Google Sheets')
          const sheetsRes = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
          console.log('>>> Cleaning sheets status:', sheetsRes.status)
          sheetsOk = sheetsRes.ok
        }
      } catch (e: any) {
        console.error('Google Sheets webhook error:', e.message)
      }
    }

    return NextResponse.json({ ok: emailOk || sheetsOk, email: emailOk, sheets: sheetsOk, id: result?.id })
  } catch (err: any) {
    console.error('Email error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
