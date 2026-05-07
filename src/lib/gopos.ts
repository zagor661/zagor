// GoPOS API Client — handles auth + API calls
// Docs: https://app.gopos.io/doc/swagger-ui/index.html

const GOPOS_BASE = 'https://app.gopos.io'

interface GoposToken {
  access_token: string
  token_type: string
  expires_in: number
  fetchedAt: number
}

let cachedToken: GoposToken | null = null

function getCredentials() {
  const clientId = process.env.GOPOS_CLIENT_ID
  const clientSecret = process.env.GOPOS_CLIENT_KEY
  const orgId = process.env.GOPOS_ORGANIZATION_ID
  if (!clientId || !clientSecret) throw new Error('Missing GOPOS_CLIENT_ID or GOPOS_CLIENT_KEY')
  if (!orgId) throw new Error('Missing GOPOS_ORGANIZATION_ID — required for token auth')
  return { clientId, clientSecret, orgId }
}

export async function getToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && (Date.now() - cachedToken.fetchedAt) < (cachedToken.expires_in - 60) * 1000) {
    return cachedToken.access_token
  }

  const { clientId, clientSecret, orgId } = getCredentials()

  const params = new URLSearchParams()
  params.append('grant_type', 'organization')
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  params.append('organization_id', orgId)

  const res = await fetch(`${GOPOS_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GoPOS auth failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  cachedToken = { ...data, fetchedAt: Date.now() }
  return data.access_token
}

export async function goposGet(path: string, params?: Record<string, string>): Promise<any> {
  const token = await getToken()
  const url = new URL(`${GOPOS_BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GoPOS API error ${res.status}: ${text}`)
  }

  return res.json()
}

// ─── Convenience methods ────────────────────────────────

export async function getMe() {
  return goposGet('/api/v3/me')
}

export async function getOrganization(orgId: string) {
  return goposGet(`/api/v3/${orgId}`)
}

export async function getItems(orgId: string) {
  return goposGet(`/api/v3/${orgId}/items`)
}

export async function getOrders(orgId: string, dateStart?: string, dateEnd?: string) {
  const params: Record<string, string> = { organization_id: orgId }
  if (dateStart) params.time_start = dateStart
  if (dateEnd) params.time_end = dateEnd
  return goposGet(`/api/v3/${orgId}/orders`, params)
}

export async function getOrderDetail(orgId: string, orderId: number) {
  return goposGet(`/api/v3/${orgId}/orders/${orderId}`)
}

export async function getOrderItems(orgId: string, orderId: number) {
  return goposGet(`/api/v3/${orgId}/orders/${orderId}/order_items`)
}

export async function getOrderItemsReport(orgId: string, dateStart: string, dateEnd: string) {
  // GoPOS reports API doesn't support closed_at date filtering (returns 500)
  // Use CREATED_AT_DATE grouping → server-side date filtering in route.ts
  return goposGet('/api/v3/reports/order_items', {
    organization_id: orgId,
    groups: 'NONE,CREATED_AT_DATE',
  })
}

export async function getOrderItemsReportByProduct(orgId: string, dateStart: string, dateEnd: string) {
  return goposGet('/api/v3/reports/order_items', {
    organization_id: orgId,
    groups: 'NONE,CREATED_AT_DATE,PRODUCT',
  })
}

export async function getAllOrderItems(orgId: string) {
  // Fetch all order items at org level (may include order_id field)
  return goposGet(`/api/v3/${orgId}/order_items`)
}

export async function getOrderItemsReportByTransaction(orgId: string) {
  return goposGet('/api/v3/reports/order_items', {
    organization_id: orgId,
    groups: 'NONE,TRANSACTION,PRODUCT',
  })
}

export async function getOrdersReport(orgId: string, dateStart: string, dateEnd: string) {
  // GoPOS reports API doesn't support closed_at date filtering (returns 500)
  // Use CREATED_AT_DATE grouping → server-side date filtering in route.ts
  return goposGet('/api/v3/reports/orders', {
    organization_id: orgId,
    groups: 'NONE,CREATED_AT_DATE',
  })
}

export async function getPosReports(orgId: string) {
  return goposGet(`/api/v3/${orgId}/pos_reports`)
}

export async function getCategories(orgId: string) {
  return goposGet(`/api/v3/${orgId}/categories`)
}

export async function getEmployees(orgId: string) {
  return goposGet(`/api/v3/${orgId}/employees`)
}

export async function getWorkTimes(orgId: string) {
  return goposGet(`/api/v3/${orgId}/work_times`)
}

export async function getPaymentMethods(orgId: string) {
  return goposGet(`/api/v3/${orgId}/payment_methods`)
}

export async function getOrderPaymentsReport(orgId: string, dateStart: string, dateEnd: string) {
  // GoPOS reports API doesn't support closed_at date filtering (returns 500)
  // Use CREATED_AT_DATE grouping → server-side date filtering in route.ts
  return goposGet('/api/v3/reports/order_payments', {
    organization_id: orgId,
    groups: 'NONE,CREATED_AT_DATE',
  })
}

export async function getInvoices(orgId: string) {
  return goposGet(`/api/v3/${orgId}/invoices`)
}

export async function getTaxes(orgId: string) {
  return goposGet(`/api/v3/${orgId}/taxes`)
}

export async function getDiscounts(orgId: string) {
  return goposGet(`/api/v3/${orgId}/discounts`)
}

export async function getMenus(orgId: string) {
  return goposGet(`/api/v3/${orgId}/menus`)
}
