import { NextRequest, NextResponse } from 'next/server'
import { getPurchaseInvoices, getPurchaseInvoice, summarizeInvoices } from '@/lib/fakturownia'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') || 'list'
    const page = parseInt(searchParams.get('page') || '1')
    const period = searchParams.get('period') || 'this_month'
    const dateFrom = searchParams.get('date_from') || undefined
    const dateTo = searchParams.get('date_to') || undefined

    if (action === 'detail') {
      const id = parseInt(searchParams.get('id') || '0')
      if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })
      const invoice = await getPurchaseInvoice(id)
      return NextResponse.json({ ok: true, data: invoice })
    }

    if (action === 'all') {
      // Paginate through ALL purchase invoices — returns summary only (no raw data) to keep response small
      const PAGE_SIZE = 25
      const allInvoices: any[] = []
      let pg = 1

      while (true) {
        const batch = await getPurchaseInvoices({ page: pg, period, dateFrom, dateTo })
        if (!batch || batch.length === 0) break
        allInvoices.push(...batch)
        if (batch.length < PAGE_SIZE) break
        pg++
        if (pg > 20) break // safety limit
      }

      const summary = summarizeInvoices(allInvoices)

      return NextResponse.json({
        ok: true,
        totalInvoices: allInvoices.length,
        pagesLoaded: pg,
        period,
        dateFrom,
        dateTo,
        summary,
        // Include slim invoice list (no heavy fields) for analysis
        invoices: allInvoices.map(inv => ({
          id: inv.id,
          number: inv.number,
          issue_date: inv.issue_date,
          sell_date: inv.sell_date,
          buyer_name: inv.buyer_name,
          seller_name: inv.seller_name,
          price_net: inv.price_net,
          price_gross: inv.price_gross,
          price_tax: inv.price_tax,
          status: inv.status,
          payment_status: inv.payment_status,
          product_cache: inv.product_cache,
          kind: inv.kind,
          income: inv.income,
        })),
      })
    }

    // Default: list purchase invoices (single page)
    const invoices = await getPurchaseInvoices({ page, period, dateFrom, dateTo })
    const summary = summarizeInvoices(invoices)

    return NextResponse.json({
      ok: true,
      data: invoices,
      summary,
      page,
      period,
    })
  } catch (err: any) {
    console.error('Fakturownia API error:', err.message)
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.message.includes('Missing') ? 500 : 502 }
    )
  }
}
