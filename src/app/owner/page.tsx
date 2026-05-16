'use client'
import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/lib/useUser'
import supabase from '@/lib/supabase'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'
import Link from 'next/link'

interface DailySale { date: string; revenue: number; net_revenue: number; quantity: number; transactions: number }
interface ItemSale { name: string; quantity: number; revenue: number }
interface Issue { id: string; title: string; status: string; created_at: string }
interface WastLog { item_name: string; quantity: number; estimated_value: number; created_at: string }
interface CostCat { gross: number; count: number; pctOfRevenue: number; bySupplier: { name: string; gross: number }[] }
interface PnlData {
  revenue: { total: number; transactions: number; avgPerDay: number }
  purchases: {
    total: { gross: number; invoiceCount: number; pctOfRevenue: number }
    food: CostCat; beverage: CostCat; other: CostCat
  }
  foodCost: { actual: number; actualPct: number; theoretical: number; theoreticalPct: number; difference: number; differencePct: number }
  labor: { total: number; hours: number; pctOfRevenue: number; byWorker: { name: string; hours: number; cost: number }[] }
  profitLoss: { amount: number; pctOfRevenue: number; isProfit: boolean; perDay: number }
  period: { start: string; end: string; days: number }
}

export default function OwnerDashboard() {
  const { user } = useUser()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [dailySales, setDailySales] = useState<DailySale[]>([])
  const [topDishes, setTopDishes] = useState<ItemSale[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalFoodCost, setTotalFoodCost] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tasksDone, setTasksDone] = useState(0)
  const [tasksTotal, setTasksTotal] = useState(0)
  const [mealCount, setMealCount] = useState(0)
  const [checklistCount, setChecklistCount] = useState(0)
  const [issuesOpen, setIssuesOpen] = useState<Issue[]>([])
  const [wasteLogs, setWasteLogs] = useState<WastLog[]>([])
  const [todayShifts, setTodayShifts] = useState<any[]>([])
  const [workerHours, setWorkerHours] = useState<{ name: string; hours: number; cost: number }[]>([])
  const [totalLabor, setTotalLabor] = useState(0)
  const [tempAlerts, setTempAlerts] = useState<any[]>([])
  const [aiAlerts, setAiAlerts] = useState<{ id: string; type: string; severity: string; title: string; description: string; created_at: string; is_read: boolean }[]>([])
  const [aiUnreadCount, setAiUnreadCount] = useState(0)
  const [pnl, setPnl] = useState<PnlData | null>(null)
  const [pnlLoading, setPnlLoading] = useState(true)
  const [pnlExpanded, setPnlExpanded] = useState(false)

  const getRange = useCallback(() => {
    const end = new Date().toISOString().split('T')[0]
    const start = period === 'week'
      ? new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]
      : end.slice(0, 7) + '-01'
    return { start, end }
  }, [period])

  const fetchData = useCallback(async () => {
    if (!user?.location_id) return
    setLoading(true)

    try {
      const { start, end } = getRange()
      const today = new Date().toISOString().split('T')[0]

      // ─── Parallel fetches ────────────────────────────
      const [
        salesRes, itemsRes, workRes,
        tasksAllRes, tasksDoneRes,
        checkRes, mealsCountRes,
        issuesRes, wasteRes, shiftsRes, tempsRes,
      ] = await Promise.all([
        fetch(`/api/gopos?action=sales&date_start=${start}&date_end=${end}`).catch(() => null),
        fetch(`/api/gopos?action=sales_by_item&date_start=${start}&date_end=${end}`).catch(() => null),
        fetch(`/api/gopos?action=work_times_all`).catch(() => null),
        supabase.from('worker_tasks').select('*', { count: 'exact', head: true }).eq('location_id', user.location_id).gte('created_at', start),
        supabase.from('worker_tasks').select('*', { count: 'exact', head: true }).eq('location_id', user.location_id).eq('is_completed', true).gte('created_at', start),
        supabase.from('checklist_logs').select('*', { count: 'exact', head: true }).eq('location_id', user.location_id).gte('created_at', today),
        supabase.from('worker_meals').select('*', { count: 'exact', head: true }).eq('location_id', user.location_id).gte('meal_date', start),
        supabase.from('issues').select('id, title, status, created_at').eq('location_id', user.location_id).neq('status', 'resolved').order('created_at', { ascending: false }).limit(10),
        supabase.from('waste_logs').select('item_name, quantity, estimated_value, created_at').eq('location_id', user.location_id).gte('created_at', start).order('created_at', { ascending: false }).limit(10),
        supabase.from('schedule_shifts').select('shift_date, profiles(full_name, role)').eq('location_id', user.location_id).eq('shift_date', today),
        supabase.from('temperature_logs').select('device_name, temperature, recorded_by_name, created_at').eq('location_id', user.location_id).gte('created_at', today).order('created_at', { ascending: false }).limit(10),
      ])

      // Sales daily
      if (salesRes?.ok) {
        const sJson = await salesRes.json()
        const daily = (sJson.data?.daily || []).sort((a: DailySale, b: DailySale) => a.date.localeCompare(b.date))
        setDailySales(daily)
        const rev = sJson.data?.summary?.total_revenue || daily.reduce((s: number, d: DailySale) => s + (d.revenue || 0), 0)
        setTotalRevenue(Math.round(rev))
      }

      // Sales by item
      if (itemsRes?.ok) {
        const iJson = await itemsRes.json()
        const items = (iJson.data?.items || []).sort((a: ItemSale, b: ItemSale) => (b.quantity || 0) - (a.quantity || 0))
        setTopDishes(items.slice(0, 10))

        // Food cost
        let fc = 0
        for (const item of items) {
          const recipe = DEFAULT_RECIPES.find(r => r.name === item.name || item.name?.includes(r.name.replace(/^\d+\s+/, '')))
          if (recipe) {
            fc += (recipe.lines.reduce((s, l) => s + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)) * (item.quantity || 0)
          }
        }
        setTotalFoodCost(Math.round(fc))
      }

      // Work times
      if (workRes?.ok) {
        const wJson = await workRes.json()
        const wts = wJson.data || []
        const byEmp: Record<string, number> = {}
        for (const wt of wts) {
          const name = wt.employee_name || wt.employee?.name || `${wt.employee?.first_name || ''} ${wt.employee?.last_name || ''}`.trim()
          if (name && wt.duration) byEmp[name] = (byEmp[name] || 0) + wt.duration / 3600
        }
        const profiles = (await supabase.from('profiles').select('full_name, hourly_rate').eq('is_active', true)).data || []
        const hrs = Object.entries(byEmp).map(([name, hours]) => {
          const p = profiles.find(pr => pr.full_name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(pr.full_name.toLowerCase()))
          const cost = hours * (p?.hourly_rate || 0)
          return { name, hours: Math.round(hours * 10) / 10, cost: Math.round(cost) }
        }).sort((a, b) => b.hours - a.hours)
        setWorkerHours(hrs)
        setTotalLabor(hrs.reduce((s, h) => s + h.cost, 0))
      }

      // Supabase data
      setTasksTotal(tasksAllRes.count || 0)
      setTasksDone(tasksDoneRes.count || 0)
      setChecklistCount(checkRes.count || 0)
      setMealCount(mealsCountRes.count || 0)
      setIssuesOpen(issuesRes.data || [])
      setWasteLogs(wasteRes.data || [])
      setTodayShifts(shiftsRes.data || [])
      setTempAlerts(tempsRes.data || [])

      // AI Alerts
      try {
        const alertsRes = await fetch(`/api/owner/alerts?locationId=${user!.location_id}&limit=20`)
        if (alertsRes.ok) {
          const aj = await alertsRes.json()
          setAiAlerts(aj.alerts || [])
          setAiUnreadCount(aj.unreadCount || 0)
        }
      } catch {}

      // P&L — always from May 1st to today
      try {
        setPnlLoading(true)
        const pnlRes = await fetch(`/api/pnl?date_start=2026-05-01&date_end=${new Date().toISOString().split('T')[0]}`)
        if (pnlRes.ok) {
          const pj = await pnlRes.json()
          if (pj.ok) setPnl(pj)
        }
      } catch {} finally { setPnlLoading(false) }

    } catch (err) {
      console.error('[Dashboard]', err)
    }
    setLoading(false)
  }, [user?.location_id, getRange])

  useEffect(() => { fetchData() }, [fetchData])

  if (!user) return null

  const fcPct = totalRevenue > 0 ? Math.round((totalFoodCost / totalRevenue) * 100) : 0
  const laborPct = totalRevenue > 0 ? Math.round((totalLabor / totalRevenue) * 100) : 0
  const taskPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0
  const maxDayRev = Math.max(...dailySales.map(d => d.revenue || 0), 1)
  const dayNames = ['Nd', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So']

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{user.location_name} — {new Date().toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex bg-gray-800 rounded-xl p-1">
          {(['week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === p ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {p === 'week' ? '7 dni' : 'Miesiac'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4 animate-pulse">📊</div>
          <p className="text-gray-500 text-sm">Ladowanie danych...</p>
        </div>
      ) : (
        <>
          {/* ═══ P&L COUNTER — od 1 maja ═══ */}
          {pnlLoading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 animate-pulse">
              <div className="h-6 bg-gray-800 rounded w-48 mb-4" />
              <div className="h-12 bg-gray-800 rounded w-64" />
            </div>
          ) : pnl ? (
            <div className={`rounded-2xl border p-6 mb-8 transition-all ${
              pnl.profitLoss.isProfit
                ? 'bg-gradient-to-r from-green-950/60 to-green-900/20 border-green-800'
                : 'bg-gradient-to-r from-red-950/60 to-red-900/20 border-red-800'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{pnl.profitLoss.isProfit ? '📈' : '📉'}</span>
                  <div>
                    <h2 className="text-white font-bold text-sm">Wynik od 1 maja</h2>
                    <p className="text-gray-500 text-[10px]">{pnl.period.start} — {pnl.period.end} ({pnl.period.days} dni)</p>
                  </div>
                </div>
                <button onClick={() => setPnlExpanded(!pnlExpanded)} className="text-gray-400 hover:text-white text-xs">
                  {pnlExpanded ? 'Zwiń ▲' : 'Rozwiń ▼'}
                </button>
              </div>

              {/* Main result */}
              <div className="flex items-end gap-6 mb-4">
                <div>
                  <p className={`text-4xl font-black tracking-tight ${pnl.profitLoss.isProfit ? 'text-green-400' : 'text-red-400'}`}>
                    {pnl.profitLoss.isProfit ? '+' : ''}{pnl.profitLoss.amount.toLocaleString('pl')} zl
                  </p>
                  <p className={`text-xs font-bold mt-1 ${pnl.profitLoss.isProfit ? 'text-green-500' : 'text-red-500'}`}>
                    {pnl.profitLoss.isProfit ? 'ZYSK' : 'STRATA'} ({pnl.profitLoss.pctOfRevenue}% przychodu)
                  </p>
                </div>
                <div className="text-right text-gray-500 text-xs">
                  <p>~{pnl.profitLoss.perDay.toLocaleString('pl')} zl / dzien</p>
                  <p>{pnl.revenue.transactions} transakcji</p>
                </div>
              </div>

              {/* Revenue bar breakdown */}
              <div className="space-y-2 mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">Przychod (GoPOS)</span>
                  <span className="text-white text-xs font-bold">{pnl.revenue.total.toLocaleString('pl')} zl</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '100%' }} />
                </div>

                {/* Food cost — actual from invoices */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">🥩 Food cost ({pnl.purchases.food.count} fv)</span>
                  <span className="text-amber-400 text-xs font-bold">-{Math.round(pnl.purchases.food.gross).toLocaleString('pl')} zl ({pnl.purchases.food.pctOfRevenue}%)</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${Math.min(pnl.purchases.food.pctOfRevenue, 100)}%` }} />
                </div>

                {/* Beverage cost */}
                {pnl.purchases.beverage.gross > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">🥤 Napoje ({pnl.purchases.beverage.count} fv)</span>
                      <span className="text-cyan-400 text-xs font-bold">-{Math.round(pnl.purchases.beverage.gross).toLocaleString('pl')} zl ({pnl.purchases.beverage.pctOfRevenue}%)</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div className="bg-cyan-500 h-2 rounded-full" style={{ width: `${Math.min(pnl.purchases.beverage.pctOfRevenue, 100)}%` }} />
                    </div>
                  </>
                )}

                {/* Other costs */}
                {pnl.purchases.other.gross > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">📋 Inne ({pnl.purchases.other.count} fv)</span>
                      <span className="text-purple-400 text-xs font-bold">-{Math.round(pnl.purchases.other.gross).toLocaleString('pl')} zl ({pnl.purchases.other.pctOfRevenue}%)</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${Math.min(pnl.purchases.other.pctOfRevenue, 100)}%` }} />
                    </div>
                  </>
                )}

                {/* Labor */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">👥 Koszty pracy ({pnl.labor.hours}h)</span>
                  <span className="text-blue-400 text-xs font-bold">-{pnl.labor.total.toLocaleString('pl')} zl ({pnl.labor.pctOfRevenue}%)</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(pnl.labor.pctOfRevenue, 100)}%` }} />
                </div>
              </div>

              {/* Food Cost: Actual vs Theoretical comparison */}
              {pnl.foodCost && pnl.foodCost.theoretical > 0 && (
                <div className="mt-3 p-3 bg-gray-800/50 rounded-xl">
                  <h3 className="text-gray-400 text-[10px] font-bold mb-2 uppercase tracking-wider">Food cost — faktury vs receptury</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-gray-500 text-[10px]">Faktury (actual)</p>
                      <p className="text-amber-400 text-sm font-bold">{pnl.foodCost.actualPct}%</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-500 text-[10px]">Receptury (target)</p>
                      <p className="text-gray-300 text-sm font-bold">{pnl.foodCost.theoreticalPct}%</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-500 text-[10px]">Roznica</p>
                      <p className={`text-sm font-bold ${pnl.foodCost.differencePct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {pnl.foodCost.differencePct > 0 ? '+' : ''}{pnl.foodCost.differencePct}%
                      </p>
                    </div>
                  </div>
                  {pnl.foodCost.differencePct > 2 && (
                    <p className="text-red-400/80 text-[10px] mt-2">⚠️ Actual FC wyzszy od receptur o {pnl.foodCost.differencePct}pp — sprawdz porcjowanie i waste</p>
                  )}
                  {pnl.foodCost.differencePct <= 0 && (
                    <p className="text-green-400/80 text-[10px] mt-2">✓ Actual FC nizszy lub rowny recepturom — dobra kontrola</p>
                  )}
                </div>
              )}

              {/* Expanded details */}
              {pnlExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-700/50 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Food suppliers */}
                  <div>
                    <h3 className="text-gray-400 text-xs font-bold mb-2">🥩 DOSTAWCY ŻYWNOŚCI</h3>
                    {pnl.purchases.food.bySupplier.slice(0, 5).map((s, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-gray-300 text-xs truncate">{s.name}</span>
                        <span className="text-amber-400 text-xs font-bold ml-2">{Math.round(s.gross).toLocaleString('pl')} zl</span>
                      </div>
                    ))}
                    {pnl.purchases.beverage.bySupplier.length > 0 && (
                      <>
                        <h3 className="text-gray-400 text-xs font-bold mb-2 mt-3">🥤 NAPOJE</h3>
                        {pnl.purchases.beverage.bySupplier.map((s, i) => (
                          <div key={i} className="flex items-center justify-between py-1">
                            <span className="text-gray-300 text-xs truncate">{s.name}</span>
                            <span className="text-cyan-400 text-xs font-bold ml-2">{Math.round(s.gross).toLocaleString('pl')} zl</span>
                          </div>
                        ))}
                      </>
                    )}
                    {pnl.purchases.other.bySupplier.length > 0 && (
                      <>
                        <h3 className="text-gray-400 text-xs font-bold mb-2 mt-3">📋 INNE</h3>
                        {pnl.purchases.other.bySupplier.map((s, i) => (
                          <div key={i} className="flex items-center justify-between py-1">
                            <span className="text-gray-300 text-xs truncate">{s.name}</span>
                            <span className="text-purple-400 text-xs font-bold ml-2">{Math.round(s.gross).toLocaleString('pl')} zl</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  {/* Workers */}
                  <div>
                    <h3 className="text-gray-400 text-xs font-bold mb-2">👥 KOSZTY PRACY</h3>
                    {pnl.labor.byWorker.slice(0, 5).map((w, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-gray-300 text-xs">{w.name} ({w.hours}h)</span>
                        <span className="text-blue-400 text-xs font-bold ml-2">{w.cost.toLocaleString('pl')} zl</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <KpiCard label="Przychod" value={`${totalRevenue.toLocaleString('pl')} zl`} icon="💰" color="from-green-500/20 to-green-600/5" textColor="text-green-400" />
            <KpiCard label="Food Cost" value={`${fcPct}%`} subtitle={`${totalFoodCost.toLocaleString('pl')} zl`} icon="🥘"
              color={fcPct > 35 ? 'from-red-500/20 to-red-600/5' : 'from-amber-500/20 to-amber-600/5'}
              textColor={fcPct > 35 ? 'text-red-400' : fcPct > 30 ? 'text-amber-400' : 'text-green-400'} />
            <KpiCard label="Koszty pracy" value={`${laborPct}%`} subtitle={`${totalLabor.toLocaleString('pl')} zl`} icon="👥" color="from-blue-500/20 to-blue-600/5" textColor="text-blue-400" />
            <KpiCard label="Zadania" value={`${taskPct}%`} subtitle={`${tasksDone}/${tasksTotal}`} icon="✅" color="from-purple-500/20 to-purple-600/5" textColor="text-purple-400" />
            <KpiCard label="Awarie" value={`${issuesOpen.length}`} subtitle={issuesOpen.length > 0 ? 'otwartych' : 'brak'} icon="🔧"
              color={issuesOpen.length > 0 ? 'from-red-500/20 to-red-600/5' : 'from-green-500/20 to-green-600/5'}
              textColor={issuesOpen.length > 0 ? 'text-red-400' : 'text-green-400'} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Sales chart */}
            <div className="lg:col-span-2 bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Sprzedaz dzienna</h2>
              {dailySales.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-8">Brak danych sprzedazy z GoPOS</p>
              ) : (
                <div className="flex items-end gap-1 h-48">
                  {dailySales.map((d, i) => {
                    const h = (d.revenue || 0) / maxDayRev * 100
                    const day = new Date(d.date)
                    const label = `${day.getDate()}.${day.getMonth() + 1}`
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center group relative">
                        <div className="absolute -top-8 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {label}: {Math.round(d.revenue || 0)} zl | {d.quantity || 0} szt | {d.transactions || 0} tx
                        </div>
                        <div className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-md hover:from-indigo-500 hover:to-indigo-300 transition-all cursor-pointer"
                          style={{ height: `${Math.max(h, 2)}%`, minHeight: '2px' }} />
                        {dailySales.length <= 14 && <span className="text-[9px] text-gray-600 mt-1">{dayNames[day.getDay()]}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* FC gauge */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 flex flex-col items-center justify-center">
              <h2 className="text-white font-bold text-sm mb-4">Food Cost %</h2>
              <div className="relative w-28 h-28">
                <svg viewBox="0 0 36 36" className="w-full h-full">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1f2937" strokeWidth="3" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none"
                    stroke={fcPct > 35 ? '#ef4444' : fcPct > 30 ? '#f59e0b' : '#22c55e'}
                    strokeWidth="3" strokeDasharray={`${fcPct}, 100`} strokeLinecap="round" />
                  <text x="18" y="20" textAnchor="middle" className="text-[8px] font-bold" fill="white">{fcPct}%</text>
                </svg>
              </div>
              <p className="text-gray-500 text-xs mt-2">Koszt: {totalFoodCost.toLocaleString('pl')} zl</p>
              <p className="text-gray-600 text-[10px]">Cel: &lt;30%</p>
            </div>
          </div>

          {/* Middle row: top dishes + worker hours */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Top dania</h2>
              {topDishes.length === 0 ? <p className="text-gray-600 text-sm text-center py-4">Brak danych</p> : (
                <div className="space-y-2">
                  {topDishes.map((d, i) => {
                    const maxQ = topDishes[0]?.quantity || 1
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-gray-600 text-xs w-5 text-right">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-gray-300 text-xs truncate">{d.name}</span>
                            <span className="text-indigo-400 text-xs font-bold ml-2">{d.quantity}x</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5">
                            <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(d.quantity / maxQ) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Godziny zespolu</h2>
              {workerHours.length === 0 ? <p className="text-gray-600 text-sm text-center py-4">Brak danych z GoPOS</p> : (
                <div className="space-y-2">
                  {workerHours.map((w, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800/50 last:border-0">
                      <span className="text-gray-300 text-xs">{w.name}</span>
                      <div className="text-right">
                        <span className="text-white text-xs font-bold">{w.hours}h</span>
                        {w.cost > 0 && <span className="text-gray-500 text-[10px] ml-2">{w.cost} zl</span>}
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-gray-700 flex justify-between text-xs">
                    <span className="text-gray-500">Lacznie</span>
                    <span className="text-white font-bold">{workerHours.reduce((s, w) => s + w.hours, 0).toFixed(1)}h = {totalLabor.toLocaleString('pl')} zl</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Status row: shifts, checklists, issues, waste */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Today's shifts */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="text-white font-bold text-xs mb-3">Dzis na zmianie</h3>
              {todayShifts.length > 0 ? (
                <div className="space-y-1">
                  {todayShifts.map((s: any, i: number) => (
                    <p key={i} className="text-gray-300 text-xs">{s.profiles?.full_name || '?'} <span className="text-gray-600">({s.profiles?.role})</span></p>
                  ))}
                </div>
              ) : <p className="text-gray-600 text-xs">Brak danych grafiku</p>}
            </div>

            {/* Checklist today */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="text-white font-bold text-xs mb-3">Checklisty dzis</h3>
              <p className={`text-2xl font-black ${checklistCount > 0 ? 'text-green-400' : 'text-gray-600'}`}>{checklistCount}</p>
              <p className="text-gray-600 text-[10px] mt-1">wykonanych</p>
            </div>

            {/* Temperatures */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="text-white font-bold text-xs mb-3">Temperatury dzis</h3>
              {tempAlerts.length > 0 ? (
                <div className="space-y-1">
                  {tempAlerts.slice(0, 3).map((t: any, i: number) => (
                    <p key={i} className="text-xs"><span className="text-gray-400">{t.device_name}:</span> <span className="text-white font-bold">{t.temperature}°C</span></p>
                  ))}
                </div>
              ) : <p className="text-gray-600 text-xs">Brak pomiarow</p>}
            </div>

            {/* Meals */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="text-white font-bold text-xs mb-3">Posilki ({period === 'week' ? '7 dni' : 'miesiac'})</h3>
              <p className="text-2xl font-black text-white">{mealCount}</p>
              <p className="text-gray-600 text-[10px] mt-1">posilkow pracowniczych</p>
            </div>
          </div>

          {/* Issues + Waste */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Otwarte awarie</h2>
              {issuesOpen.length > 0 ? (
                <div className="space-y-2">
                  {issuesOpen.map(iss => (
                    <div key={iss.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <span className="text-gray-300 text-xs">{iss.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${iss.status === 'new' ? 'bg-red-900/30 text-red-400' : 'bg-amber-900/30 text-amber-400'}`}>
                        {iss.status === 'new' ? 'Nowa' : 'W trakcie'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-green-400 text-xs text-center py-4">Brak otwartych awarii</p>}
            </div>

            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Straty ({period === 'week' ? '7 dni' : 'miesiac'})</h2>
              {wasteLogs.length > 0 ? (
                <div className="space-y-2">
                  {wasteLogs.map((w, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <span className="text-gray-300 text-xs">{w.item_name} — {w.quantity} szt</span>
                      <span className="text-red-400 text-xs font-bold">{w.estimated_value} zl</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-gray-700 flex justify-between text-xs">
                    <span className="text-gray-500">Lacznie strat</span>
                    <span className="text-red-400 font-bold">{wasteLogs.reduce((s, w) => s + (w.estimated_value || 0), 0)} zl</span>
                  </div>
                </div>
              ) : <p className="text-green-400 text-xs text-center py-4">Brak strat</p>}
            </div>
          </div>

          {/* AI Monitor Alerts */}
          {aiAlerts.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-bold text-sm flex items-center gap-2">
                  🤖 AI Monitor
                  {aiUnreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{aiUnreadCount} nowe</span>
                  )}
                </h2>
                {aiUnreadCount > 0 && (
                  <button
                    onClick={async () => {
                      await fetch('/api/owner/alerts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ locationId: user.location_id, markAllRead: true }),
                      })
                      setAiAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
                      setAiUnreadCount(0)
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Oznacz przeczytane
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {aiAlerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`rounded-xl p-4 border transition-all ${
                      alert.severity === 'critical'
                        ? 'bg-red-950/50 border-red-800'
                        : alert.severity === 'warning'
                        ? 'bg-amber-950/50 border-amber-800'
                        : 'bg-blue-950/30 border-blue-900'
                    } ${!alert.is_read ? 'ring-1 ring-indigo-500' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{alert.title}</p>
                        <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap line-clamp-3">{alert.description}</p>
                      </div>
                      <span className="text-[10px] text-gray-600 whitespace-nowrap">
                        {new Date(alert.created_at).toLocaleDateString('pl', { day: '2-digit', month: '2-digit' })}{' '}
                        {new Date(alert.created_at).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickLink href="/owner/ai" icon="🤖" label="Zapytaj AI" desc="Asystent restauracji" />
            <QuickLink href="/owner/foodcost" icon="🥘" label="Food Cost" desc="Receptury i marze" />
            <QuickLink href="/owner/sales" icon="📊" label="Sprzedaz" desc="Wykresy i ranking" />
            <QuickLink href="/owner/staff" icon="👥" label="Zespol" desc="Godziny i posilki" />
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, subtitle, icon, color, textColor }: {
  label: string; value: string; subtitle?: string; icon: string; color: string; textColor: string
}) {
  return (
    <div className={`bg-gradient-to-br ${color} border border-gray-800 rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-xs font-medium">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
  )
}

function QuickLink({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <a href={href} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 hover:bg-gray-800/50 transition-all group">
      <span className="text-2xl">{icon}</span>
      <p className="text-white text-sm font-bold mt-2 group-hover:text-indigo-400 transition-colors">{label}</p>
      <p className="text-gray-600 text-xs mt-0.5">{desc}</p>
    </a>
  )
}
