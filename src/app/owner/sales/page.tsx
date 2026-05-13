'use client'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/lib/useUser'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

interface DailySale {
  date: string
  revenue: number
  net_revenue: number
  quantity: number
  transactions: number
}

interface ItemSale {
  name: string
  quantity: number
  revenue: number
  net_revenue: number
  transactions: number
  discount: number
}

type Period = '7d' | '30d' | 'month'

export default function SalesPage() {
  const { user } = useUser()
  const [period, setPeriod] = useState<Period>('7d')
  const [dailySales, setDailySales] = useState<DailySale[]>([])
  const [itemSales, setItemSales] = useState<ItemSale[]>([])
  const [loading, setLoading] = useState(true)

  const getDateRange = useCallback(() => {
    const now = new Date()
    const end = now.toISOString().split('T')[0]
    let start: string
    if (period === '7d') {
      start = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    } else if (period === '30d') {
      start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
    } else {
      start = end.slice(0, 7) + '-01'
    }
    return { start, end }
  }, [period])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange()
      const [salesRes, itemsRes] = await Promise.all([
        fetch(`/api/gopos?action=sales&date_start=${start}&date_end=${end}`),
        fetch(`/api/gopos?action=sales_by_item&date_start=${start}&date_end=${end}`),
      ])

      if (salesRes.ok) {
        const data = await salesRes.json()
        const daily = data.data?.daily || []
        setDailySales(daily.sort((a: DailySale, b: DailySale) => a.date.localeCompare(b.date)))
      }

      if (itemsRes.ok) {
        const data = await itemsRes.json()
        const items = data.data?.items || []
        setItemSales(items.sort((a: ItemSale, b: ItemSale) => (b.revenue || 0) - (a.revenue || 0)))
      }
    } catch (err) {
      console.error('Sales fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [getDateRange])

  useEffect(() => { fetchSales() }, [fetchSales])

  const totalRevenue = dailySales.reduce((s, d) => s + (d.revenue || 0), 0)
  const totalNet = dailySales.reduce((s, d) => s + (d.net_revenue || 0), 0)
  const totalQty = dailySales.reduce((s, d) => s + (d.quantity || 0), 0)
  const totalTx = dailySales.reduce((s, d) => s + (d.transactions || 0), 0)
  const avgPerDay = dailySales.length > 0 ? totalRevenue / dailySales.length : 0
  const avgTicket = totalTx > 0 ? totalRevenue / totalTx : 0
  const maxDayRevenue = Math.max(...dailySales.map(d => d.revenue || 0), 1)

  const itemsWithFC = itemSales.map(item => {
    const recipe = DEFAULT_RECIPES.find(r =>
      r.name === item.name || item.name.includes(r.name.replace(/^\d+\s+/, ''))
    )
    let costPerPortion = 0
    if (recipe) {
      costPerPortion = recipe.lines.reduce((s, l) => s + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)
    }
    const totalCost = costPerPortion * (item.quantity || 0)
    const fc = item.revenue > 0 ? (totalCost / item.revenue) * 100 : 0
    return { ...item, costPerPortion, totalCost, fc, hasRecipe: !!recipe }
  })

  const totalFoodCost = itemsWithFC.reduce((s, i) => s + i.totalCost, 0)
  const overallFC = totalRevenue > 0 ? (totalFoodCost / totalRevenue) * 100 : 0

  const dayNames = ['Nd', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So']
  const dayStats: Record<number, { revenue: number; count: number }> = {}
  dailySales.forEach(d => {
    const dow = new Date(d.date).getDay()
    if (!dayStats[dow]) dayStats[dow] = { revenue: 0, count: 0 }
    dayStats[dow].revenue += d.revenue || 0
    dayStats[dow].count++
  })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Sprzedaz</h1>
          <p className="text-gray-500 text-sm mt-1">Dane z GoPOS — {user?.location_name}</p>
        </div>
        <div className="flex gap-2">
          {([['7d', '7 dni'], ['30d', '30 dni'], ['month', 'Miesiac']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                period === key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4 animate-pulse">📊</div>
          <p className="text-gray-500 text-sm">Ladowanie danych sprzedazy...</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Przychod brutto', value: `${Math.round(totalRevenue).toLocaleString('pl')} zl`, color: 'from-green-500 to-emerald-600' },
              { label: 'Przychod netto', value: `${Math.round(totalNet).toLocaleString('pl')} zl`, color: 'from-blue-500 to-cyan-600' },
              { label: 'Sprzedane dania', value: totalQty.toString(), color: 'from-purple-500 to-pink-600' },
              { label: 'Sredni paragon', value: `${Math.round(avgTicket)} zl`, color: 'from-amber-500 to-orange-600' },
              { label: 'Food Cost', value: `${overallFC.toFixed(1)}%`, color: overallFC < 30 ? 'from-green-500 to-emerald-600' : overallFC < 35 ? 'from-amber-500 to-orange-600' : 'from-red-500 to-red-600' },
            ].map((kpi, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-gray-500 text-xs mb-1">{kpi.label}</p>
                <p className={`text-xl font-black bg-gradient-to-r ${kpi.color} bg-clip-text text-transparent`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Daily Revenue Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <h2 className="text-white font-bold text-sm mb-4">Przychod dzienny</h2>
            <div className="flex items-end gap-1 h-48">
              {dailySales.map((d, i) => {
                const h = maxDayRevenue > 0 ? ((d.revenue || 0) / maxDayRevenue) * 100 : 0
                const dateStr = new Date(d.date).toLocaleDateString('pl', { day: '2-digit', month: '2-digit' })
                return (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute -top-8 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {dateStr}: {Math.round(d.revenue || 0)} zl | {d.quantity || 0} szt
                    </div>
                    <div
                      className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-md hover:from-indigo-500 hover:to-indigo-300 transition-all cursor-pointer"
                      style={{ height: `${Math.max(h, 2)}%`, minHeight: '2px' }}
                    />
                    {dailySales.length <= 14 && (
                      <span className="text-[9px] text-gray-600 mt-1">{dateStr}</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-gray-600">
              <span>Srednia/dzien: {Math.round(avgPerDay).toLocaleString('pl')} zl</span>
              <span>{dailySales.length} dni | {totalTx} transakcji</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Day of Week */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-white font-bold text-sm mb-4">Srednia wg dnia tygodnia</h2>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 0].map(dow => {
                  const stat = dayStats[dow]
                  if (!stat) return null
                  const avg = stat.count > 0 ? stat.revenue / stat.count : 0
                  const maxAvg = Math.max(...Object.values(dayStats).map(s => s.count > 0 ? s.revenue / s.count : 0), 1)
                  const pct = (avg / maxAvg) * 100
                  return (
                    <div key={dow} className="flex items-center gap-3">
                      <span className="text-gray-400 text-xs w-6">{dayNames[dow]}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(pct, 5)}%` }}
                        >
                          <span className="text-[9px] text-white font-bold">{Math.round(avg)} zl</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-white font-bold text-sm mb-4">Podsumowanie okresu</h2>
              <div className="space-y-4">
                {[
                  { label: 'Przychod brutto', value: `${Math.round(totalRevenue).toLocaleString('pl')} zl`, color: 'text-white' },
                  { label: 'Przychod netto', value: `${Math.round(totalNet).toLocaleString('pl')} zl`, color: 'text-white' },
                  { label: 'Koszt surowcow', value: `${Math.round(totalFoodCost).toLocaleString('pl')} zl`, color: 'text-white' },
                  { label: 'Marza brutto', value: `${Math.round(totalRevenue - totalFoodCost).toLocaleString('pl')} zl`, color: 'text-green-400' },
                  { label: 'Food Cost %', value: `${overallFC.toFixed(1)}%`, color: overallFC < 30 ? 'text-green-400' : overallFC < 35 ? 'text-amber-400' : 'text-red-400' },
                  { label: 'Transakcje', value: totalTx.toString(), color: 'text-white' },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                    <span className="text-gray-400 text-xs">{row.label}</span>
                    <span className={`font-bold text-sm ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-white font-bold text-sm mb-4">Ranking produktow</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-3 px-2">#</th>
                    <th className="text-left py-3 px-2">Produkt</th>
                    <th className="text-right py-3 px-2">Ilosc</th>
                    <th className="text-right py-3 px-2">Przychod</th>
                    <th className="text-right py-3 px-2">Koszt</th>
                    <th className="text-right py-3 px-2">Marza</th>
                    <th className="text-right py-3 px-2">FC%</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsWithFC.map((item, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-3 px-2 text-gray-600">{i + 1}</td>
                      <td className="py-3 px-2 text-white font-medium">
                        {item.name}
                        {!item.hasRecipe && <span className="text-gray-600 ml-1 text-[10px]">(brak receptury)</span>}
                      </td>
                      <td className="py-3 px-2 text-right text-white">{item.quantity || 0}</td>
                      <td className="py-3 px-2 text-right text-white">{Math.round(item.revenue || 0)} zl</td>
                      <td className="py-3 px-2 text-right text-gray-400">
                        {item.hasRecipe ? `${Math.round(item.totalCost)} zl` : '—'}
                      </td>
                      <td className="py-3 px-2 text-right text-green-400">
                        {item.hasRecipe ? `${Math.round((item.revenue || 0) - item.totalCost)} zl` : '—'}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {item.hasRecipe ? (
                          <span className={`font-bold ${item.fc < 30 ? 'text-green-400' : item.fc < 35 ? 'text-amber-400' : 'text-red-400'}`}>
                            {item.fc.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
