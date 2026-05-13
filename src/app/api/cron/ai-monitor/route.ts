// ============================================================
// GET /api/cron/ai-monitor
// AI Monitor — wykrywa anomalie i generuje alerty
// Uruchamiany 3x dziennie: 10:00, 12:00, 16:00 CET
//
// Analizuje:
// 1. Nowe faktury z Fakturowni → zmiany cen składników
// 2. Wpływ zmian cen na food cost receptur
// 3. Trendy sprzedaży z GoPOS (co idzie / co nie idzie)
// 4. Anomalie kosztowe (praca, zakupy)
// 5. Generuje raport dzienny (przy ostatnim uruchomieniu)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'
import { sendPushToLocation, type PushSubscription, type PushPayload } from '@/lib/webpush'

export const runtime = 'nodejs'
export const maxDuration = 55

function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@kitchenops.app'
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  const baseUrl = new URL(req.url).origin
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
  const monthStart = today.slice(0, 7) + '-01'

  const results: string[] = []
  const newAlerts: { locationId: string; type: string; severity: string; title: string; description: string; data: any }[] = []

  // ─── Get all locations ─────────────────────────────
  const { data: locations } = await supabase.from('locations').select('id, name')
  if (!locations || locations.length === 0) {
    return NextResponse.json({ ok: true, message: 'No locations' })
  }

  for (const location of locations) {
    const locId = location.id
    const locName = location.name || 'Restauracja'

    // ─── 1. FAKTUROWNIA — price analysis ─────────────
    try {
      // Fetch ALL invoices from Fakturownia (paginate until empty)
      let allInvoices: any[] = []
      let page = 1
      while (page <= 20) { // safety limit
        const fkRes = await fetch(`${baseUrl}/api/fakturownia?action=list&period=all&page=${page}`)
        if (!fkRes.ok) break
        const fkJson = await fkRes.json()
        const pageData = fkJson.data || []
        if (pageData.length === 0) break
        allInvoices = allInvoices.concat(pageData)
        if (pageData.length < 25) break // last page
        page++
      }

      if (allInvoices.length > 0) {
        // Build price history per product
        const priceHistory: Record<string, { date: string; price: number; qty: number; unit: string; supplier: string; invoiceNum: string }[]> = {}

        for (const inv of allInvoices) {
          const supplier = inv.seller_name || inv.buyer_name || ''
          const date = inv.issue_date || ''
          const invNum = inv.number || ''
          const positions = inv.positions || inv.invoice_positions || []
          for (const pos of positions) {
            const name = (pos.name || '').trim()
            if (!name) continue
            const price = parseFloat(pos.price_net) || 0
            const qty = parseFloat(pos.quantity) || 0
            const unit = pos.quantity_unit || 'szt'
            if (!priceHistory[name]) priceHistory[name] = []
            priceHistory[name].push({ date, price, qty, unit, supplier, invoiceNum: invNum })
          }
        }

        // Sort entries by date
        for (const name of Object.keys(priceHistory)) {
          priceHistory[name].sort((a, b) => a.date.localeCompare(b.date))
        }

        // Check for recent price changes (last 7 days vs before)
        for (const [productName, entries] of Object.entries(priceHistory)) {
          if (entries.length < 2) continue

          const recentEntries = entries.filter(e => e.date >= weekAgo)
          const olderEntries = entries.filter(e => e.date < weekAgo && e.date >= twoWeeksAgo)

          if (recentEntries.length === 0 || olderEntries.length === 0) continue

          const recentAvg = recentEntries.reduce((s, e) => s + e.price, 0) / recentEntries.length
          const olderAvg = olderEntries.reduce((s, e) => s + e.price, 0) / olderEntries.length

          if (olderAvg === 0) continue
          const changePct = ((recentAvg - olderAvg) / olderAvg) * 100

          // Alert if price changed >10%
          if (Math.abs(changePct) > 10) {
            const isIncrease = changePct > 0
            const severity = Math.abs(changePct) > 25 ? 'critical' : 'warning'

            // Check if we already alerted this today
            const { data: existing } = await supabase
              .from('ai_alerts')
              .select('id')
              .eq('location_id', locId)
              .eq('type', isIncrease ? 'price_increase' : 'price_decrease')
              .gte('created_at', today + 'T00:00:00')
              .ilike('title', `%${productName.slice(0, 20)}%`)
              .limit(1)

            if (existing && existing.length > 0) continue

            // Check FC impact
            let fcImpact = ''
            for (const recipe of DEFAULT_RECIPES) {
              const matchingLine = recipe.lines.find(l =>
                l.productName.toLowerCase().includes(productName.toLowerCase()) ||
                productName.toLowerCase().includes(l.productName.toLowerCase())
              )
              if (matchingLine) {
                const oldCost = matchingLine.pricePerKg * matchingLine.quantity
                const newCostPerKg = recentAvg // price per unit from invoice
                const costDiff = (newCostPerKg - matchingLine.pricePerKg) * matchingLine.quantity
                if (Math.abs(costDiff) > 0.1) {
                  const totalCost = recipe.lines.reduce((s, l) => s + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)
                  const newTotal = totalCost + costDiff
                  const oldFc = recipe.sellingPrice > 0 ? (totalCost / recipe.sellingPrice * 100) : 0
                  const newFc = recipe.sellingPrice > 0 ? (newTotal / recipe.sellingPrice * 100) : 0
                  fcImpact += `\n→ ${recipe.name}: FC ${oldFc.toFixed(1)}% → ${newFc.toFixed(1)}% (${costDiff > 0 ? '+' : ''}${costDiff.toFixed(2)} zł/porcja)`
                }
              }
            }

            const latestEntry = recentEntries[recentEntries.length - 1]
            newAlerts.push({
              locationId: locId,
              type: isIncrease ? 'price_increase' : 'price_decrease',
              severity,
              title: `${isIncrease ? '📈' : '📉'} ${productName}: ${changePct > 0 ? '+' : ''}${changePct.toFixed(0)}%`,
              description: `Cena ${productName} ${isIncrease ? 'wzrosła' : 'spadła'} z ${olderAvg.toFixed(2)} na ${recentAvg.toFixed(2)} zł/${latestEntry.unit} (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%). Dostawca: ${latestEntry.supplier}. Faktura: ${latestEntry.invoiceNum}.${fcImpact}`,
              data: {
                product: productName,
                oldPrice: olderAvg,
                newPrice: recentAvg,
                changePct: Math.round(changePct),
                unit: latestEntry.unit,
                supplier: latestEntry.supplier,
                fcImpact: fcImpact || null,
              },
            })
          }
        }

        results.push(`fakturownia: ${allInvoices.length} invoices analyzed, ${Object.keys(priceHistory).length} products`)
      }
    } catch (err: any) {
      results.push(`fakturownia-error: ${err.message}`)
    }

    // ─── 2. SALES TRENDS — GoPOS ─────────────────────
    try {
      // Current week vs previous week
      const [salesThisWeek, salesLastWeek] = await Promise.all([
        fetch(`${baseUrl}/api/gopos?action=sales_by_item&date_start=${weekAgo}&date_end=${today}`).then(r => r.ok ? r.json() : { data: { items: [] } }),
        fetch(`${baseUrl}/api/gopos?action=sales_by_item&date_start=${twoWeeksAgo}&date_end=${weekAgo}`).then(r => r.ok ? r.json() : { data: { items: [] } }),
      ])

      const thisItems = salesThisWeek.data?.items || []
      const lastItems = salesLastWeek.data?.items || []

      // Compare product sales
      const lastWeekMap: Record<string, { qty: number; revenue: number }> = {}
      for (const item of lastItems) {
        lastWeekMap[item.name] = { qty: item.quantity || 0, revenue: item.revenue || 0 }
      }

      for (const item of thisItems) {
        const name = item.name
        const thisQty = item.quantity || 0
        const thisRev = item.revenue || 0
        const last = lastWeekMap[name]

        if (!last || last.qty === 0) continue

        const qtyChange = ((thisQty - last.qty) / last.qty) * 100

        // Alert on significant drops (>30%) or spikes (>50%)
        if (qtyChange < -30 && thisQty > 0) {
          // Check if already alerted today
          const { data: existing } = await supabase
            .from('ai_alerts')
            .select('id')
            .eq('location_id', locId)
            .eq('type', 'sales_drop')
            .gte('created_at', today + 'T00:00:00')
            .ilike('title', `%${name.slice(0, 20)}%`)
            .limit(1)
          if (existing && existing.length > 0) continue

          newAlerts.push({
            locationId: locId,
            type: 'sales_drop',
            severity: qtyChange < -50 ? 'critical' : 'warning',
            title: `🔻 ${name}: sprzedaż ${qtyChange.toFixed(0)}%`,
            description: `Sprzedaż ${name} spadła z ${last.qty} szt (tydzień temu) do ${thisQty} szt (ten tydzień). Przychód: ${Math.round(last.revenue)} → ${Math.round(thisRev)} zł.`,
            data: { product: name, thisWeek: thisQty, lastWeek: last.qty, changePct: Math.round(qtyChange) },
          })
        } else if (qtyChange > 50) {
          const { data: existing } = await supabase
            .from('ai_alerts')
            .select('id')
            .eq('location_id', locId)
            .eq('type', 'sales_spike')
            .gte('created_at', today + 'T00:00:00')
            .ilike('title', `%${name.slice(0, 20)}%`)
            .limit(1)
          if (existing && existing.length > 0) continue

          newAlerts.push({
            locationId: locId,
            type: 'sales_spike',
            severity: 'info',
            title: `🚀 ${name}: sprzedaż +${qtyChange.toFixed(0)}%`,
            description: `Sprzedaż ${name} wzrosła z ${last.qty} szt do ${thisQty} szt (+${qtyChange.toFixed(0)}%). Przychód: ${Math.round(last.revenue)} → ${Math.round(thisRev)} zł.`,
            data: { product: name, thisWeek: thisQty, lastWeek: last.qty, changePct: Math.round(qtyChange) },
          })
        }
      }

      // Check for products that were selling last week but stopped completely
      for (const [name, last] of Object.entries(lastWeekMap)) {
        if (last.qty >= 5 && !thisItems.find((i: any) => i.name === name)) {
          const { data: existing } = await supabase
            .from('ai_alerts')
            .select('id')
            .eq('location_id', locId)
            .eq('type', 'sales_drop')
            .gte('created_at', today + 'T00:00:00')
            .ilike('title', `%${name.slice(0, 20)}%`)
            .limit(1)
          if (existing && existing.length > 0) continue

          newAlerts.push({
            locationId: locId,
            type: 'sales_drop',
            severity: 'critical',
            title: `⛔ ${name}: zero sprzedaży`,
            description: `${name} sprzedawał się ${last.qty} szt w zeszłym tygodniu, ale ten tydzień — 0. Sprawdź dostępność!`,
            data: { product: name, thisWeek: 0, lastWeek: last.qty, changePct: -100 },
          })
        }
      }

      results.push(`sales: ${thisItems.length} products this week, ${lastItems.length} last week`)
    } catch (err: any) {
      results.push(`sales-error: ${err.message}`)
    }

    // ─── 3. FOOD COST CHECK ──────────────────────────
    try {
      const salesRes = await fetch(`${baseUrl}/api/gopos?action=sales_by_item&date_start=${weekAgo}&date_end=${today}`)
      if (salesRes.ok) {
        const sJson = await salesRes.json()
        const items = sJson.data?.items || []

        let totalCost = 0, totalRevenue = 0
        const highFcDishes: { name: string; fc: number; cost: number; price: number }[] = []

        for (const item of items) {
          const recipe = DEFAULT_RECIPES.find(r => r.name === item.name)
          if (!recipe) continue
          const portionCost = recipe.lines.reduce((s, l) => s + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)
          const qty = item.quantity || 0
          totalCost += portionCost * qty
          totalRevenue += (item.revenue || 0)

          const fc = recipe.sellingPrice > 0 ? (portionCost / recipe.sellingPrice) * 100 : 0
          if (fc > 35) {
            highFcDishes.push({ name: recipe.name, fc, cost: portionCost, price: recipe.sellingPrice })
          }
        }

        const overallFc = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0

        // Alert if overall FC > 30%
        if (overallFc > 30) {
          const { data: existing } = await supabase
            .from('ai_alerts')
            .select('id')
            .eq('location_id', locId)
            .eq('type', 'fc_warning')
            .gte('created_at', today + 'T00:00:00')
            .limit(1)
          if (!existing || existing.length === 0) {
            const highFcList = highFcDishes
              .sort((a, b) => b.fc - a.fc)
              .slice(0, 5)
              .map(d => `${d.name}: FC ${d.fc.toFixed(1)}% (koszt ${d.cost.toFixed(2)} / cena ${d.price} zł)`)
              .join('\n')

            newAlerts.push({
              locationId: locId,
              type: 'fc_warning',
              severity: overallFc > 35 ? 'critical' : 'warning',
              title: `⚠️ Food Cost ${overallFc.toFixed(1)}% — powyżej normy`,
              description: `Ogólny FC za ostatni tydzień: ${overallFc.toFixed(1)}% (cel: <30%).\nKoszt: ${Math.round(totalCost)} zł / Przychód: ${Math.round(totalRevenue)} zł.\n\nNajwyższy FC:\n${highFcList}`,
              data: { overallFc: Math.round(overallFc * 10) / 10, totalCost: Math.round(totalCost), totalRevenue: Math.round(totalRevenue), highFcDishes },
            })
          }
        }

        results.push(`fc: ${overallFc.toFixed(1)}%, ${highFcDishes.length} dishes >35%`)
      }
    } catch (err: any) {
      results.push(`fc-error: ${err.message}`)
    }

    // ─── 4. LABOR COST CHECK ─────────────────────────
    try {
      const [wtRes, salesRes, profilesRes] = await Promise.all([
        fetch(`${baseUrl}/api/gopos?action=work_times_all&date_start=${monthStart}&date_end=${today}`).then(r => r.ok ? r.json() : { data: [] }),
        fetch(`${baseUrl}/api/gopos?action=sales&date_start=${monthStart}&date_end=${today}`).then(r => r.ok ? r.json() : { data: { summary: {} } }),
        supabase.from('profiles').select('full_name, hourly_rate').eq('is_active', true),
      ])

      const wts = wtRes.data || []
      const monthRevenue = salesRes.data?.summary?.total_revenue || salesRes.data?.summary?.net_total || 0
      const profiles = profilesRes.data || []

      if (wts.length > 0 && monthRevenue > 0) {
        let totalLaborCost = 0
        for (const wt of wts) {
          const name = wt.employee_name || wt.employee?.name || `${wt.employee?.first_name || ''} ${wt.employee?.last_name || ''}`.trim()
          const hours = (wt.duration || 0) / 3600
          const profile = profiles.find((p: any) => p.full_name?.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.full_name?.toLowerCase()))
          const rate = profile?.hourly_rate || 0
          totalLaborCost += hours * rate
        }

        const laborPct = (totalLaborCost / monthRevenue) * 100

        if (laborPct > 35) {
          const { data: existing } = await supabase
            .from('ai_alerts')
            .select('id')
            .eq('location_id', locId)
            .eq('type', 'labor_high')
            .gte('created_at', today + 'T00:00:00')
            .limit(1)
          if (!existing || existing.length === 0) {
            newAlerts.push({
              locationId: locId,
              type: 'labor_high',
              severity: laborPct > 45 ? 'critical' : 'warning',
              title: `👷 Koszty pracy ${laborPct.toFixed(1)}% przychodu`,
              description: `Koszt pracy ten miesiąc: ${Math.round(totalLaborCost)} zł / przychód: ${Math.round(monthRevenue)} zł = ${laborPct.toFixed(1)}%. Cel: <35%.`,
              data: { laborCost: Math.round(totalLaborCost), revenue: Math.round(monthRevenue), laborPct: Math.round(laborPct * 10) / 10 },
            })
          }
        }

        results.push(`labor: ${laborPct.toFixed(1)}% of revenue`)
      }
    } catch (err: any) {
      results.push(`labor-error: ${err.message}`)
    }

    // ─── 5. DAILY SUMMARY (at 16:00 run) ─────────────
    try {
      const polandNow = new Date(new Date().getTime() + 2 * 60 * 60000) // rough UTC+2
      const hour = polandNow.getUTCHours()

      if (hour >= 14 && hour <= 16 && OPENAI_API_KEY) {
        // Check if we already sent today's summary
        const { data: existing } = await supabase
          .from('ai_alerts')
          .select('id')
          .eq('location_id', locId)
          .eq('type', 'daily_summary')
          .gte('created_at', today + 'T00:00:00')
          .limit(1)

        if (!existing || existing.length === 0) {
          // Get today's alerts for summary
          const todayAlerts = newAlerts.filter(a => a.locationId === locId)
          const { data: olderAlerts } = await supabase
            .from('ai_alerts')
            .select('type, title, severity')
            .eq('location_id', locId)
            .gte('created_at', today + 'T00:00:00')
            .limit(20)

          const allTodayAlerts = [...todayAlerts.map(a => ({ type: a.type, title: a.title, severity: a.severity })), ...(olderAlerts || [])]

          // Generate AI summary
          const summaryPrompt = `Podsumuj stan restauracji ${locName} na dziś (${today}).
Alerty z dzisiejszego monitoringu:
${allTodayAlerts.length > 0 ? allTodayAlerts.map(a => `[${a.severity}] ${a.title}`).join('\n') : 'Brak alertów — wszystko w normie.'}

Napisz KROTKI raport (max 200 słów) po polsku. Skup się na tym co wymaga uwagi. Użyj emoji.`

          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: 'Jesteś asystentem AI restauracji. Piszesz krótkie, konkretne raporty po polsku.' },
                { role: 'user', content: summaryPrompt },
              ],
              max_tokens: 500,
              temperature: 0.3,
            }),
          })

          if (aiRes.ok) {
            const aiData = await aiRes.json()
            const summary = aiData.choices?.[0]?.message?.content || 'Brak podsumowania'

            newAlerts.push({
              locationId: locId,
              type: 'daily_summary',
              severity: allTodayAlerts.some(a => a.severity === 'critical') ? 'critical' : allTodayAlerts.some(a => a.severity === 'warning') ? 'warning' : 'info',
              title: `📊 Raport dzienny — ${today}`,
              description: summary,
              data: { alertCount: allTodayAlerts.length, date: today },
            })
          }

          results.push('daily-summary: generated')
        }
      }
    } catch (err: any) {
      results.push(`summary-error: ${err.message}`)
    }
  }

  // ─── Save all alerts to Supabase ───────────────────
  if (newAlerts.length > 0) {
    const alertRows = newAlerts.map(a => ({
      location_id: a.locationId,
      type: a.type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      data: a.data,
    }))

    const { error: insertError } = await supabase.from('ai_alerts').insert(alertRows)
    if (insertError) {
      results.push(`insert-error: ${insertError.message}`)
    } else {
      results.push(`alerts-saved: ${newAlerts.length}`)
    }

    // ─── Send push notifications for warnings/critical ──
    if (vapidPublicKey && vapidPrivateKey) {
      const criticalAlerts = newAlerts.filter(a => a.severity === 'warning' || a.severity === 'critical')

      // Group by location
      const byLocation: Record<string, typeof criticalAlerts> = {}
      for (const alert of criticalAlerts) {
        if (!byLocation[alert.locationId]) byLocation[alert.locationId] = []
        byLocation[alert.locationId].push(alert)
      }

      for (const [locId, alerts] of Object.entries(byLocation)) {
        // Get manager/owner subscriptions
        const { data: managerProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('location_id', locId)
          .in('role', ['manager', 'owner', 'admin'])
          .eq('is_active', true)

        if (!managerProfiles || managerProfiles.length === 0) continue

        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('location_id', locId)
          .in('profile_id', managerProfiles.map(p => p.id))

        if (!subs || subs.length === 0) continue

        // Send one push per critical alert (max 3), rest bundled
        const pushAlerts = alerts.slice(0, 3)
        for (const alert of pushAlerts) {
          const payload: PushPayload = {
            title: alert.title,
            body: alert.description.slice(0, 150),
            url: '/owner',
            tag: `ai-${alert.type}`,
          }

          const result = await sendPushToLocation(
            subs as PushSubscription[],
            payload,
            vapidPublicKey,
            vapidPrivateKey,
            vapidSubject
          )

          if (result.expired.length > 0) {
            await supabase.from('push_subscriptions').delete().in('endpoint', result.expired)
          }
        }

        // If more than 3, send a summary push
        if (alerts.length > 3) {
          await sendPushToLocation(
            subs as PushSubscription[],
            {
              title: `🤖 AI Monitor: +${alerts.length - 3} alertów`,
              body: `Łącznie ${alerts.length} alertów. Sprawdź dashboard.`,
              url: '/owner',
              tag: 'ai-summary',
            },
            vapidPublicKey,
            vapidPrivateKey,
            vapidSubject
          )
        }

        results.push(`push: ${alerts.length} alerts → ${subs.length} subs for ${locId}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    alertsGenerated: newAlerts.length,
    details: results,
  })
}
