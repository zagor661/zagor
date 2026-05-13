import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

export async function POST(req: Request) {
  try {
    const { message, locationId } = await req.json()

    if (!message || !locationId) {
      return NextResponse.json({ error: 'Missing message or locationId' }, { status: 400 })
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI nie skonfigurowany — dodaj OPENAI_API_KEY w Vercel' }, { status: 500 })
    }

    // ─── Gather context data ───────────────────────────
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const monthStart = today.slice(0, 7) + '-01'
    const month3Ago = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
    const baseUrl = new URL(req.url).origin

    // ─── Parallel fetches ─────────────────────────────
    const [
      tasksRes,
      checklistsRes,
      tempsRes,
      mealsRes,
      profilesRes,
      deductionsRes,
      invoicesRes,
      invoiceItemsRes,
    ] = await Promise.all([
      supabase.from('worker_tasks').select('title, assigned_to_name, is_completed, created_at').eq('location_id', locationId).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20),
      supabase.from('checklist_logs').select('shift, completed_by_name, created_at').eq('location_id', locationId).gte('created_at', today),
      supabase.from('temperature_logs').select('device_name, temperature, recorded_by_name, created_at').eq('location_id', locationId).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20),
      supabase.from('worker_meals').select('worker_name, menu_description, meal_date').eq('location_id', locationId).gte('meal_date', monthStart),
      supabase.from('profiles').select('full_name, role, is_active, hourly_rate, contract_type').eq('is_active', true),
      supabase.from('meal_deductions').select('ingredient_name, quantity_kg').eq('location_id', locationId).gte('created_at', weekAgo),
      supabase.from('invoices').select('supplier_name, invoice_date, net_total, gross_total, status').eq('location_id', locationId).gte('invoice_date', month3Ago).order('invoice_date', { ascending: false }).limit(30),
      supabase.from('invoice_items').select('item_name, quantity, unit, unit_price, net_amount, price_per_kg_invoice, foodcost_price_per_kg, price_diff_pct, price_alert').limit(200),
    ])

    const tasks = tasksRes.data || []
    const checklists = checklistsRes.data || []
    const temps = tempsRes.data || []
    const meals = mealsRes.data || []
    const profiles = profilesRes.data || []
    const deductions = deductionsRes.data || []
    const invoices = invoicesRes.data || []
    const invoiceItems = invoiceItemsRes.data || []

    // ─── GoPOS: sales + work times ────────────────────
    let salesData = 'Brak danych GoPOS'
    let salesByItem: any[] = []
    try {
      const salesRes = await fetch(`${baseUrl}/api/gopos?action=sales_by_item&date_start=${weekAgo}&date_end=${today}`)
      if (salesRes.ok) {
        const sJson = await salesRes.json()
        salesByItem = sJson.data?.items || []
        if (salesByItem.length > 0) {
          const sorted = [...salesByItem].sort((a: any, b: any) => (b.quantity || 0) - (a.quantity || 0))
          salesData = 'Sprzedaz per produkt (ostatnie 7 dni):\n' +
            sorted.map((it: any) => {
              const recipe = DEFAULT_RECIPES.find(r => r.name === it.name)
              let fcInfo = ''
              if (recipe) {
                const cost = recipe.lines.reduce((s: number, l) => s + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)
                const fc = recipe.sellingPrice > 0 ? (cost / recipe.sellingPrice) * 100 : 0
                fcInfo = ` | koszt: ${cost.toFixed(2)} zl | FC: ${fc.toFixed(1)}%`
              }
              return `- ${it.name}: ${it.quantity || 0} szt, ${Math.round(it.revenue || 0)} zl${fcInfo}`
            }).join('\n')

          // Total FC
          let totalCost = 0, totalRevenue = 0
          for (const item of salesByItem) {
            const recipe = DEFAULT_RECIPES.find(r => r.name === item.name)
            if (recipe) {
              const portionCost = recipe.lines.reduce((s: number, l) => s + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)
              totalCost += portionCost * (item.quantity || 0)
              totalRevenue += (item.revenue || 0)
            }
          }
          if (totalRevenue > 0) {
            salesData += `\n\nCALKOWITY Food Cost: ${Math.round(totalCost)} zl koszt / ${Math.round(totalRevenue)} zl przychod = ${(totalCost / totalRevenue * 100).toFixed(1)}%`
          }
        }
      }
    } catch {}

    // Work times from GoPOS
    let workTimesData = 'Brak danych godzin pracy'
    try {
      const wtRes = await fetch(`${baseUrl}/api/gopos?action=work_times_all&date_start=${monthStart}&date_end=${today}`)
      if (wtRes.ok) {
        const wtJson = await wtRes.json()
        const wts = wtJson.data || []
        if (wts.length > 0) {
          const byEmployee: Record<string, number> = {}
          for (const wt of wts) {
            const name = wt.employee_name || wt.employee?.name || `${wt.employee?.first_name || ''} ${wt.employee?.last_name || ''}`.trim()
            if (name && wt.duration) {
              byEmployee[name] = (byEmployee[name] || 0) + wt.duration / 3600
            }
          }
          const totalHours = Object.values(byEmployee).reduce((s, h) => s + h, 0)
          workTimesData = `Godziny pracy (ten miesiac):\n` +
            Object.entries(byEmployee).map(([name, hours]) => {
              const profile = profiles.find(p => p.full_name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.full_name.toLowerCase()))
              const rate = profile?.hourly_rate || 0
              const cost = hours * rate
              return `- ${name}: ${hours.toFixed(1)}h${rate ? ` × ${rate} zl/h = ${Math.round(cost)} zl` : ''}`
            }).join('\n') +
            `\nRazem: ${totalHours.toFixed(1)}h`
        }
      }
    } catch {}

    // ─── Recipes context ──────────────────────────────
    const recipesContext = DEFAULT_RECIPES.map(r => {
      const cost = r.lines.reduce((s, l) => s + l.pricePerKg * l.quantity, 0) + (r.packagingCost || 0)
      const fc = r.sellingPrice > 0 ? (cost / r.sellingPrice) * 100 : 0
      const ingredients = r.lines.map(l => `${l.productName}: ${Math.round(l.quantity * 1000)}g × ${l.pricePerKg.toFixed(2)} zl/kg = ${(l.pricePerKg * l.quantity).toFixed(2)} zl`).join('; ')
      return `${r.name} — cena: ${r.sellingPrice} zl, koszt: ${cost.toFixed(2)} zl, marza: ${(r.sellingPrice - cost).toFixed(2)} zl, FC: ${fc.toFixed(1)}% | Skladniki: ${ingredients}`
    }).join('\n')

    // ─── Deductions summary ───────────────────────────
    const deductionSummary = deductions.length > 0
      ? deductions.reduce((acc: Record<string, number>, d) => {
          acc[d.ingredient_name] = (acc[d.ingredient_name] || 0) + d.quantity_kg
          return acc
        }, {} as Record<string, number>)
      : null

    // ─── Invoices context ─────────────────────────────
    const invoicesSummary = invoices.length > 0
      ? (() => {
          const bySupplier: Record<string, { total: number; count: number }> = {}
          for (const inv of invoices) {
            const key = inv.supplier_name || 'Nieznany'
            if (!bySupplier[key]) bySupplier[key] = { total: 0, count: 0 }
            bySupplier[key].total += inv.net_total || 0
            bySupplier[key].count++
          }
          const totalNet = invoices.reduce((s, i) => s + (i.net_total || 0), 0)
          return `Faktury zakupowe (ostatnie 90 dni): ${invoices.length} faktur, lacznie ${Math.round(totalNet)} zl netto\n` +
            `Dostawcy: ${Object.entries(bySupplier).map(([name, s]) => `${name}: ${Math.round(s.total)} zl (${s.count} fv)`).join(', ')}`
        })()
      : 'Brak faktur w systemie'

    // Price alerts
    const priceAlerts = invoiceItems.filter(i => i.price_alert === 'higher' && (i.price_diff_pct || 0) > 10)
    const alertsContext = priceAlerts.length > 0
      ? `Alerty cenowe (cena na fakturze wyzsza niz w recepturze >10%):\n` +
        priceAlerts.slice(0, 10).map(a => `- ${a.item_name}: receptura ${a.foodcost_price_per_kg?.toFixed(2)} zl/kg vs faktura ${a.price_per_kg_invoice?.toFixed(2)} zl/kg (+${a.price_diff_pct?.toFixed(0)}%)`).join('\n')
      : 'Brak alertow cenowych'

    // ─── Meals summary ────────────────────────────────
    const mealsByWorker: Record<string, number> = {}
    meals.forEach(m => { mealsByWorker[m.worker_name] = (mealsByWorker[m.worker_name] || 0) + 1 })
    const mealsContext = meals.length > 0
      ? `Posilki pracownicze (ten miesiac): ${meals.length} lacznie\nPer pracownik: ${Object.entries(mealsByWorker).map(([n, c]) => `${n}: ${c}`).join(', ')}`
      : 'Brak posilkow ten miesiac'

    // ─── Build full context ───────────────────────────
    const context = `
DANE RESTAURACJI WOKI WOKI (aktualne, ${today}):

═══ SPRZEDAZ (GoPOS) ═══
${salesData}

═══ RECEPTURY (${DEFAULT_RECIPES.length} dan) ═══
${recipesContext}

═══ GODZINY PRACY (GoPOS) ═══
${workTimesData}

═══ ZESPOL ═══
${profiles.map(p => `${p.full_name} (${p.role}${p.hourly_rate ? `, ${p.hourly_rate} zl/h` : ''}${p.contract_type ? `, ${p.contract_type}` : ''})`).join(', ') || 'Brak danych'}

═══ ZADANIA (ostatni tydzien) ═══
${tasks.map(t => `- ${t.title} [${t.is_completed ? 'DONE' : 'TODO'}] → ${t.assigned_to_name || '?'}`).join('\n') || 'Brak zadan'}

═══ CHECKLISTA DZIS ═══
${checklists.length ? `Wykonane: ${checklists.length} checkow (${checklists.map(c => c.completed_by_name).join(', ')})` : 'Brak checkow dzis'}

═══ TEMPERATURY ═══
${temps.slice(0, 5).map(t => `${t.device_name}: ${t.temperature}°C (${t.recorded_by_name})`).join(', ') || 'Brak pomiarow'}

═══ POSILKI PRACOWNICZE ═══
${mealsContext}

═══ ZUZYCIE SKLADNIKOW Z POSILKOW (tydzien) ═══
${deductionSummary ? Object.entries(deductionSummary).map(([k, v]) => `${k}: ${Math.round(v as number * 1000)}g`).join(', ') : 'Brak'}

═══ FAKTURY ZAKUPOWE ═══
${invoicesSummary}

═══ ALERTY CENOWE ═══
${alertsContext}
`.trim()

    // ─── Call OpenAI ───────────────────────────────────
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Jestes asystentem AI restauracji WOKI WOKI — Imbir i Ryz. Odpowiadasz KROTKO i KONKRETNIE po polsku.
Masz pelny dostep do danych: sprzedaz z GoPOS, receptury z food cost (skladniki, ceny, marze), godziny pracy, faktury zakupowe, zadania, checklisty, temperatury, posilki pracownicze, zespol.
Uzywaj danych ponizej do odpowiedzi. Jesli nie masz danych na dany temat, powiedz o tym.
Podawaj KONKRETNE liczby, procenty i kwoty. Nie zmyslaj danych.
Formatuj odpowiedz czytelnie. Uzywaj emoji do podkreslenia.
Jesli pytanie dotyczy receptury — podaj pelna liste skladnikow z gramatura i kosztami.
Jesli pytanie dotyczy sprzedazy — podaj ilości i kwoty.
Jesli pytanie dotyczy pracownikow — podaj godziny i koszty.

${context}`
          },
          { role: 'user', content: message }
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      return NextResponse.json({ error: `AI error: ${aiRes.status}` }, { status: 500 })
    }

    const aiData = await aiRes.json()
    const response = aiData.choices?.[0]?.message?.content || 'Brak odpowiedzi'

    return NextResponse.json({ response })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
