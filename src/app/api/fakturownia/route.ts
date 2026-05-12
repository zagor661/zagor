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

    // Default: list purchase invoices
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
