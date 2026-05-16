import { NextRequest, NextResponse } from 'next/server'
import { getOrderItemsReport, getOrderItemsReportByProduct } from '@/lib/gopos'
import { getPurchaseInvoices } from '@/lib/fakturownia'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

// P&L endpoint — aggregates revenue, purchase costs, labor costs
// GET /api/pnl?date_start=2026-05-01&date_end=2026-05-15

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!

// ─── Supplier → category mapping ─────────────────────────
// Food: raw ingredients & groceries
// Beverage: drinks only
// Other: marketing, services, equipment
type CostCategory = 'food' | 'beverage' | 'other'

function classifySupplier(name: string): CostCategory {
  const n = name.toLowerCase()
  // Food suppliers
  if (n.includes('farutex')) return 'food'
  if (n.includes('makro')) return 'food'
  if (n.includes('world of asia')) return 'food'
  if (n.includes('pilarz')) return 'food'       // mięso
  // Beverage suppliers
  if (n.includes('coca-cola') || n.includes('coca cola')) return 'beverage'
  // Everything else (Abeso Media = marketing, etc.)
  return 'other'
}

export async function GET(req: NextRequest) {
  try {
    const dateStart = req.nextUrl.searchParams.get('date_start') || '2026-05-01'
    const dateEnd = req.nextUrl.searchParams.get('date_end') || new Date().toISOString().split('T')[0]
    const orgId = process.env.GOPOS_ORGANIZATION_ID || ''
    if (!orgId) throw new Error('Missing GOPOS_ORGANIZATION_ID')

    // ─── 1. REVENUE from GoPOS ───────────────────────────
    let totalRevenue = 0
    let totalNetRevenue = 0
    let totalTransactions = 0
    const dailyRevenue: { date: string; revenue: number }[] = []

    try {
      const report = await getOrderItemsReport(orgId, dateStart, dateEnd)
      const reports: any[] = report?.reports || []
      const noneLevel = reports[0]
      const dateEntries: any[] = noneLevel?.sub_report || []

      for (const dateEntry of dateEntries) {
        const tsRaw = dateEntry.group_by_value?.name
        if (!tsRaw) continue
        const dateStr = new Date(Number(tsRaw)).toISOString().split('T')[0]
        if (dateStr < dateStart || dateStr > dateEnd) continue

        const sales = dateEntry.aggregate?.sales || {}
        const rev = sales.total_money?.amount || 0
        const netRev = sales.net_total_money?.amount || 0
        const tx = sales.transaction_count || 0

        totalRevenue += rev
        totalNetRevenue += netRev
        totalTransactions += tx
        dailyRevenue.push({ date: dateStr, revenue: rev })
      }
    } catch (e: any) {
      console.error('[PNL] GoPOS sales error:', e.message)
    }

    // ─── 1b. THEORETICAL FOOD COST from recipes × GoPOS sales ──
    let theoreticalFoodCost = 0

    try {
      const report = await getOrderItemsReportByProduct(orgId, dateStart, dateEnd)
      const reports: any[] = report?.reports || []
      const noneLevel = reports[0]
      const dateEntries: any[] = noneLevel?.sub_report || []

      for (const dateEntry of dateEntries) {
        const tsRaw = dateEntry.group_by_value?.name
        if (!tsRaw) continue
        const dateStr = new Date(Number(tsRaw)).toISOString().split('T')[0]
        if (dateStr < dateStart || dateStr > dateEnd) continue

        const productEntries: any[] = dateEntry.sub_report || []
        for (const prod of productEntries) {
          const name = (prod.group_by_value?.name || '').trim()
          const qty = prod.aggregate?.sales?.product_quantity || 0
          if (!name || !qty) continue

          // Match to recipe
          const recipe = DEFAULT_RECIPES.find(r =>
            name.toLowerCase().includes(r.name.toLowerCase()) ||
            r.name.toLowerCase().includes(name.toLowerCase()) ||
            name.replace(/^[0-9]+\s*/, '').toLowerCase() === r.name.replace(/^[0-9]+\s*/, '').toLowerCase()
          )
          if (recipe) {
            const costPerPortion = recipe.lines.reduce((s, l) => s + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)
            theoreticalFoodCost += costPerPortion * qty
          }
        }
      }
    } catch (e: any) {
      console.error('[PNL] Theoretical FC error:', e.message)
    }

    // ─── 2. PURCHASE COSTS from Fakturownia (categorized) ──
    const costCategories: Record<CostCategory, { gross: number; net: number; vat: number; count: number; suppliers: Record<string, { count: number; gross: number }> }> = {
      food:     { gross: 0, net: 0, vat: 0, count: 0, suppliers: {} },
      beverage: { gross: 0, net: 0, vat: 0, count: 0, suppliers: {} },
      other:    { gross: 0, net: 0, vat: 0, count: 0, suppliers: {} },
    }
    let totalPurchaseGross = 0
    let totalPurchaseNet = 0
    let purchaseInvoiceCount = 0

    try {
      const PAGE_SIZE = 25
      const allInvoices: any[] = []
      let pg = 1

      while (true) {
        const batch = await getPurchaseInvoices({
          page: pg,
          period: 'more',
          dateFrom: dateStart,
          dateTo: dateEnd,
        })
        if (!batch || batch.length === 0) break
        allInvoices.push(...batch)
        if (batch.length < PAGE_SIZE) break
        pg++
        if (pg > 20) break
      }

      for (const inv of allInvoices) {
        const net = parseFloat(inv.price_net) || 0
        const gross = parseFloat(inv.price_gross) || 0
        const vat = parseFloat(inv.price_tax) || 0

        totalPurchaseNet += net
        totalPurchaseGross += gross
        purchaseInvoiceCount++

        // KSeF purchase invoices: buyer_name = actual supplier
        const supplier = inv.income === false
          ? (inv.buyer_name || inv.seller_name || 'Nieznany')
          : (inv.seller_name || inv.buyer_name || 'Nieznany')

        const cat = classifySupplier(supplier)
        costCategories[cat].gross += gross
        costCategories[cat].net += net
        costCategories[cat].vat += vat
        costCategories[cat].count++

        if (!costCategories[cat].suppliers[supplier]) costCategories[cat].suppliers[supplier] = { count: 0, gross: 0 }
        costCategories[cat].suppliers[supplier].count++
        costCategories[cat].suppliers[supplier].gross += gross
      }
    } catch (e: any) {
      console.error('[PNL] Fakturownia error:', e.message)
    }

    // ─── 3. LABOR COSTS from GoPOS work_times + Supabase hourly_rate ───
    let totalLabor = 0
    let totalHours = 0
    const laborByWorker: Record<string, { hours: number; cost: number; rate: number }> = {}

    try {
      const { getAllWorkTimes } = await import('@/lib/gopos')
      const workTimes = await getAllWorkTimes(orgId)

      const sb = createClient(supabaseUrl, supabaseKey)
      const { data: profiles } = await sb.from('profiles').select('full_name, hourly_rate').eq('is_active', true)
      const profileMap = (profiles || []).reduce((acc: Record<string, number>, p: any) => {
        acc[p.full_name.toLowerCase()] = p.hourly_rate || 0
        return acc
      }, {} as Record<string, number>)

      for (const wt of workTimes) {
        const wtDate = wt.started_at ? new Date(wt.started_at).toISOString().split('T')[0] : null
        if (!wtDate || wtDate < dateStart || wtDate > dateEnd) continue

        const name = wt.employee_name || wt.employee?.name ||
          `${wt.employee?.first_name || ''} ${wt.employee?.last_name || ''}`.trim()
        if (!name || !wt.duration) continue

        const hours = wt.duration / 3600
        const rate = Object.entries(profileMap).find(
          ([pName]) => pName.includes(name.toLowerCase()) || name.toLowerCase().includes(pName)
        )?.[1] || 0

        if (!laborByWorker[name]) laborByWorker[name] = { hours: 0, cost: 0, rate }
        laborByWorker[name].hours += hours
        laborByWorker[name].cost += hours * rate
        totalHours += hours
        totalLabor += hours * rate
      }
    } catch (e: any) {
      console.error('[PNL] Labor calc error:', e.message)
    }

    // ─── 4. CALCULATE P&L ────────────────────────────────
    const totalCosts = totalPurchaseGross + totalLabor
    const profitLoss = totalRevenue - totalCosts
    const profitPct = totalRevenue > 0 ? (profitLoss / totalRevenue) * 100 : 0
    const days = Math.max(1, Math.ceil((new Date(dateEnd).getTime() - new Date(dateStart).getTime()) / 86400000) + 1)

    // Category percentages
    const foodPct = totalRevenue > 0 ? (costCategories.food.gross / totalRevenue) * 100 : 0
    const beveragePct = totalRevenue > 0 ? (costCategories.beverage.gross / totalRevenue) * 100 : 0
    const otherPct = totalRevenue > 0 ? (costCategories.other.gross / totalRevenue) * 100 : 0
    const laborPct = totalRevenue > 0 ? (totalLabor / totalRevenue) * 100 : 0
    const theoreticalFcPct = totalRevenue > 0 ? (theoreticalFoodCost / totalRevenue) * 100 : 0

    const formatSuppliers = (suppliers: Record<string, { count: number; gross: number }>) =>
      Object.entries(suppliers)
        .map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.gross - a.gross)

    return NextResponse.json({
      ok: true,
      period: { start: dateStart, end: dateEnd, days },
      revenue: {
        total: Math.round(totalRevenue),
        net: Math.round(totalNetRevenue),
        transactions: totalTransactions,
        daily: dailyRevenue.sort((a, b) => a.date.localeCompare(b.date)),
        avgPerDay: Math.round(totalRevenue / days),
      },
      // ─── Categorized purchase costs ──────────────────
      purchases: {
        total: {
          gross: Math.round(totalPurchaseGross * 100) / 100,
          net: Math.round(totalPurchaseNet * 100) / 100,
          invoiceCount: purchaseInvoiceCount,
          pctOfRevenue: Math.round((totalRevenue > 0 ? (totalPurchaseGross / totalRevenue) * 100 : 0) * 10) / 10,
        },
        food: {
          gross: Math.round(costCategories.food.gross * 100) / 100,
          count: costCategories.food.count,
          pctOfRevenue: Math.round(foodPct * 10) / 10,
          bySupplier: formatSuppliers(costCategories.food.suppliers),
        },
        beverage: {
          gross: Math.round(costCategories.beverage.gross * 100) / 100,
          count: costCategories.beverage.count,
          pctOfRevenue: Math.round(beveragePct * 10) / 10,
          bySupplier: formatSuppliers(costCategories.beverage.suppliers),
        },
        other: {
          gross: Math.round(costCategories.other.gross * 100) / 100,
          count: costCategories.other.count,
          pctOfRevenue: Math.round(otherPct * 10) / 10,
          bySupplier: formatSuppliers(costCategories.other.suppliers),
        },
      },
      // ─── Food cost comparison ────────────────────────
      foodCost: {
        actual: Math.round(costCategories.food.gross * 100) / 100,
        actualPct: Math.round(foodPct * 10) / 10,
        theoretical: Math.round(theoreticalFoodCost),
        theoreticalPct: Math.round(theoreticalFcPct * 10) / 10,
        difference: Math.round((costCategories.food.gross - theoreticalFoodCost) * 100) / 100,
        differencePct: Math.round((foodPct - theoreticalFcPct) * 10) / 10,
      },
      labor: {
        total: Math.round(totalLabor),
        hours: Math.round(totalHours * 10) / 10,
        pctOfRevenue: Math.round(laborPct * 10) / 10,
        byWorker: Object.entries(laborByWorker)
          .map(([name, d]) => ({ name, hours: Math.round(d.hours * 10) / 10, cost: Math.round(d.cost), rate: d.rate }))
          .sort((a, b) => b.cost - a.cost),
      },
      profitLoss: {
        amount: Math.round(profitLoss),
        pctOfRevenue: Math.round(profitPct * 10) / 10,
        isProfit: profitLoss >= 0,
        perDay: Math.round(profitLoss / days),
      },
      summary: {
        revenue: Math.round(totalRevenue),
        costs: Math.round(totalCosts),
        result: Math.round(profitLoss),
        resultLabel: profitLoss >= 0 ? 'ZYSK' : 'STRATA',
      },
    })
  } catch (err: any) {
    console.error('[PNL] Fatal error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
