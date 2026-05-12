'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { pl } from 'date-fns/locale'

interface FakturowniaInvoice {
  id: number
  number: string
  issue_date: string
  seller_name: string
  price_net: string
  price_gross: string
  price_tax: string
  status: string
  payment_to: string | null
  currency: string
  positions: FakturowniaPosition[]
  description: string | null
  buyer_name: string | null
}

interface FakturowniaPosition {
  id: number
  name: string
  quantity: string
  total_price_net: string
  total_price_gross: string
  tax: string
  unit: string | null
}

interface Summary {
  totalNet: number
  totalGross: number
  totalVat: number
  count: number
  bySupplier: Record<string, { count: number; gross: number }>
}

type PeriodType = 'this_month' | 'last_month' | 'custom'

export default function FakturyZakupowePage() {
  const { user, loading: authLoading } = useUser()
  const [invoices, setInvoices] = useState<FakturowniaInvoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<FakturowniaInvoice | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [period, setPeriod] = useState<PeriodType>('this_month')
  const [customMonth, setCustomMonth] = useState(new Date())
  const [page, setPage] = useState(1)

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (authLoading || !user || !isAdmin) return
    loadInvoices()
  }, [user, authLoading, period, customMonth, page])

  async function loadInvoices() {
    setLoadingData(true)
    setError('')
    try {
      let url = `/api/fakturownia?page=${page}`

      if (period === 'custom') {
        const from = format(startOfMonth(customMonth), 'yyyy-MM-dd')
        const to = format(endOfMonth(customMonth), 'yyyy-MM-dd')
        url += `&period=more&date_from=${from}&date_to=${to}`
      } else {
        url += `&period=${period}`
      }

      const res = await fetch(url)
      const json = await res.json()

      if (!json.ok) {
        setError(json.error || 'Blad API')
        setInvoices([])
        setSummary(null)
      } else {
        setInvoices(json.data || [])
        setSummary(json.summary || null)
      }
    } catch (err: any) {
      setError(err.message)
    }
    setLoadingData(false)
  }

  async function loadDetail(id: number) {
    setLoadingDetail(true)
    setSelectedId(id)
    try {
      const res = await fetch(`/api/fakturownia?action=detail&id=${id}`)
      const json = await res.json()
      if (json.ok) setDetail(json.data)
    } catch {}
    setLoadingDetail(false)
  }

  if (authLoading || !user) return null
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-stone-50 p-4 flex items-center justify-center">
        <p className="text-gray-400">Dostep tylko dla managera i ownera</p>
      </div>
    )
  }

  const periodLabel = period === 'this_month' ? 'Ten miesiac' :
    period === 'last_month' ? 'Ostatni miesiac' :
    format(customMonth, 'LLLL yyyy', { locale: pl })

  // Top suppliers sorted by gross
  const topSuppliers = summary?.bySupplier
    ? Object.entries(summary.bySupplier)
        .sort((a, b) => b[1].gross - a[1].gross)
        .slice(0, 10)
    : []

  return (
    <div className="min-h-screen bg-stone-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Faktury zakupowe</h1>
            <p className="text-xs text-gray-400">Fakturownia · KSeF</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
          {([['this_month', 'Ten mies.'], ['last_month', 'Poprzedni'], ['custom', 'Wybierz']] as [PeriodType, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setPeriod(key); setPage(1) }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                period === key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom month picker */}
        {period === 'custom' && (
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
            <button
              onClick={() => { setCustomMonth(subMonths(customMonth, 1)); setPage(1) }}
              className="p-1 rounded-lg hover:bg-gray-100 active:scale-95"
            >
              <span className="text-lg">◀</span>
            </button>
            <span className="font-bold text-sm capitalize">
              {format(customMonth, 'LLLL yyyy', { locale: pl })}
            </span>
            <button
              onClick={() => { setCustomMonth(addMonths(customMonth, 1)); setPage(1) }}
              className="p-1 rounded-lg hover:bg-gray-100 active:scale-95"
            >
              <span className="text-lg">▶</span>
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Summary */}
        {summary && !selectedId && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{periodLabel}</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xl font-bold text-gray-900">{summary.count}</div>
                <div className="text-[10px] text-gray-400">faktur</div>
              </div>
              <div>
                <div className="text-xl font-bold text-gray-900">{summary.totalGross.toFixed(0)} zl</div>
                <div className="text-[10px] text-gray-400">brutto</div>
              </div>
              <div>
                <div className="text-xl font-bold text-gray-900">{summary.totalNet.toFixed(0)} zl</div>
                <div className="text-[10px] text-gray-400">netto</div>
              </div>
            </div>
          </div>
        )}

        {/* Top suppliers */}
        {topSuppliers.length > 0 && !selectedId && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Top dostawcy</div>
            </div>
            <div className="divide-y divide-gray-50">
              {topSuppliers.map(([name, data]) => {
                const maxGross = topSuppliers[0]?.[1]?.gross || 1
                const pct = Math.round((data.gross / maxGross) * 100)
                return (
                  <div key={name} className="px-4 py-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 truncate mr-2">{name}</span>
                      <span className="font-bold text-gray-900 whitespace-nowrap">{data.gross.toFixed(0)} zl</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{data.count} fv</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Invoice list */}
        {!selectedId && (
          <>
            {loadingData && <div className="text-center text-gray-300 py-8 text-sm">Pobieram z Fakturowni...</div>}

            {!loadingData && invoices.length === 0 && !error && (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-sm text-gray-300">Brak faktur zakupowych w tym okresie</p>
              </div>
            )}

            <div className="space-y-2">
              {invoices.map(inv => (
                <button
                  key={inv.id}
                  onClick={() => loadDetail(inv.id)}
                  className="w-full bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{inv.seller_name || 'Brak sprzedawcy'}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {inv.number} · {new Date(inv.issue_date).toLocaleDateString('pl-PL')}
                      </div>
                      {inv.payment_to && (
                        <div className="text-[10px] text-gray-300 mt-0.5">
                          Termin: {new Date(inv.payment_to).toLocaleDateString('pl-PL')}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <div className="text-sm font-bold text-gray-900">{parseFloat(inv.price_gross).toFixed(2)} zl</div>
                      <div className="text-[10px] text-gray-400">brutto</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {invoices.length >= 25 && (
              <div className="flex justify-center gap-3 pt-2">
                {page > 1 && (
                  <button onClick={() => setPage(page - 1)} className="px-4 py-2 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-600 active:scale-95">
                    ← Poprzednia
                  </button>
                )}
                <button onClick={() => setPage(page + 1)} className="px-4 py-2 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-600 active:scale-95">
                  Nastepna →
                </button>
              </div>
            )}
          </>
        )}

        {/* Invoice Detail */}
        {selectedId && (
          <div className="space-y-4">
            <button onClick={() => { setSelectedId(null); setDetail(null) }} className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Powrot do listy
            </button>

            {loadingDetail && <div className="text-center text-gray-300 py-8 text-sm">Laduje szczegoly...</div>}

            {detail && (
              <>
                {/* Header Card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="text-lg font-bold text-gray-900 mb-1">{detail.seller_name || 'Brak sprzedawcy'}</div>
                  <div className="text-xs text-gray-400 mb-3">
                    {detail.number} · {new Date(detail.issue_date).toLocaleDateString('pl-PL')}
                    {detail.payment_to && <> · termin {new Date(detail.payment_to).toLocaleDateString('pl-PL')}</>}
                  </div>

                  {detail.description && (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 mb-3">{detail.description}</div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                      <div className="text-lg font-bold text-gray-900">{parseFloat(detail.price_net).toFixed(2)}</div>
                      <div className="text-[9px] text-gray-400 uppercase">netto</div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                      <div className="text-lg font-bold text-gray-900">{parseFloat(detail.price_tax).toFixed(2)}</div>
                      <div className="text-[9px] text-gray-400 uppercase">VAT</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                      <div className="text-lg font-bold text-blue-700">{parseFloat(detail.price_gross).toFixed(2)}</div>
                      <div className="text-[9px] text-gray-400 uppercase">brutto</div>
                    </div>
                  </div>
                </div>

                {/* Positions */}
                {detail.positions && detail.positions.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        Pozycje ({detail.positions.length})
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {detail.positions.map(pos => (
                        <div key={pos.id} className="px-4 py-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">{pos.name}</div>
                              <div className="text-[10px] text-gray-400">
                                {pos.quantity} {pos.unit || 'szt'} · VAT {pos.tax}%
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-sm font-bold text-gray-900">{parseFloat(pos.total_price_gross).toFixed(2)} zl</div>
                              <div className="text-[10px] text-gray-400">netto {parseFloat(pos.total_price_net).toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
