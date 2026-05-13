'use client'
import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/lib/useUser'
import supabase from '@/lib/supabase'
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from 'date-fns'
import { pl } from 'date-fns/locale'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

interface DailySales {
  date: string
  label: string
  revenue: number
  orders: number
}

interface DishSale {
  name: string
  quantity: number
  revenue: number
}

interface WorkerCost {
  name: string
  hours: number
  cost: number
}

export default function OwnerDashboard() {
  const { user } = useUser()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [dailySales, setDailySales] = useState<DailySales[]>([])
  const [topDishes, setTopDishes] = useState<DishSale[]>([])
  const [workerCosts, setWorkerCosts] = useState<WorkerCost[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalFoodCost, setTotalFoodCost] = useState(0)
  const [totalLabor, setTotalLabor] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mealCount, setMealCount] = useState(0)
  const [tasksDone, setTasksDone] = useState(0)
  const [tasksTotal, setTasksTotal] = useState(0)

  const today = new Date()
  const dateRange = period === 'week'
    ? { start: format(subDays(today, 6), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') }
    : { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') }

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    try {
      // 1. Sales from GoPOS
      const salesRes = await fetch(`/api/gopos?action=sales_by_item&date_start=${dateRange.start}&date_end=${dateRange.end}`)
      const salesJson = await salesRes.json()
      const items = salesJson.data?.items || []

      // Calculate top dishes
      const dishes: DishSale[] = items
        .map((it: any) => ({ name: it.name, quantity: it.quantity || it.count || 0, revenue: (it.quantity || 0) * (it.price || 0) }))
        .sort((a: DishSale, b: DishSale) => b.quantity - a.quantity)
        .slice(0, 10)
      setTopDishes(dishes)

      // Daily breakdown
      const dailyRes = await fetch(`/api/gopos?action=daily_reports&date_start=${dateRange.start}&date_end=${dateRange.end}`)
      const dailyJson = await dailyRes.json()
      const reports = dailyJson.data?.reports || dailyJson.data || []

      const days: DailySales[] = []
      let rev = 0

      if (Array.isArray(reports)) {
        for (const r of reports) {
          const date = r.date || r.report_date || ''
          const revenue = r.total || r.revenue || r.net_total || 0
          const orders = r.orders_count || r.receipts || 0
          days.push({
            date,
            label: date ? format(new Date(date), 'EEE d', { locale: pl }) : '',
            revenue: Math.round(revenue),
            orders,
          })
          rev += revenue
        }
      }
      setDailySales(days.sort((a, b) => a.date.localeCompare(b.date)))
      setTotalRevenue(Math.round(rev))

      // 2. Food cost calculation
      let foodCost = 0
      for (const item of items) {
        const recipe = DEFAULT_RECIPES.find(r => r.name === item.name || r.name.includes(item.name?.split(' ')[0]))
        if (recipe) {
          const portionCost = recipe.lines.reduce((sum, l) => sum + l.pricePerKg * l.quantity, 0) + (recipe.packagingCost || 0)
          foodCost += portionCost * (item.quantity || 0)
        }
      }
      setTotalFoodCost(Math.round(foodCost))

      // 3. Worker costs from work_times
      const workRes = await fetch(`/api/gopos?action=work_times&date_start=${dateRange.start}&date_end=${dateRange.end}`)
      const workJson = await workRes.json()
      const workTimes = workJson.data?.work_times || workJson.data || []

      const costMap: Record<string, { hours: number; cost: number }> = {}
      let laborTotal = 0

      if (Array.isArray(workTimes)) {
        for (const wt of workTimes) {
          const name = wt.employee_name || wt.worker_name || 'Nieznany'
          const hours = wt.total_hours || wt.hours || 0
          const rate = wt.hourly_rate || 28.1 // default rate
          const cost = hours * rate
          if (!costMap[name]) costMap[name] = { hours: 0, cost: 0 }
          costMap[name].hours += hours
          costMap[name].cost += cost
          laborTotal += cost
        }
      }

      setWorkerCosts(
        Object.entries(costMap)
          .map(([name, data]) => ({ name, hours: Math.round(data.hours * 10) / 10, cost: Math.round(data.cost) }))
          .sort((a, b) => b.cost - a.cost)
      )
      setTotalLabor(Math.round(laborTotal))

      // 4. KPIs from Supabase
      const todayStr = format(today, 'yyyy-MM-dd')

      const { count: mealsCount } = await supabase
        .from('worker_meals')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', user.location_id)
        .eq('meal_date', todayStr)

      setMealCount(mealsCount || 0)

      const { count: doneCount } = await supabase
        .from('worker_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', user.location_id)
        .eq('is_completed', true)
        .gte('created_at', dateRange.start)

      const { count: allCount } = await supabase
        .from('worker_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', user.location_id)
        .gte('created_at', dateRange.start)

      setTasksDone(doneCount || 0)
      setTasksTotal(allCount || 0)

    } catch (err) {
      console.error('[OwnerDashboard]', err)
    }

    setLoading(false)
  }, [user, dateRange.start, dateRange.end])

  useEffect(() => {
    fetchData()
  }, [period])

  if (!user) return null

  const foodCostPct = totalRevenue > 0 ? Math.round((totalFoodCost / totalRevenue) * 100) : 0
  const laborPct = totalRevenue > 0 ? Math.round((totalLabor / totalRevenue) * 100) : 0
  const maxDayRevenue = Math.max(...dailySales.map(d => d.revenue), 1)
  const taskPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(today, 'EEEE, d MMMM yyyy', { locale: pl })}
          </p>
        </div>
        <div className="flex bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setPeriod('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              period === 'week' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            7 dni
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              period === 'month' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Miesiac
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-20">Ladowanie danych...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard
              label="Przychod"
              value={`${totalRevenue.toLocaleString('pl')} zl`}
              icon="💰"
              color="from-green-500/20 to-green-600/5"
              textColor="text-green-400"
            />
            <KpiCard
              label="Food Cost"
              value={`${foodCostPct}%`}
              subtitle={`${totalFoodCost.toLocaleString('pl')} zl`}
              icon="🥘"
              color={foodCostPct > 35 ? 'from-red-500/20 to-red-600/5' : 'from-amber-500/20 to-amber-600/5'}
              textColor={foodCostPct > 35 ? 'text-red-400' : 'text-amber-400'}
            />
            <KpiCard
              label="Koszty pracy"
              value={`${laborPct}%`}
              subtitle={`${totalLabor.toLocaleString('pl')} zl`}
              icon="👥"
              color="from-blue-500/20 to-blue-600/5"
              textColor="text-blue-400"
            />
            <KpiCard
              label="Zadania"
              value={`${taskPct}%`}
              subtitle={`${tasksDone}/${tasksTotal} wykonane`}
              icon="✅"
              color="from-purple-500/20 to-purple-600/5"
              textColor="text-purple-400"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Sales chart */}
            <div className="lg:col-span-2 bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Sprzedaz dzienna</h2>
              {dailySales.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-8">Brak danych sprzedazy</p>
              ) : (
                <div className="flex items-end gap-1 h-48">
                  {dailySales.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-500 font-mono">
                        {d.revenue > 0 ? `${Math.round(d.revenue / 1000)}k` : ''}
                      </span>
                      <div
                        className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-lg transition-all hover:from-indigo-500 hover:to-indigo-300 cursor-pointer relative group min-h-[2px]"
                        style={{ height: `${Math.max((d.revenue / maxDayRevenue) * 150, 2)}px` }}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-10 border border-gray-700">
                          {d.revenue.toLocaleString('pl')} zl
                          <br />
                          {d.orders} zamowien
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-600">{d.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Food Cost gauge */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Food Cost %</h2>
              <div className="flex flex-col items-center justify-center h-48">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke={foodCostPct > 35 ? '#ef4444' : foodCostPct > 30 ? '#f59e0b' : '#22c55e'}
                      strokeWidth="8"
                      strokeDasharray={`${foodCostPct * 2.51} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-3xl font-bold ${foodCostPct > 35 ? 'text-red-400' : foodCostPct > 30 ? 'text-amber-400' : 'text-green-400'}`}>
                      {foodCostPct}%
                    </span>
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <p className="text-gray-500 text-xs">Koszt: {totalFoodCost.toLocaleString('pl')} zl</p>
                  <p className="text-gray-600 text-[10px]">Cel: &lt;30%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top dishes */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Top dania</h2>
              {topDishes.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">Brak danych</p>
              ) : (
                <div className="space-y-3">
                  {topDishes.slice(0, 8).map((dish, i) => {
                    const maxQty = topDishes[0]?.quantity || 1
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-gray-600 text-xs font-mono w-5 text-right">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-300 text-xs truncate">{dish.name}</span>
                            <span className="text-indigo-400 text-xs font-bold ml-2">{dish.quantity}x</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5">
                            <div
                              className="bg-indigo-500 h-1.5 rounded-full"
                              style={{ width: `${(dish.quantity / maxQty) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Worker costs */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-bold text-sm mb-4">Koszty zespolu</h2>
              {workerCosts.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">Brak danych</p>
              ) : (
                <div className="space-y-3">
                  {workerCosts.map((w, i) => {
                    const maxCost = workerCosts[0]?.cost || 1
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-sm">
                          👤
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-300 text-xs">{w.name}</span>
                            <div className="text-right">
                              <span className="text-blue-400 text-xs font-bold">{w.cost} zl</span>
                              <span className="text-gray-600 text-[10px] ml-1">({w.hours}h)</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full"
                              style={{ width: `${(w.cost / maxCost) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className="pt-2 border-t border-gray-800 flex justify-between text-xs">
                    <span className="text-gray-500">Lacznie</span>
                    <span className="text-white font-bold">{totalLabor.toLocaleString('pl')} zl ({laborPct}% przychodu)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickLink href="/owner/ai" icon="🤖" label="Zapytaj AI" desc="Asystent restauracji" />
            <QuickLink href="/owner/sheets" icon="📋" label="Arkusze Google" desc="Raporty i dane" />
            <QuickLink href="/owner/marketing" icon="📣" label="Marketing" desc="Kampanie i social media" />
            <QuickLink href="/meals/menu" icon="🍽️" label="Menu pracownicze" desc="Zarzadzaj daniami" />
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
    <a
      href={href}
      className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 hover:bg-gray-800/50 transition-all group"
    >
      <span className="text-2xl">{icon}</span>
      <p className="text-white text-sm font-bold mt-2 group-hover:text-indigo-400 transition-colors">{label}</p>
      <p className="text-gray-600 text-xs mt-0.5">{desc}</p>
    </a>
  )
}
