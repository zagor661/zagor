import { NextRequest, NextResponse } from 'next/server'
import {
  getMe, getOrganization, getItems, getCategories,
  getOrderItemsReport, getOrderItemsReportByProduct, getOrdersReport, getOrderPaymentsReport,
  getEmployees, getWorkTimes, getPaymentMethods,
  getPosReports, getInvoices, getTaxes, getDiscounts, getMenus,
  goposGet,
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
        // Use GoPOS reports API with NONE,PRODUCT grouping
        requireOrg()
        const siStart = req.nextUrl.searchParams.get('date_start') || getDefaultDateStart()
        const siEnd = req.nextUrl.searchParams.get('date_end') || getToday()
        const report = await getOrderItemsReportByProduct(orgId, siStart, siEnd)

        // Parse nested report structure: reports[0].sub_report[] = PRODUCT entries
        const reports: any[] = report?.reports || []
        const noneLevel = reports[0] // group_by_type: NONE (summary)
        const productEntries: any[] = noneLevel?.sub_report || []

        const items = productEntries.map((entry: any) => {
          const name = entry.group_by_value?.name || 'Nieznany'
          const sales = entry.aggregate?.sales || {}
          return {
            name,
            quantity: sales.product_quantity || 0,
            revenue: sales.total_money?.amount || 0,
            net_revenue: sales.net_total_money?.amount || 0,
            transactions: sales.transaction_count || 0,
            discount: sales.discount_money?.amount || 0,
          }
        }).sort((a: any, b: any) => b.revenue - a.revenue)

        // Summary from NONE level
        const totalSales = noneLevel?.aggregate?.sales || {}

        return NextResponse.json({
          ok: true,
          period: { start: siStart, end: siEnd },
          data: {
            items,
            summary: {
              total_revenue: totalSales.total_money?.amount || 0,
              net_revenue: totalSales.net_total_money?.amount || 0,
              total_quantity: totalSales.product_quantity || 0,
              total_transactions: totalSales.transaction_count || 0,
              total_discount: totalSales.discount_money?.amount || 0,
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

      case 'date_test': {
        // Temporary: test which date parameter format GoPOS accepts
        requireOrg()
        const today = getToday()
        const tests: Record<string, any> = {}

        // Test 1: closed_at with <bt>
        try {
          const r1 = await goposGet('/api/v3/reports/order_items', {
            organization_id: orgId, groups: 'NONE',
            closed_at: `<bt>${today}T00:00:00,${today}T23:59:59`,
          })
          tests['closed_at_bt'] = { ok: true, qty: r1?.reports?.[0]?.aggregate?.sales?.product_quantity }
        } catch (e: any) { tests['closed_at_bt'] = { ok: false, error: e.message } }

        // Test 2: date_range
        try {
          const r2 = await goposGet('/api/v3/reports/order_items', {
            organization_id: orgId, groups: 'NONE',
            date_range: `${today}T00:00:00,${today}T23:59:59`,
          })
          tests['date_range'] = { ok: true, qty: r2?.reports?.[0]?.aggregate?.sales?.product_quantity }
        } catch (e: any) { tests['date_range'] = { ok: false, error: e.message } }

        // Test 3: created_at with <bt>
        try {
          const r3 = await goposGet('/api/v3/reports/order_items', {
            organization_id: orgId, groups: 'NONE',
            created_at: `<bt>${today}T00:00:00,${today}T23:59:59`,
          })
          tests['created_at_bt'] = { ok: true, qty: r3?.reports?.[0]?.aggregate?.sales?.product_quantity }
        } catch (e: any) { tests['created_at_bt'] = { ok: false, error: e.message } }

        // Test 4: time_start + time_end with dates (original)
        try {
          const r4 = await goposGet('/api/v3/reports/order_items', {
            organization_id: orgId, groups: 'NONE',
            time_start: today, time_end: today,
          })
          tests['time_start_end'] = { ok: true, qty: r4?.reports?.[0]?.aggregate?.sales?.product_quantity }
        } catch (e: any) { tests['time_start_end'] = { ok: false, error: e.message } }

        // Test 5: date_range with just dates (no time)
        try {
          const r5 = await goposGet('/api/v3/reports/order_items', {
            organization_id: orgId, groups: 'NONE',
            date_range: `${today},${today}`,
          })
          tests['date_range_simple'] = { ok: true, qty: r5?.reports?.[0]?.aggregate?.sales?.product_quantity }
        } catch (e: any) { tests['date_range_simple'] = { ok: false, error: e.message } }

        return NextResponse.json({ ok: true, today, tests })
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
