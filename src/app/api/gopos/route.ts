import { NextRequest, NextResponse } from 'next/server'
import {
  getMe, getOrganization, getItems, getCategories,
  getOrderItemsReport, getOrderItemsReportByProduct, getOrdersReport, getOrderPaymentsReport,
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
          // dateEntry.group_by_value.name = date string like "2026-05-07"
          const dateStr = dateEntry.group_by_value?.name || ''
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
