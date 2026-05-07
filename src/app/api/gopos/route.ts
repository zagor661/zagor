import { NextRequest, NextResponse } from 'next/server'
import {
  getMe, getOrganization, getItems, getCategories, getOrders, getOrderDetail, getOrderItems,
  getOrderItemsReport, getOrderItemsReportByItem, getOrdersReport, getOrderPaymentsReport,
  getEmployees, getWorkTimes, getPaymentMethods,
  getPosReports, getInvoices, getTaxes, getDiscounts, getMenus,
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
        requireOrg()
        const dateStart = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const dateEnd = req.nextUrl.searchParams.get('date_end') || getToday()
        const report = await getOrderItemsReport(orgId, dateStart, dateEnd)
        return NextResponse.json({ ok: true, period: { start: dateStart, end: dateEnd }, data: report })
      }

      case 'sales_by_item': {
        // Fetch orders list, then batch-fetch details to get order_items
        requireOrg()
        const siStart = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const siEnd = req.nextUrl.searchParams.get('date_end') || getToday()
        const rawOrders = await getOrders(orgId, siStart, siEnd)
        const orderList: any[] = rawOrders?.data || []

        // Batch fetch order items (5 at a time to avoid rate limits)
        const itemMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
        const batchSize = 5

        for (let i = 0; i < orderList.length; i += batchSize) {
          const batch = orderList.slice(i, i + batchSize)
          const results = await Promise.all(
            batch.map((o: any) => getOrderItems(orgId, o.id).catch(() => null))
          )

          for (const result of results) {
            const orderItems = result?.data || []
            for (const item of orderItems) {
              const name = item.item?.name || item.item_name || item.name || 'Nieznany'
              const qty = item.quantity || 1
              const price = item.total_price?.amount || item.price?.amount || 0

              if (!itemMap[name]) {
                itemMap[name] = { name, quantity: 0, revenue: 0 }
              }
              itemMap[name].quantity += qty
              itemMap[name].revenue += price
            }
          }
        }

        const items = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue)
        return NextResponse.json({
          ok: true,
          period: { start: siStart, end: siEnd },
          data: { items, total_orders: orderList.length },
        })
      }

      case 'orders': {
        requireOrg()
        const start = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const end = req.nextUrl.searchParams.get('date_end') || getToday()
        const orders = await getOrdersReport(orgId, start, end)
        return NextResponse.json({ ok: true, period: { start, end }, data: orders })
      }

      case 'payments': {
        requireOrg()
        const pStart = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const pEnd = req.nextUrl.searchParams.get('date_end') || getToday()
        const payments = await getOrderPaymentsReport(orgId, pStart, pEnd)
        return NextResponse.json({ ok: true, period: { start: pStart, end: pEnd }, data: payments })
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

      case 'order_debug': {
        requireOrg()
        const rawOrders2 = await getOrders(orgId, getToday(), getToday())
        const list2 = rawOrders2?.data || []
        if (list2.length === 0) return NextResponse.json({ ok: true, msg: 'no orders today' })
        const oi = await getOrderItems(orgId, list2[0].id)
        return NextResponse.json({
          ok: true,
          order_id: list2[0].id,
          order_items_response: oi,
        })
      }

      default:
        return NextResponse.json({
          ok: false,
          error: `Unknown action: ${action}`,
          available: ['me', 'org', 'items', 'categories', 'sales', 'sales_by_item', 'orders', 'payments', 'employees', 'work_times', 'payment_methods', 'pos_reports', 'invoices', 'taxes', 'discounts', 'menus'],
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
