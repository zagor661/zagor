import { NextRequest, NextResponse } from 'next/server'
import {
  getMe, getOrganization, getItems, getCategories,
  getOrderItemsReport, getOrderItemsReportByProduct, getOrdersReport, getOrderPaymentsReport,
  getEmployees, getWorkTimes, getPaymentMethods,
  getPosReports, getInvoices, getTaxes, getDiscounts, getMenus,
  getOrders, getOrderItems,
} from '@/lib/gopos'

// GET /api/gopos?action=me|org|items|categories|sales|orders|payments|employees|work_times|payment_methods|pos_reports|invoices|taxes|discounts|menus
// Proxy for GoPOS API — all auth handled server-side

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action') || 'me'
    const orgId = process.env.GOPOS_ORGANIZATION_ID || ''

    // Helper — most actions need orgId
    const requireOrg = () => {
      if (!orgId) throw new Error('GOPOS_ORGANIZATION_ID not set')
    }

    switch (action) {
      case 'me': {
        const me = await getMe()
        return NextResponse.json({ ok: true, data: me })
      }

      case 'org': {
        requireOrg()
        const org = await getOrganization(orgId)
        return NextResponse.json({ ok: true, data: org })
      }

      case 'items': {
        requireOrg()
        const items = await getItems(orgId)
        return NextResponse.json({ ok: true, data: items })
      }

      case 'categories': {
        requireOrg()
        const cats = await getCategories(orgId)
        return NextResponse.json({ ok: true, data: cats })
      }

      case 'sales': {
        // Total sales aggregated by date (no product breakdown)
        requireOrg()
        const dateStart = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const dateEnd = req.nextUrl.searchParams.get('date_end') || getToday()
        const report = await getOrderItemsReport(orgId, dateStart, dateEnd)

        const reports: any[] = report?.reports || []
        const noneLevel = reports[0]
        const dateEntries: any[] = noneLevel?.sub_report || []

        let totalRevenue = 0, totalNetRevenue = 0, totalQty = 0, totalTx = 0, totalDiscount = 0
        const dailyBreakdown: { date: string; revenue: number; net_revenue: number; quantity: number; transactions: number }[] = []

        for (const dateEntry of dateEntries) {
          const tsRaw = dateEntry.group_by_value?.name
          if (!tsRaw) continue
          const dateStr = new Date(Number(tsRaw)).toISOString().split('T')[0]
          if (dateStr < dateStart || dateStr > dateEnd) continue

          const sales = dateEntry.aggregate?.sales || {}
          const rev = sales.total_money?.amount || 0
          const netRev = sales.net_total_money?.amount || 0
          const qty = sales.product_quantity || 0
          const tx = sales.transaction_count || 0
          const disc = sales.discount_money?.amount || 0

          totalRevenue += rev
          totalNetRevenue += netRev
          totalQty += qty
          totalTx += tx
          totalDiscount += disc

          dailyBreakdown.push({ date: dateStr, revenue: rev, net_revenue: netRev, quantity: qty, transactions: tx })
        }

        dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date))

        return NextResponse.json({
          ok: true,
          period: { start: dateStart, end: dateEnd },
          data: {
            daily: dailyBreakdown,
            summary: {
              total_revenue: totalRevenue,
              net_revenue: totalNetRevenue,
              total_quantity: totalQty,
              total_transactions: totalTx,
              total_discount: totalDiscount,
            },
          },
        })
      }

      case 'sales_by_item': {
        // GoPOS reports API with NONE,CREATED_AT_DATE,PRODUCT grouping
        // Date filtering done server-side (GoPOS doesn't support date params on reports)
        requireOrg()
        const siStart = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const siEnd = req.nextUrl.searchParams.get('date_end') || getToday()
        const report = await getOrderItemsReportByProduct(orgId, siStart, siEnd)

        // Structure: reports[0] = NONE (total)
        //   → sub_report[] = CREATED_AT_DATE entries (one per day)
        //     → sub_report[] = PRODUCT entries
        const reports: any[] = report?.reports || []
        const noneLevel = reports[0]
        const dateEntries: any[] = noneLevel?.sub_report || []

        // Aggregate products across matching dates
        const itemMap: Record<string, { name: string; quantity: number; revenue: number; net_revenue: number; transactions: number; discount: number }> = {}
        let totalRevenue = 0, totalNetRevenue = 0, totalQty = 0, totalTx = 0, totalDiscount = 0

        for (const dateEntry of dateEntries) {
          // dateEntry.group_by_value.name = Unix timestamp in ms (e.g. "1772236800000")
          const tsRaw = dateEntry.group_by_value?.name
          if (!tsRaw) continue
          const dateStr = new Date(Number(tsRaw)).toISOString().split('T')[0]
          // Filter: only include dates within requested range
          if (dateStr < siStart || dateStr > siEnd) continue

          const dateSales = dateEntry.aggregate?.sales || {}
          totalRevenue += dateSales.total_money?.amount || 0
          totalNetRevenue += dateSales.net_total_money?.amount || 0
          totalQty += dateSales.product_quantity || 0
          totalTx += dateSales.transaction_count || 0
          totalDiscount += dateSales.discount_money?.amount || 0

          const productEntries: any[] = dateEntry.sub_report || []
          for (const prod of productEntries) {
            const name = prod.group_by_value?.name || 'Nieznany'
            const sales = prod.aggregate?.sales || {}
            if (!itemMap[name]) {
              itemMap[name] = { name, quantity: 0, revenue: 0, net_revenue: 0, transactions: 0, discount: 0 }
            }
            itemMap[name].quantity += sales.product_quantity || 0
            itemMap[name].revenue += sales.total_money?.amount || 0
            itemMap[name].net_revenue += sales.net_total_money?.amount || 0
            itemMap[name].transactions += sales.transaction_count || 0
            itemMap[name].discount += sales.discount_money?.amount || 0
          }
        }

        const items = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue)

        return NextResponse.json({
          ok: true,
          period: { start: siStart, end: siEnd },
          data: {
            items,
            summary: {
              total_revenue: totalRevenue,
              net_revenue: totalNetRevenue,
              total_quantity: totalQty,
              total_transactions: totalTx,
              total_discount: totalDiscount,
            },
          },
        })
      }

      case 'orders': {
        // Orders report with server-side date filtering
        requireOrg()
        const start = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const end = req.nextUrl.searchParams.get('date_end') || getToday()
        const ordersReport = await getOrdersReport(orgId, start, end)

        const ordReports: any[] = ordersReport?.reports || []
        const ordNone = ordReports[0]
        const ordDateEntries: any[] = ordNone?.sub_report || []

        let ordTotalRevenue = 0, ordTotalOrders = 0, ordAvgOrder = 0
        const ordDaily: { date: string; revenue: number; orders: number; avg_order: number }[] = []

        for (const dateEntry of ordDateEntries) {
          const tsRaw = dateEntry.group_by_value?.name
          if (!tsRaw) continue
          const dateStr = new Date(Number(tsRaw)).toISOString().split('T')[0]
          if (dateStr < start || dateStr > end) continue

          const sales = dateEntry.aggregate?.sales || {}
          const rev = sales.total_money?.amount || 0
          const orders = sales.transaction_count || 0
          const avg = orders > 0 ? rev / orders : 0

          ordTotalRevenue += rev
          ordTotalOrders += orders

          ordDaily.push({ date: dateStr, revenue: rev, orders, avg_order: Math.round(avg * 100) / 100 })
        }

        ordAvgOrder = ordTotalOrders > 0 ? Math.round((ordTotalRevenue / ordTotalOrders) * 100) / 100 : 0
        ordDaily.sort((a, b) => a.date.localeCompare(b.date))

        return NextResponse.json({
          ok: true,
          period: { start, end },
          data: {
            daily: ordDaily,
            summary: {
              total_revenue: ordTotalRevenue,
              total_orders: ordTotalOrders,
              avg_order: ordAvgOrder,
            },
          },
        })
      }

      case 'payments': {
        // Payments report with server-side date filtering
        requireOrg()
        const pStart = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const pEnd = req.nextUrl.searchParams.get('date_end') || getToday()
        const payments = await getOrderPaymentsReport(orgId, pStart, pEnd)

        const payReports: any[] = payments?.reports || []
        const payNone = payReports[0]
        const payDateEntries: any[] = payNone?.sub_report || []

        let payTotalRevenue = 0, payTotalTx = 0
        const payDaily: { date: string; revenue: number; transactions: number }[] = []

        for (const dateEntry of payDateEntries) {
          const tsRaw = dateEntry.group_by_value?.name
          if (!tsRaw) continue
          const dateStr = new Date(Number(tsRaw)).toISOString().split('T')[0]
          if (dateStr < pStart || dateStr > pEnd) continue

          const sales = dateEntry.aggregate?.sales || {}
          const rev = sales.total_money?.amount || 0
          const tx = sales.transaction_count || 0

          payTotalRevenue += rev
          payTotalTx += tx

          payDaily.push({ date: dateStr, revenue: rev, transactions: tx })
        }

        payDaily.sort((a, b) => a.date.localeCompare(b.date))

        return NextResponse.json({
          ok: true,
          period: { start: pStart, end: pEnd },
          data: {
            daily: payDaily,
            summary: {
              total_revenue: payTotalRevenue,
              total_transactions: payTotalTx,
            },
          },
        })
      }

      case 'kompozycja_debug': {
        // DEBUG: show raw structure of 1 order + its detail + its items
        requireOrg()
        const kStart = req.nextUrl.searchParams.get('date_start') || getToday()
        const kEnd = req.nextUrl.searchParams.get('date_end') || getToday()

        const allOrders = await getOrders(orgId, kStart, kEnd)
        const orderList: any[] = allOrders?.data || allOrders || []

        if (orderList.length === 0) {
          return NextResponse.json({ ok: true, msg: 'no orders', total: 0 })
        }

        // Pick last order
        const sampleOrd = orderList[orderList.length - 1]
        const ordId = sampleOrd.id || sampleOrd.order_id

        // Fetch detail
        let detail = null
        let detailItems = null
        let separateItems = null
        try { detail = await getOrderDetail(orgId, ordId) } catch (e: any) { detail = { error: e.message } }
        try { separateItems = await getOrderItems(orgId, ordId) } catch (e: any) { separateItems = { error: e.message } }

        return NextResponse.json({
          ok: true,
          total_orders: orderList.length,
          sample_order_from_list: sampleOrd,
          order_detail: detail,
          order_items_separate: separateItems,
        })
      }

      case 'kompozycja_orders': {
        // Fetch individual orders that contain "Kompozycja Własna"
        // Uses order_items endpoint per order (parallel, max 20)
        requireOrg()
        const kStart = req.nextUrl.searchParams.get('date_start') || getToday()
        const kEnd = req.nextUrl.searchParams.get('date_end') || getToday()

        const allOrders = await getOrders(orgId, kStart, kEnd)
        const orderList: any[] = allOrders?.data || allOrders || []

        if (orderList.length === 0) {
          return NextResponse.json({ ok: true, period: { start: kStart, end: kEnd }, total_orders: 0, kompozycja_count: 0, data: [] })
        }

        const compositions: {
          order_id: number
          created_at: string
          items: { name: string; quantity: number; price: number }[]
        }[] = []

        // Parallel fetch, max 20 to stay under Vercel timeout
        const maxOrders = Math.min(orderList.length, 20)
        const batch = orderList.slice(-maxOrders)

        const results = await Promise.all(
          batch.map(async (ord: any) => {
            const id = ord.id || ord.order_id
            if (!id) return null
            try {
              const itemsRes = await getOrderItems(orgId, id)
              // Handle both { data: [...] } and direct array
              let items: any[] = []
              if (Array.isArray(itemsRes)) items = itemsRes
              else if (Array.isArray(itemsRes?.data)) items = itemsRes.data
              else if (typeof itemsRes === 'object') items = Object.values(itemsRes).find(v => Array.isArray(v)) as any[] || []

              // Find Kompozycja in any name field
              const hasK = items.some((it: any) => {
                const n = it.product_name || it.name || it.product?.name || JSON.stringify(it)
                return n.includes('Kompozycja')
              })
              if (!hasK) return null

              const kompItems = items
                .filter((it: any) => {
                  const n = it.product_name || it.name || it.product?.name || ''
                  return n.includes('Kompozycja') || !(/^\d{2}\s/.test(n))
                })
                .map((it: any) => ({
                  name: it.product_name || it.name || it.product?.name || 'Nieznany',
                  quantity: it.quantity || 1,
                  price: it.total_money?.amount || it.total_price?.amount || it.price?.amount || 0,
                }))

              return {
                order_id: id,
                created_at: ord.created_at || ord.closed_at || '',
                items: kompItems,
              }
            } catch { return null }
          })
        )

        for (const r of results) {
          if (r) compositions.push(r)
        }

        compositions.sort((a, b) => b.order_id - a.order_id)

        return NextResponse.json({
          ok: true,
          period: { start: kStart, end: kEnd },
          total_orders: orderList.length,
          kompozycja_count: compositions.length,
          data: compositions,
        })
      }

      case 'employees': {
        requireOrg()
        const employees = await getEmployees(orgId)
        return NextResponse.json({ ok: true, data: employees })
      }

      case 'work_times': {
        requireOrg()
        const workTimes = await getWorkTimes(orgId)
        return NextResponse.json({ ok: true, data: workTimes })
      }

      case 'payment_methods': {
        requireOrg()
        const methods = await getPaymentMethods(orgId)
        return NextResponse.json({ ok: true, data: methods })
      }

      case 'pos_reports': {
        requireOrg()
        const posReports = await getPosReports(orgId)
        return NextResponse.json({ ok: true, data: posReports })
      }

      case 'invoices': {
        requireOrg()
        const invoices = await getInvoices(orgId)
        return NextResponse.json({ ok: true, data: invoices })
      }

      case 'taxes': {
        requireOrg()
        const taxes = await getTaxes(orgId)
        return NextResponse.json({ ok: true, data: taxes })
      }

      case 'discounts': {
        requireOrg()
        const discounts = await getDiscounts(orgId)
        return NextResponse.json({ ok: true, data: discounts })
      }

      case 'menus': {
        requireOrg()
        const menus = await getMenus(orgId)
        return NextResponse.json({ ok: true, data: menus })
      }

      default:
        return NextResponse.json({
          ok: false,
          error: `Unknown action: ${action}`,
          available: ['me', 'org', 'items', 'categories', 'sales', 'sales_by_item', 'kompozycja_orders', 'orders', 'payments', 'employees', 'work_times', 'payment_methods', 'pos_reports', 'invoices', 'taxes', 'discounts', 'menus'],
        }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getDefaultDateStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}
