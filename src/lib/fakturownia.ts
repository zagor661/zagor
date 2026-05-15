// Fakturownia API Client — purchase invoices for WOKI WOKI
// Docs: https://app.fakturownia.pl/api

const DOMAIN = process.env.FAKTUROWNIA_DOMAIN || 'wokiwoki'
const BASE_URL = `https://${DOMAIN}.fakturownia.pl`

function getToken(): string {
  const token = process.env.FAKTUROWNIA_API_TOKEN
  if (!token) throw new Error('Missing FAKTUROWNIA_API_TOKEN env var')
  return token
}

interface FakturowniaParams {
  page?: number
  per_page?: number
  period?: string        // this_month, last_month, this_year, all, more (with date_from/date_to)
  date_from?: string     // yyyy-MM-dd
  date_to?: string       // yyyy-MM-dd
  income?: string        // 'no' = purchase invoices only
  search_date_type?: string  // issue_date, etc
}

export async function fakturowniaGet(path: string, params?: Record<string, string>): Promise<any> {
  const token = getToken()
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('api_token', token)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fakturownia API error ${res.status}: ${text}`)
  }

  return res.json()
}

// ─── Purchase invoices (income=no) ─────────────────────────

export async function getPurchaseInvoices(opts: {
  page?: number
  period?: string
  dateFrom?: string
  dateTo?: string
} = {}): Promise<any[]> {
  const params: Record<string, string> = {
    income: 'no',
    page: String(opts.page || 1),
    per_page: '25',
  }

  if (opts.period === 'more' && opts.dateFrom && opts.dateTo) {
    // Custom date range — must pass all three params together
    params.period = 'more'
    params.date_from = opts.dateFrom
    params.date_to = opts.dateTo
  } else if (opts.period) {
    params.period = opts.period
    // Also pass dates if provided (some periods may use them)
    if (opts.dateFrom) params.date_from = opts.dateFrom
    if (opts.dateTo) params.date_to = opts.dateTo
  } else if (opts.dateFrom && opts.dateTo) {
    params.period = 'more'
    params.date_from = opts.dateFrom
    params.date_to = opts.dateTo
  } else {
    params.period = 'this_month'
  }

  return fakturowniaGet('/invoices.json', params)
}

export async function getPurchaseInvoice(id: number): Promise<any> {
  return fakturowniaGet(`/invoices/${id}.json`)
}

// ─── Summary helpers ───────────────────────────────────────

export interface InvoiceSummary {
  totalNet: number
  totalGross: number
  totalVat: number
  count: number
  bySupplier: Record<string, { count: number; gross: number }>
  byMonth: Record<string, { count: number; gross: number }>
}

export function summarizeInvoices(invoices: any[]): InvoiceSummary {
  const summary: InvoiceSummary = {
    totalNet: 0,
    totalGross: 0,
    totalVat: 0,
    count: invoices.length,
    bySupplier: {},
    byMonth: {},
  }

  for (const inv of invoices) {
    const net = parseFloat(inv.price_net) || 0
    const gross = parseFloat(inv.price_gross) || 0
    const vat = parseFloat(inv.price_tax) || 0

    summary.totalNet += net
    summary.totalGross += gross
    summary.totalVat += vat

    // Group by supplier — KSeF purchase invoices have seller/buyer swapped
    // (seller_name = our company, buyer_name = actual supplier)
    const supplier = inv.income === false
      ? (inv.buyer_name || inv.seller_name || 'Nieznany')
      : (inv.seller_name || inv.buyer_name || 'Nieznany')
    if (!summary.bySupplier[supplier]) summary.bySupplier[supplier] = { count: 0, gross: 0 }
    summary.bySupplier[supplier].count++
    summary.bySupplier[supplier].gross += gross

    // Group by month
    const month = (inv.issue_date || '').substring(0, 7) // yyyy-MM
    if (month) {
      if (!summary.byMonth[month]) summary.byMonth[month] = { count: 0, gross: 0 }
      summary.byMonth[month].count++
      summary.byMonth[month].gross += gross
    }
  }

  return summary
}
