import { NextRequest, NextResponse } from 'next/server'
import {
  getMe, getOrganization, getItems, getCategories,
  getOrderItemsReport, getOrdersReport, getOrderPaymentsReport,
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
          available: ['me', 'org', 'items', 'categories', 'sales', 'orders', 'payments', 'employees', 'work_times', 'payment_methods', 'pos_reports', 'invoices', 'taxes', 'discounts', 'menus'],
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
