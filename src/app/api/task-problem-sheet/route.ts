import { NextRequest, NextResponse } from 'next/server'

// Google Sheets API — append row to "Problemy" sheet
// Requires: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in .env

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

  if (!email || !key) throw new Error('Google credentials not configured')

  // Create JWT
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const toBase64Url = (obj: any) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const unsignedToken = `${toBase64Url(header)}.${toBase64Url(claim)}`

  // Sign with RSA-SHA256
  const crypto = await import('crypto')
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(unsignedToken)
  const signature = sign.sign(key, 'base64url')

  const jwt = `${unsignedToken}.${signature}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error('Failed to get access token')
  return tokenData.access_token
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      date, location, task_title, task_description,
      assigned_to, created_by, problem_description, chat_log, due_date,
    } = body

    const sheetId = process.env.GOOGLE_SHEETS_ID
    if (!sheetId) {
      console.log('GOOGLE_SHEETS_ID not set — skipping Sheets sync')
      return NextResponse.json({ ok: true, skipped: true })
    }

    const accessToken = await getAccessToken()

    // Append row: Data | Lokalizacja | Zadanie | Opis | Przypisane do | Utworzył | Problem | Chat | Termin
    const row = [
      new Date(date).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
      location,
      task_title,
      task_description,
      assigned_to,
      created_by,
      problem_description,
      chat_log,
      due_date,
    ]

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Problemy!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      }
    )

    if (!appendRes.ok) {
      const errText = await appendRes.text()
      console.error('Sheets API error:', errText)
      return NextResponse.json({ ok: false, error: errText }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('Task problem sheet error:', e.message)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
