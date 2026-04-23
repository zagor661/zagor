import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Food Cost reference prices (imported inline to avoid client-side import issues)
const FOODCOST_REFERENCE: Record<string, number> = {}

// We'll load from the static file, but for server-side we need inline
// This will be populated from the DB or static list
import { FOODCOST_PRODUCTS } from '@/lib/foodcostProducts'

FOODCOST_PRODUCTS.forEach(p => {
  if (p.type === 'ingredient' && p.price_per_kg) {
    FOODCOST_REFERENCE[p.name.toLowerCase()] = p.price_per_kg
  }
})

// ─── Fuzzy match ingredient name to food cost ──────────────
function findFoodCostMatch(itemName: string): { name: string; price: number } | null {
  const normalized = itemName.toLowerCase().trim()

  // Direct match
  for (const [name, price] of Object.entries(FOODCOST_REFERENCE)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return { name, price }
    }
  }

  // Partial match — check if any word matches
  const words = normalized.split(/\s+/).filter(w => w.length > 3)
  for (const word of words) {
    for (const [name, price] of Object.entries(FOODCOST_REFERENCE)) {
      if (name.includes(word)) {
        return { name, price }
      }
    }
  }

  return null
}

// ─── Calculate price per kg from invoice item ──────────────
function calcPricePerKg(quantity: number, unit: string, netAmount: number): number | null {
  const u = unit.toLowerCase()
  if (u === 'kg') return netAmount / quantity
  if (u === 'g' || u === 'gr') return (netAmount / quantity) * 1000
  if (u === 'l' || u === 'litr') return netAmount / quantity // ~1kg per liter
  if (u === 'szt' || u === 'op') return null // Can't convert pieces to kg
  return null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File | null
    const locationId = formData.get('locationId') as string
    const uploadedBy = formData.get('uploadedBy') as string

    if (!imageFile) {
      return NextResponse.json({ error: 'Brak zdjecia faktury' }, { status: 400 })
    }

    // 1. Convert image to base64 for GPT Vision
    const bytes = await imageFile.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = imageFile.type || 'image/jpeg'

    // 2. Send to GPT-4 Vision for OCR
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      return NextResponse.json({ error: 'Brak OPENAI_API_KEY' }, { status: 500 })
    }

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Jestes systemem OCR do odczytu faktur z restauracji w Polsce. Wyciagnij WSZYSTKIE dane z faktury i zwroc je jako JSON.

Zwroc dokladnie taki format JSON (bez markdown, bez backtickow):
{
  "invoice_number": "numer faktury",
  "supplier_name": "nazwa dostawcy",
  "supplier_nip": "NIP dostawcy",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD lub null",
  "payment_method": "przelew/gotowka/karta",
  "net_total": 0.00,
  "vat_total": 0.00,
  "gross_total": 0.00,
  "items": [
    {
      "name": "nazwa produktu",
      "quantity": 0.000,
      "unit": "kg/szt/l/op",
      "unit_price": 0.00,
      "net_amount": 0.00,
      "vat_rate": 23,
      "vat_amount": 0.00,
      "gross_amount": 0.00
    }
  ]
}

Zasady:
- Jesli nie mozesz odczytac wartosci, wstaw null
- Ceny zawsze jako liczby (nie stringi)
- Daty w formacie YYYY-MM-DD
- Jednostki: kg, szt, l, op (opakowanie), g
- Zwroc CZYSTY JSON bez zadnego formatowania`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Odczytaj te fakture i zwroc dane jako JSON:' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1,
      }),
    })

    if (!gptResponse.ok) {
      const err = await gptResponse.text()
      return NextResponse.json({ error: 'GPT Vision error: ' + err }, { status: 500 })
    }

    const gptData = await gptResponse.json()
    const content = gptData.choices?.[0]?.message?.content || ''

    // Parse JSON from GPT response (handle potential markdown wrapping)
    let invoiceData: any
    try {
      const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      invoiceData = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({
        error: 'Nie udalo sie odczytac faktury — sprobuj lepsze zdjecie',
        raw: content
      }, { status: 422 })
    }

    // 3. Save image to Supabase Storage
    let imageUrl: string | null = null
    const fileName = `invoices/${Date.now()}_${imageFile.name}`
    const { error: storageErr } = await getSupabase().storage
      .from('worker-files')
      .upload(fileName, Buffer.from(bytes), {
        contentType: mimeType,
        upsert: true
      })

    if (!storageErr) {
      const { data: urlData } = getSupabase().storage.from('worker-files').getPublicUrl(fileName)
      imageUrl = urlData.publicUrl
    }

    // 4. Upload to Google Drive (if configured)
    let gdriveFileId: string | null = null
    let gdriveUrl: string | null = null

    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      try {
        const driveResult = await uploadToGoogleDrive(
          Buffer.from(bytes),
          `FV_${invoiceData.supplier_name || 'unknown'}_${invoiceData.invoice_date || 'nodate'}.${mimeType.split('/')[1] || 'jpg'}`,
          mimeType
        )
        gdriveFileId = driveResult.id
        gdriveUrl = driveResult.url
      } catch (e: any) {
        console.error('Google Drive upload failed:', e.message)
      }
    }

    // 5. Save invoice to DB
    const { data: invoice, error: invErr } = await getSupabase().from('invoices').insert({
      location_id: locationId,
      invoice_number: invoiceData.invoice_number,
      supplier_name: invoiceData.supplier_name || 'Nieznany',
      invoice_date: invoiceData.invoice_date || new Date().toISOString().split('T')[0],
      due_date: invoiceData.due_date,
      net_total: invoiceData.net_total || 0,
      vat_total: invoiceData.vat_total || 0,
      gross_total: invoiceData.gross_total || 0,
      payment_method: invoiceData.payment_method,
      image_url: imageUrl,
      gdrive_file_id: gdriveFileId,
      gdrive_url: gdriveUrl,
      ocr_raw: invoiceData,
      uploaded_by: uploadedBy,
      status: 'new',
    }).select().single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Blad zapisu faktury: ' + invErr?.message }, { status: 500 })
    }

    // 6. Save items + compare with food cost
    const items = invoiceData.items || []
    const savedItems: any[] = []

    for (const item of items) {
      const match = findFoodCostMatch(item.name || '')
      const pricePerKg = item.quantity && item.unit
        ? calcPricePerKg(item.quantity, item.unit, item.net_amount || item.unit_price * item.quantity)
        : null

      let priceDiffPct: number | null = null
      let priceAlert: string = 'no_match'

      if (match && pricePerKg) {
        priceDiffPct = ((pricePerKg - match.price) / match.price) * 100
        if (Math.abs(priceDiffPct) < 5) {
          priceAlert = 'match'
        } else if (priceDiffPct > 0) {
          priceAlert = 'higher'
        } else {
          priceAlert = 'lower'
        }
      } else if (match && !pricePerKg) {
        priceAlert = 'no_convert'
      }

      const { data: savedItem } = await getSupabase().from('invoice_items').insert({
        invoice_id: invoice.id,
        item_name: item.name,
        item_name_normalized: (item.name || '').toLowerCase().trim(),
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        net_amount: item.net_amount,
        vat_rate: item.vat_rate,
        vat_amount: item.vat_amount,
        gross_amount: item.gross_amount,
        foodcost_match: match?.name || null,
        foodcost_price_per_kg: match?.price || null,
        price_per_kg_invoice: pricePerKg,
        price_diff_pct: priceDiffPct ? Math.round(priceDiffPct * 100) / 100 : null,
        price_alert: priceAlert,
      }).select().single()

      if (savedItem) savedItems.push(savedItem)
    }

    // 7. Return everything
    return NextResponse.json({
      success: true,
      invoice: {
        ...invoice,
        items: savedItems,
      },
      alerts: {
        higher: savedItems.filter(i => i.price_alert === 'higher').length,
        lower: savedItems.filter(i => i.price_alert === 'lower').length,
        match: savedItems.filter(i => i.price_alert === 'match').length,
        no_match: savedItems.filter(i => i.price_alert === 'no_match').length,
      },
      gdrive: gdriveUrl ? { url: gdriveUrl, id: gdriveFileId } : null,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── Google Drive Upload ───────────────────────────────────
async function uploadToGoogleDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ id: string; url: string }> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
  const key = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  const folderId = process.env.GOOGLE_DRIVE_INVOICES_FOLDER_ID

  // Create JWT for Google API
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claims = Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const crypto = require('crypto')
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(key, 'base64url')

  const jwt = `${header}.${claims}.${signature}`

  // Get access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token

  if (!accessToken) throw new Error('Google auth failed')

  // Upload file (multipart)
  const boundary = 'invoice_upload_boundary'
  const metadata = JSON.stringify({
    name: fileName,
    mimeType,
    ...(folderId ? { parents: [folderId] } : {}),
  })

  const multipart =
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${fileBuffer.toString('base64')}\r\n` +
    `--${boundary}--`

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  })

  const uploadData = await uploadRes.json()
  if (!uploadData.id) throw new Error('Drive upload failed: ' + JSON.stringify(uploadData))

  return {
    id: uploadData.id,
    url: uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`,
  }
}
