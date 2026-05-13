'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUser } from '@/lib/useUser'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'
import supabase from '@/lib/supabase'

interface ItemSale {
  name: string
  quantity: number
  revenue: number
  net_revenue: number
}

interface InvoiceItem {
  item_name: string
  item_name_normalized: string
  quantity: number
  unit: string
  unit_price: number
  net_amount: number
  foodcost_price_per_kg: number | null
  price_per_kg_invoice: number | null
  price_diff_pct: number | null
  price_alert: string | null
}

interface Invoice {
  id: string
  supplier_name: string
  invoice_date: string
  net_total: number
  gross_total: number
  status: string
}

type Tab = 'overview' | 'recipes' | 'invoices'

export default function FoodCostPage() {
  const { user } = useUser()
  const [tab, setTab] = useState<Tab>('overview')
  const [itemSales, setItemSales] = useState<ItemSale[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!user?.location_id) return
    setLoading(true)
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]
      const month3Ago = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

      const [salesRes, invRes, invItemsRes] = await Promise.all([
        fetch(`/api/gopos?action=sales_by_item&date_start=${weekAgo}&date_end=${today}`),
        supabase.from('invoices').select('id, supplier_name, invoice_date, net_total, gross_total, status').eq('location_id', user.location_id).gte('invoice_date', month3Ago).order('invoice_date', { ascending: false }),
        supabase.from('invoice_items').select('item_name, item_name_normalized, quantity, unit, unit_price, net_amount, foodcost_price_per_kg, price_per_kg_invoice, price_diff_pct, price_alert').limit(500),
      ])

      if (salesRes.ok) {
        const data = await salesRes.json()
        setItemSales(data.data?.items || [])
      }

      setInvoices(invRes.data || [])
      setInvoiceItems(invItemsRes.data || [])
    } catch (err) {
      console.error('FoodCost fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.location_id])

  useEffect(() => { fetchData() }, [fetchData])

  const recipeAnalysis = useMemo(() => {
    return DEFAULT_RECIPES.map(recipe => {
      const cost = recipe.lines.reduce((s, l) => s + l.pricePerKg * l.quantity, 0)
      const pkg = recipe.packagingCost || 0
      const totalCost = cost + pkg
      const margin = recipe.sellingPrice - totalCost
      const fc = recipe.sellingPrice > 0 ? (totalCost / recipe.sellingPrice) * 100 : 0

      const sale = itemSales.find(s =>
        s.name === recipe.name || s.name.includes(recipe.name.replace(/^\d+\s+/, ''))
      )
      const qtySold = sale?.quantity || 0
      const revenue = sale?.revenue || 0
      const totalCostSold = totalCost * qtySold
      const totalMargin = revenue - totalCostSold

      return { ...recipe, ingredientCost: cost, packagingCost: pkg, totalCost, margin, fc, qtySold, revenue, totalCostSold, totalMargin }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [itemSales])

  const avgFC = useMemo(() => {
    const totalRev = recipeAnalysis.reduce((s, r) => s + r.revenue, 0)
    const totalCost = recipeAnalysis.reduce((s, r) => s + r.totalCostSold, 0)
    return totalRev > 0 ? (totalCost / totalRev) * 100 : 0
  }, [recipeAnalysis])

  const priceAlerts = useMemo(() => {
    return invoiceItems.filter(i => i.price_alert === 'higher' && (i.price_diff_pct || 0) > 10)
      .sort((a, b) => (b.price_diff_pct || 0) - (a.price_diff_pct || 0))
  }, [invoiceItems])

  const supplierSummary = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {}
    invoices.forEach(inv => {
      const key = inv.supplier_name || 'Nieznany'
      if (!map[key]) map[key] = { name: key, total: 0, count: 0 }
      map[key].total += inv.net_total || 0
      map[key].count++
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [invoices])

  const totalInvoiceNet = invoices.reduce((s, i) => s + (i.net_total || 0), 0)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Food Cost</h1>
          <p className="text-gray-500 text-sm mt-1">Receptury, marze, analiza kosztow</p>
        </div>
        <div className="flex gap-2">
          {([['overview', 'Przeglad'], ['recipes', 'Receptury'], ['invoices', 'Faktury']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                tab === key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4 animate-pulse">🥘</div>
          <p className="text-gray-500 text-sm">Ladowanie danych food cost...</p>
        </div>
      ) : (
        <>
          {/* ═══ OVERVIEW ═══ */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Sredni Food Cost</p>
                  <p className={`text-2xl font-black ${avgFC < 30 ? 'text-green-400' : avgFC < 35 ? 'text-amber-400' : 'text-red-400'}`}>
                    {avgFC.toFixed(1)}%
                  </p>
                  <p className="text-gray-600 text-[10px] mt-1">ostatnie 7 dni</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Receptury</p>
                  <p className="text-2xl font-black text-white">{DEFAULT_RECIPES.length}</p>
                  <p className="text-gray-600 text-[10px] mt-1">aktywnych dan</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Faktury (90 dni)</p>
                  <p className="text-2xl font-black text-white">{invoices.length}</p>
                  <p className="text-gray-600 text-[10px] mt-1">{Math.round(totalInvoiceNet).toLocaleString('pl')} zl netto</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Alerty cenowe</p>
                  <p className={`text-2xl font-black ${priceAlerts.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {priceAlerts.length}
                  </p>
                  <p className="text-gray-600 text-[10px] mt-1">drozsza niz receptura</p>
                </div>
              </div>

              {/* FC per dish gauges */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
                <h2 className="text-white font-bold text-sm mb-6 text-center">Food Cost % per danie (ostatnie 7 dni)</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {recipeAnalysis.map(r => (
                    <div key={r.id} className="text-center">
                      <div className="relative w-20 h-20 mx-auto mb-2">
                        <svg viewBox="0 0 36 36" className="w-full h-full">
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1f2937" strokeWidth="3" />
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none"
                            stroke={r.fc < 30 ? '#22c55e' : r.fc < 35 ? '#f59e0b' : '#ef4444'}
                            strokeWidth="3" strokeDasharray={`${r.fc}, 100`} strokeLinecap="round"
                          />
                          <text x="18" y="20" textAnchor="middle" className="text-[8px] font-bold" fill="white">{r.fc.toFixed(0)}%</text>
                        </svg>
                      </div>
                      <p className="text-white text-xs font-medium">{r.name.replace(/^\d+\s+/, '')}</p>
                      <p className="text-gray-600 text-[10px]">{r.qtySold} szt</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price alerts */}
              {priceAlerts.length > 0 && (
                <div className="bg-gray-900 border border-red-900/30 rounded-2xl p-6">
                  <h2 className="text-red-400 font-bold text-sm mb-4">Alerty cenowe — ceny wyzsze niz w recepturach</h2>
                  <div className="space-y-2">
                    {priceAlerts.slice(0, 10).map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                        <span className="text-white text-xs">{a.item_name}</span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-gray-400">Receptura: {a.foodcost_price_per_kg?.toFixed(2)} zl/kg</span>
                          <span className="text-red-400">Faktura: {a.price_per_kg_invoice?.toFixed(2)} zl/kg</span>
                          <span className="text-red-400 font-bold">+{a.price_diff_pct?.toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ RECIPES ═══ */}
          {tab === 'recipes' && (
            <div className="space-y-3">
              {recipeAnalysis.map(r => (
                <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedRecipe(expandedRecipe === r.id ? null : r.id)}
                    className="w-full p-5 flex items-center justify-between hover:bg-gray-800/30 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${r.fc < 30 ? 'bg-green-500' : r.fc < 35 ? 'bg-amber-500' : 'bg-red-500'}`} />
                      <div className="text-left">
                        <h3 className="text-white font-bold text-sm">{r.name}</h3>
                        <p className="text-gray-500 text-xs">{r.lines.length} skladnikow</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <div className="text-right"><p className="text-gray-400">Koszt</p><p className="text-white font-bold">{r.totalCost.toFixed(2)} zl</p></div>
                      <div className="text-right"><p className="text-gray-400">Cena</p><p className="text-white font-bold">{r.sellingPrice} zl</p></div>
                      <div className="text-right"><p className="text-gray-400">Marza</p><p className="text-green-400 font-bold">{r.margin.toFixed(2)} zl</p></div>
                      <div className="text-right"><p className="text-gray-400">FC%</p><p className={`font-bold ${r.fc < 30 ? 'text-green-400' : r.fc < 35 ? 'text-amber-400' : 'text-red-400'}`}>{r.fc.toFixed(1)}%</p></div>
                      <div className="text-right min-w-[60px]"><p className="text-gray-400">Sprzedaz</p><p className="text-white font-bold">{r.qtySold} szt</p></div>
                      <span className="text-gray-600 text-lg">{expandedRecipe === r.id ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expandedRecipe === r.id && (
                    <div className="px-5 pb-5 border-t border-gray-800">
                      <table className="w-full text-xs mt-3">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-2">Skladnik</th>
                            <th className="text-right py-2">Ilosc (g)</th>
                            <th className="text-right py-2">Cena/kg</th>
                            <th className="text-right py-2">Koszt</th>
                            <th className="text-right py-2">Udzial</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map((line, i) => {
                            const lineCost = line.pricePerKg * line.quantity
                            const share = r.ingredientCost > 0 ? (lineCost / r.ingredientCost) * 100 : 0
                            return (
                              <tr key={i} className="border-t border-gray-800/50">
                                <td className="py-2 text-white">{line.productName}</td>
                                <td className="py-2 text-right text-gray-400">{Math.round(line.quantity * 1000)}g</td>
                                <td className="py-2 text-right text-gray-400">{line.pricePerKg.toFixed(2)} zl</td>
                                <td className="py-2 text-right text-white font-medium">{lineCost.toFixed(2)} zl</td>
                                <td className="py-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 bg-gray-800 rounded-full h-1.5">
                                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${share}%` }} />
                                    </div>
                                    <span className="text-gray-500 w-8 text-right">{share.toFixed(0)}%</span>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="border-t border-gray-700">
                            <td className="py-2 text-gray-400">Opakowanie</td>
                            <td className="py-2 text-right text-gray-600">—</td>
                            <td className="py-2 text-right text-gray-600">—</td>
                            <td className="py-2 text-right text-white font-medium">{(r.packagingCost || 0).toFixed(2)} zl</td>
                            <td />
                          </tr>
                          <tr className="border-t-2 border-gray-700">
                            <td className="py-2 text-white font-bold">RAZEM</td>
                            <td /><td />
                            <td className="py-2 text-right text-white font-bold">{r.totalCost.toFixed(2)} zl</td>
                            <td className="py-2 text-right text-gray-400">100%</td>
                          </tr>
                        </tbody>
                      </table>

                      {r.qtySold > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-800 grid grid-cols-3 gap-4 text-xs">
                          <div><p className="text-gray-500">Sprzedaz (7 dni)</p><p className="text-white font-bold">{r.qtySold} szt = {Math.round(r.revenue)} zl</p></div>
                          <div><p className="text-gray-500">Koszt surowcow</p><p className="text-white font-bold">{Math.round(r.totalCostSold)} zl</p></div>
                          <div><p className="text-gray-500">Zysk brutto</p><p className="text-green-400 font-bold">{Math.round(r.totalMargin)} zl</p></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div className="bg-gray-900 border border-indigo-900/30 rounded-2xl p-6 mt-4">
                <h3 className="text-indigo-400 font-bold text-sm mb-3">Podsumowanie receptur</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div><p className="text-gray-500">Sredni koszt dania</p><p className="text-white font-bold">{(recipeAnalysis.reduce((s, r) => s + r.totalCost, 0) / recipeAnalysis.length).toFixed(2)} zl</p></div>
                  <div><p className="text-gray-500">Srednia marza</p><p className="text-green-400 font-bold">{(recipeAnalysis.reduce((s, r) => s + r.margin, 0) / recipeAnalysis.length).toFixed(2)} zl</p></div>
                  <div><p className="text-gray-500">Najnizszy FC</p><p className="text-green-400 font-bold">{Math.min(...recipeAnalysis.map(r => r.fc)).toFixed(1)}%</p></div>
                  <div><p className="text-gray-500">Najwyzszy FC</p><p className="text-red-400 font-bold">{Math.max(...recipeAnalysis.map(r => r.fc)).toFixed(1)}%</p></div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ INVOICES ═══ */}
          {tab === 'invoices' && (
            <>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
                <h2 className="text-white font-bold text-sm mb-4">Dostawcy (ostatnie 90 dni)</h2>
                {supplierSummary.length > 0 ? (
                  <div className="space-y-2">
                    {supplierSummary.map((s, i) => {
                      const pct = totalInvoiceNet > 0 ? (s.total / totalInvoiceNet) * 100 : 0
                      return (
                        <div key={i} className="flex items-center gap-4">
                          <span className="text-white text-xs font-medium w-40 truncate">{s.name}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, 3)}%` }}>
                              {pct > 15 && <span className="text-[9px] text-white font-bold">{Math.round(s.total)} zl</span>}
                            </div>
                          </div>
                          <span className="text-gray-400 text-xs w-20 text-right">{Math.round(s.total)} zl</span>
                          <span className="text-gray-600 text-xs w-12 text-right">{s.count} fv</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs text-center py-4">Brak faktur w systemie</p>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-bold text-sm mb-4">Ostatnie faktury</h2>
                {invoices.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left py-3 px-2">Data</th>
                        <th className="text-left py-3 px-2">Dostawca</th>
                        <th className="text-right py-3 px-2">Netto</th>
                        <th className="text-right py-3 px-2">Brutto</th>
                        <th className="text-right py-3 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.slice(0, 30).map(inv => (
                        <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-3 px-2 text-gray-400">{inv.invoice_date}</td>
                          <td className="py-3 px-2 text-white font-medium">{inv.supplier_name || '—'}</td>
                          <td className="py-3 px-2 text-right text-white">{Math.round(inv.net_total || 0)} zl</td>
                          <td className="py-3 px-2 text-right text-gray-400">{Math.round(inv.gross_total || 0)} zl</td>
                          <td className="py-3 px-2 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.status === 'verified' ? 'bg-green-900/30 text-green-400' :
                              inv.status === 'paid' ? 'bg-blue-900/30 text-blue-400' :
                              'bg-amber-900/30 text-amber-400'
                            }`}>
                              {inv.status === 'verified' ? 'Zweryfikowana' : inv.status === 'paid' ? 'Zaplacona' : 'Nowa'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-500 text-xs text-center py-4">Brak faktur — skanuj faktury w aplikacji mobilnej</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
