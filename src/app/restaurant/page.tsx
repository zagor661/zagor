'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'

interface SalesItem {
  name: string
  quantity: number
  total_price: { amount: number; currency: string }
  category_name?: string
}

interface OrderStats {
  total_orders: number
  total_revenue: number
  avg_order: number
}

type Period = 'today' | 'week' | 'month'

export default function RestaurantPage() {
  const router = useRouter()
  const { user } = useUser()
  const [period, setPeriod] = useState<Period>('today')
  const [salesData, setSalesData] = useState<any>(null)
  const [ordersData, setOrdersData] = useState<any>(null)
  const [paymentsData, setPaymentsData] = useState<any>(null)
  const [employeesData, setEmployeesData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Access control
  useEffect(() => {
    if (user && !isAdminRole(user.role)) {
      router.push('/')
    }
  }, [user, router])

  // Fetch data on period change
  useEffect(() => {
    fetchData(period)
  }, [period])

  async function fetchData(p: Period) {
    setLoading(true)
    setError('')

    const { start, end } = getDateRange(p)

    try {
      const [salesRes, ordersRes, paymentsRes, employeesRes] = await Promise.all([
        fetch(`/api/gopos?action=sales&date_start=${start}&date_end=${end}`),
        fetch(`/api/gopos?action=orders&date_start=${start}&date_end=${end}`),
        fetch(`/api/gopos?action=payments&date_start=${start}&date_end=${end}`),
        fetch(`/api/gopos?action=employees`),
      ])

      const [sales, orders, payments, employees] = await Promise.all([
        salesRes.json(),
        ordersRes.json(),
        paymentsRes.json(),
        employeesRes.json(),
      ])

      if (sales.ok) setSalesData(sales.data)
      if (orders.ok) setOrdersData(orders.data)
      if (payments.ok) setPaymentsData(payments.data)
      if (employees.ok) setEmployeesData(employees.data)

      if (!sales.ok && !orders.ok) {
        setError('Nie udalo sie polaczyc z GoPOS. Sprawdz env vars na Vercel.')
      }
    } catch {
      setError('Blad polaczenia z serwerem')
    }

    setLoading(false)
  }

  // ─── Parse data ───
  const stats = parseOrderStats(ordersData)
  const topItems = parseTopItems(salesData)
  const paymentBreakdown = parsePayments(paymentsData)
  const employeeCount = employeesData?.data?.length || 0

  const periodLabels: Record<Period, string> = {
    today: 'Dzisiaj',
    week: 'Ten tydzien',
    month: 'Ten miesiac',
  }

  if (!user || !isAdminRole(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Moja restauracja</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {user.location_name || 'KitchenOps'} — dane live z GoPOS
            </p>
          </div>
          <button onClick={() => router.push('/')} className="text-brand-600 text-sm font-medium">
            ← Pulpit
          </button>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-6">
          {(['today', 'week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                period === p
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium mb-4">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
          </div>
        ) : (
          <>
            {/* ─── Revenue cards ─── */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard
                label="Obrot"
                value={formatMoney(stats.total_revenue)}
                icon="💰"
                bg="bg-emerald-50"
                color="text-emerald-700"
              />
              <StatCard
                label="Zamowienia"
                value={String(stats.total_orders)}
                icon="🧾"
                bg="bg-blue-50"
                color="text-blue-700"
              />
              <StatCard
                label="Sr. zamowienie"
                value={formatMoney(stats.avg_order)}
                icon="📊"
                bg="bg-violet-50"
                color="text-violet-700"
              />
              <StatCard
                label="Pracownicy"
                value={String(employeeCount)}
                icon="👥"
                bg="bg-amber-50"
                color="text-amber-700"
              />
            </div>

            {/* ─── Top selling items ─── */}
            <section className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Bestsellery</h2>
              {topItems.length === 0 ? (
                <div className="card text-center py-6 text-gray-400 text-sm">
                  Brak danych sprzedazowych za ten okres
                </div>
              ) : (
                <div className="space-y-2">
                  {topItems.map((item, i) => (
                    <div key={i} className="card flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-gray-100 text-gray-600' :
                        i === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-50 text-gray-500'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm truncate">{item.name}</div>
                        <div className="text-xs text-gray-400">{item.category || ''}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-gray-900 text-sm">{formatMoney(item.revenue)}</div>
                        <div className="text-xs text-gray-400">{item.qty}x sprzedanych</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ─── Payment breakdown ─── */}
            {paymentBreakdown.length > 0 && (
              <section className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Platnosci</h2>
                <div className="card space-y-3">
                  {paymentBreakdown.map((pm, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getPaymentIcon(pm.name)}</span>
                        <span className="text-sm font-medium text-gray-700">{pm.name}</span>
                      </div>
                      <div className="text-sm font-bold text-gray-900">{formatMoney(pm.amount)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ─── Quick links ─── */}
            <section className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Szybki dostep</h2>
              <div className="grid grid-cols-2 gap-3">
                <QuickLink icon="💰" title="Food Cost" subtitle="Receptury i koszty" href="/food-cost" />
                <QuickLink icon="📈" title="Raport dzienny" subtitle="Podsumowanie zmiany" href="/daily-report" />
                <QuickLink icon="🧾" title="Faktury" subtitle="Skanuj i porownuj" href="/faktury" />
                <QuickLink icon="📅" title="Grafik" subtitle="Zespol i zmiany" href="/schedule" />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Components ───

function StatCard({ label, value, icon, bg, color }: {
  label: string; value: string; icon: string; bg: string; color: string
}) {
  return (
    <div className={`${bg} rounded-2xl p-4`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function QuickLink({ icon, title, subtitle, href }: {
  icon: string; title: string; subtitle: string; href: string
}) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(href)}
      className="card text-left hover:border-brand-300 hover:shadow-md transition-all active:scale-98"
    >
      <span className="text-xl">{icon}</span>
      <div className="font-semibold text-gray-900 text-sm mt-1">{title}</div>
      <div className="text-xs text-gray-400">{subtitle}</div>
    </button>
  )
}

// ─── Helpers ───

function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString().split('T')[0]

  switch (period) {
    case 'today':
      return { start: end, end }
    case 'week': {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return { start: d.toISOString().split('T')[0], end }
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: d.toISOString().split('T')[0], end }
    }
  }
}

function parseOrderStats(data: any): OrderStats {
  if (!data?.data) return { total_orders: 0, total_revenue: 0, avg_order: 0 }

  const items = Array.isArray(data.data) ? data.data : [data.data]
  let totalOrders = 0
  let totalRevenue = 0

  for (const item of items) {
    if (item.orders_count != null) totalOrders += item.orders_count
    if (item.total_price?.amount != null) totalRevenue += item.total_price.amount
    if (item.net_price?.amount != null && totalRevenue === 0) totalRevenue += item.net_price.amount
  }

  // Fallback: if report format is different, try counting array
  if (totalOrders === 0 && items.length > 0) totalOrders = items.length

  return {
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    avg_order: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  }
}

function parseTopItems(data: any): { name: string; qty: number; revenue: number; category: string }[] {
  if (!data?.data) return []

  const items = Array.isArray(data.data) ? data.data : []

  // Group by item name
  const grouped: Record<string, { qty: number; revenue: number; category: string }> = {}

  for (const item of items) {
    const name = item.item_name || item.name || 'Nieznany'
    const category = item.category_name || item.category || ''
    const qty = item.quantity || item.count || 1
    const revenue = item.total_price?.amount || item.price?.amount || 0

    if (!grouped[name]) {
      grouped[name] = { qty: 0, revenue: 0, category }
    }
    grouped[name].qty += qty
    grouped[name].revenue += revenue
  }

  return Object.entries(grouped)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
}

function parsePayments(data: any): { name: string; amount: number }[] {
  if (!data?.data) return []

  const items = Array.isArray(data.data) ? data.data : [data.data]
  const grouped: Record<string, number> = {}

  for (const item of items) {
    const name = item.payment_method_name || item.name || 'Inne'
    const amount = item.total_price?.amount || item.amount?.amount || item.total || 0
    if (!grouped[name]) grouped[name] = 0
    grouped[name] += amount
  }

  return Object.entries(grouped)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
}

function formatMoney(amount: number): string {
  if (!amount || isNaN(amount)) return '0 zl'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getPaymentIcon(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('gotowk') || lower.includes('cash')) return '💵'
  if (lower.includes('kart') || lower.includes('card')) return '💳'
  if (lower.includes('online') || lower.includes('przelew')) return '🌐'
  if (lower.includes('blik')) return '📱'
  return '💰'
}
