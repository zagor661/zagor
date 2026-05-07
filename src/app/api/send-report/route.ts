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

    // Build recipient list — REPORT_EMAIL + extra for remanent
    const baseEmail = process.env.REPORT_EMAIL || userEmail
    const REMANENT_CC = 'jakub.zagorski@gmail.com'
    const to = type === 'remanent' && baseEmail
      ? [baseEmail, REMANENT_CC].filter((v, i, a) => a.indexOf(v) === i) // dedupe
      : baseEmail
    if (!to) {
      return NextResponse.json({ ok: false, error: 'No recipient email configured' }, { status: 400 })
    }
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
    } else if (type === 'breakdown') {
      subject = `🔧 KitchenOps — Awaria [${data.priority}] — ${data.breakdown_type}`
      const priorityColor: Record<string, string> = {
        'Krytyczny': '#991b1b',
        'Wysoki':    '#dc2626',
        'Średni':    '#f59e0b',
        'Niski':     '#16a34a',
      }
      const pc = priorityColor[data.priority] || '#374151'
      const createdStr = new Date(data.created_at).toLocaleString('pl-PL')
      html = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px;">
          <h2 style="color: #ec7a11;">🔧 Nowe zgłoszenie awarii</h2>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="padding:6px; color:#6b7280;">Lokal</td><td style="padding:6px; font-weight:bold;">${data.location || ''}</td></tr>
            <tr><td style="padding:6px; color:#6b7280;">Zgłosił(a)</td><td style="padding:6px; font-weight:bold;">${data.reporter || ''}</td></tr>
            <tr><td style="padding:6px; color:#6b7280;">Data</td><td style="padding:6px;">${createdStr}</td></tr>
            <tr><td style="padding:6px; color:#6b7280;">Rodzaj</td><td style="padding:6px; font-weight:bold;">${data.breakdown_type}</td></tr>
            <tr><td style="padding:6px; color:#6b7280;">Priorytet</td><td style="padding:6px;"><span style="background:${pc}; color:#fff; padding:3px 10px; border-radius:6px; font-weight:bold; font-size:12px;">${data.priority}</span></td></tr>
          </table>
          <h3 style="color:#374151; margin-top:20px;">Opis</h3>
          <div style="background:#f9fafb; border-left:4px solid #ec7a11; padding:12px; white-space:pre-wrap; font-size:14px;">${(data.description || '').replace(/</g,'&lt;')}</div>
          ${data.photo_data ? `<h3 style="color:#374151; margin-top:20px;">📷 Zdjęcie usterki — w załączniku</h3>` : ''}
          <p style="color:#9ca3af; font-size:12px; margin-top:20px;">Wysłano automatycznie z KitchenOps</p>
        </div>
      `
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

    if (type === 'remanent') {
      const totalItems = data.entries?.length || 0
      const totalValue = data.totalValue ? `${(data.totalValue / 100).toFixed(2)} zł` : '—'
      subject = `📊 KitchenOps — Remanent — ${data.date} — ${totalItems} pozycji`

      // Group entries by category
      const grouped: Record<string, { name: string; quantity: number; unit: string; custom?: boolean }[]> = {}
      for (const e of (data.entries || [])) {
        const cat = data.categories?.[e.name] || (e.custom ? 'Dodane ręcznie' : 'Inne')
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(e)
      }

      const categoryOrder = [
        'Sosy', 'Marynaty mięsne', 'Bazy i gotowe',
        'Makarony', 'Mięso', 'Ryby', 'Warzywa', 'Azjatyckie',
        'Przyprawy', 'Inne', 'Opakowania', 'Dodane ręcznie',
      ]
      const sortedCats = categoryOrder.filter(c => grouped[c]?.length)
      // Add any remaining categories
      for (const c of Object.keys(grouped)) {
        if (!sortedCats.includes(c)) sortedCats.push(c)
      }

      const catSections = sortedCats.map(cat => `
        <tr style="background: #f3f4f6;">
          <td colspan="3" style="padding: 10px 8px; font-weight: bold; font-size: 14px; border: 1px solid #e5e7eb;">${cat} (${grouped[cat].length})</td>
        </tr>
        ${grouped[cat].map(e => `
          <tr>
            <td style="padding: 6px 8px; border: 1px solid #e5e7eb;">${e.custom ? '✚ ' : ''}${e.name}</td>
            <td style="text-align: right; padding: 6px 8px; border: 1px solid #e5e7eb; font-weight: bold;">${e.quantity}</td>
            <td style="text-align: center; padding: 6px 8px; border: 1px solid #e5e7eb; color: #6b7280;">${e.unit}</td>
          </tr>
        `).join('')}
      `).join('')

      html = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px;">
          <h2 style="color: #4f46e5;">📊 Remanent — Stany Magazynowe</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px; color: #6b7280;">Data</td><td style="padding: 6px; font-weight: bold;">${data.date}</td></tr>
            <tr><td style="padding: 6px; color: #6b7280;">Spisał(a)</td><td style="padding: 6px; font-weight: bold;">${data.employee}</td></tr>
            <tr><td style="padding: 6px; color: #6b7280;">Pozycji</td><td style="padding: 6px; font-weight: bold;">${totalItems}</td></tr>
            <tr><td style="padding: 6px; color: #6b7280;">Szac. wartość</td><td style="padding: 6px; font-weight: bold;">${totalValue}</td></tr>
          </table>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #4f46e5; color: white;">
              <th style="text-align: left; padding: 8px; border: 1px solid #e5e7eb;">Produkt</th>
              <th style="text-align: right; padding: 8px; border: 1px solid #e5e7eb;">Ilość</th>
              <th style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">Jedn.</th>
            </tr>
            ${catSections}
          </table>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Wysłano automatycznie z KitchenOps</p>
        </div>
      `
    }

    let result: any = null
    // Skip email entirely for task/meal/star (too noisy — they go to Sheets only, weekly summary via Apps Script)
    const skipEmail = type === 'task' || type === 'meal' || type === 'star' || type === 'loss'

    if (!skipEmail && html) {
      const emailPayload: any = {
        from: 'KitchenOps <onboarding@resend.dev>',
        to,
        subject,
        html,
      }

      if (type === 'breakdown' && data.photo_data) {
        const m = String(data.photo_data).match(/^data:(image\/\w+);base64,(.+)$/)
        if (m) {
          const ext = m[1].split('/')[1] || 'jpg'
          emailPayload.attachments = [{
            filename: `awaria-${Date.now()}.${ext}`,
            content: m[2],
          }]
        }
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(emailPayload),
      })

      result = await res.json()
      console.log('>>> Resend status:', res.status, 'result:', JSON.stringify(result))
      emailOk = res.ok
      if (!res.ok) {
        console.error('Resend error:', result)
      }
    } else {
      emailOk = true // not applicable
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
        } else if (type === 'breakdown') {
          sheetsPayload.data = {
            created_at: data.created_at,
            location: data.location || '',
            reporter: data.reporter || '',
            breakdown_type: data.breakdown_type,
            priority: data.priority,
            description: data.description,
            has_photo: !!data.photo_data,
          }
          const jsonBody = JSON.stringify(sheetsPayload)
          const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(jsonBody)
          console.log('>>> Sending BREAKDOWN to Google Sheets')
          const sheetsRes = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
          console.log('>>> Breakdown sheets status:', sheetsRes.status)
          sheetsOk = sheetsRes.ok
        } else if (type === 'task') {
          sheetsPayload.data = {
            created_at: data.created_at,
            location: data.location || '',
            created_by: data.created_by || '',
            assigned_to: data.assigned_to || '',
            title: data.title || '',
            description: data.description || '',
            due_date: data.due_date || '',
            action: data.action || 'created', // created | completed | deleted
          }
          const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(JSON.stringify(sheetsPayload))
          const sheetsRes = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
          console.log('>>> Task sheets status:', sheetsRes.status)
          sheetsOk = sheetsRes.ok
        } else if (type === 'meal') {
          sheetsPayload.data = {
            created_at: data.created_at,
            location: data.location || '',
            worker: data.worker || '',
            meal_date: data.meal_date || '',
            menu_number: data.menu_number || '',
            menu_description: data.menu_description || '',
          }
          const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(JSON.stringify(sheetsPayload))
          const sheetsRes = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
          console.log('>>> Meal sheets status:', sheetsRes.status)
          sheetsOk = sheetsRes.ok
        } else if (type === 'star') {
          sheetsPayload.data = {
            created_at: data.created_at,
            location: data.location || '',
            given_by: data.given_by || '',
            given_to: data.given_to || '',
            reason: data.reason || '',
          }
          const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(JSON.stringify(sheetsPayload))
          const sheetsRes = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
          console.log('>>> Star sheets status:', sheetsRes.status)
          sheetsOk = sheetsRes.ok
        } else if (type === 'loss') {
          sheetsPayload.data = {
            created_at: data.created_at,
            location: data.location || '',
            reporter: data.reporter || '',
            product_name: data.product_name || '',
            product_category: data.product_category || '',
            quantity: data.quantity ?? '',
            unit: data.unit || '',
            reason: data.reason || '',
            estimated_value: data.estimated_value ?? '',
            description: data.description || '',
            fault_person_name: data.fault_person_name || '',
          }
          const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(JSON.stringify(sheetsPayload))
          const sheetsRes = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
          console.log('>>> Loss sheets status:', sheetsRes.status)
          sheetsOk = sheetsRes.ok
        } else if (type === 'remanent') {
          sheetsPayload.data = {
            date: data.date,
            employee: data.employee || '',
            total_items: data.entries?.length || 0,
            entries: (data.entries || []).map((e: any) => ({
              name: e.name,
              quantity: e.quantity,
              unit: e.unit,
              custom: e.custom || false,
            })),
          }
          const getUrl = sheetsUrl + '?payload=' + encodeURIComponent(JSON.stringify(sheetsPayload))
          const sheetsRes = await fetch(getUrl, { method: 'GET', redirect: 'follow' })
          console.log('>>> Remanent sheets status:', sheetsRes.status)
          sheetsOk = sheetsRes.ok
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
