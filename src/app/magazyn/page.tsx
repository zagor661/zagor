'use client'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { FOODCOST_PRODUCTS } from '@/lib/foodcostProducts'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

// ─── Product lists ────────────────────────────────────────
const INGREDIENTS = FOODCOST_PRODUCTS.filter(p => p.type === 'ingredient')

interface PreparedProduct { name: string; category: string; unit: string }

const PREPARED_PRODUCTS: PreparedProduct[] = [
  { name: 'Sos Sezamowy',        category: 'Sosy',           unit: 'kg' },
  { name: 'Sos Kokosowy',        category: 'Sosy',           unit: 'kg' },
  { name: 'Sos Chilli Teriyaki', category: 'Sosy',           unit: 'kg' },
  { name: 'Sos Miso Teriyaki',   category: 'Sosy',           unit: 'kg' },
  { name: 'Sos Curry',           category: 'Sosy',           unit: 'kg' },
  { name: 'Sos Mango',           category: 'Sosy',           unit: 'kg' },
  { name: 'Teriyaki',            category: 'Sosy',           unit: 'kg' },
  { name: 'Pierś z Kury (marynat.)',   category: 'Marynaty mięsne', unit: 'kg' },
  { name: 'Pierś z Kaczki (marynat.)', category: 'Marynaty mięsne', unit: 'kg' },
  { name: 'Rostbef (marynowany)',       category: 'Marynaty mięsne', unit: 'kg' },
  { name: 'Polędwiczka (marynat.)',     category: 'Marynaty mięsne', unit: 'kg' },
  { name: 'Udko Marynowane',           category: 'Marynaty mięsne', unit: 'kg' },
  { name: 'Baza Warzywna',       category: 'Bazy i gotowe',  unit: 'kg' },
  { name: 'Baza Wegańska',       category: 'Bazy i gotowe',  unit: 'kg' },
  { name: 'Baza Wegetariańska',  category: 'Bazy i gotowe',  unit: 'kg' },
  { name: 'Ryż z Zalewą',        category: 'Bazy i gotowe',  unit: 'kg' },
  { name: 'Olej z Wkładem',      category: 'Bazy i gotowe',  unit: 'L' },
  { name: 'Ziarna Mix',          category: 'Bazy i gotowe',  unit: 'kg' },
  { name: 'Boczniak',            category: 'Warzywa',         unit: 'kg' },
  { name: 'Frytura',             category: 'Bazy i gotowe',   unit: 'L' },
  { name: 'Bulion Dashi',        category: 'Bazy i gotowe',   unit: 'kg' },
  { name: 'Liście Kafiru',       category: 'Warzywa',         unit: 'kg' },
  { name: 'Szczypiorek',         category: 'Warzywa',         unit: 'kg' },
  { name: 'Pomarańcze',          category: 'Warzywa',         unit: 'kg' },
  { name: 'Mąka Ryżowa',        category: 'Inne',            unit: 'kg' },
]

// All product names for dropdowns
const ALL_PRODUCTS = [
  ...PREPARED_PRODUCTS.map(p => ({ name: p.name, unit: p.unit, category: p.category })),
  ...INGREDIENTS.map(p => ({
    name: p.name,
    unit: ['Olej Sezamowy','Mleko Kokosowe','Kikkoman','Mirin','Suehiro','Sos Rybny','Sriracha Zielona','Sok Pomarańczowy','Olej'].includes(p.name)
      ? 'L'
      : ['Jajka K1','Box','Torba Papierowa','Pałeczki','Serwetka Box','Widelczyk','Łyżki','Miso opakowanie','Zupa opakowanie','Worki Wakum','Limonka','Ananas Puszka'].includes(p.name)
        ? 'szt'
        : 'kg',
    category: p.category,
  })),
]

// ─── Category config ──────────────────────────────────────
const CATEGORY_ORDER = [
  'Sosy', 'Marynaty mięsne', 'Bazy i gotowe',
  'Makarony', 'Mięso', 'Ryby', 'Warzywa', 'Azjatyckie', 'Przyprawy', 'Inne', 'Opakowania',
]

const CAT_ICONS: Record<string, string> = {
  'Sosy': '🫗', 'Marynaty mięsne': '🥩', 'Bazy i gotowe': '🍲',
  'Makarony': '🍜', 'Mięso': '🥩', 'Ryby': '🐟', 'Warzywa': '🥬',
  'Azjatyckie': '🥢', 'Przyprawy': '🌶️', 'Inne': '📦', 'Opakowania': '🥡',
}

// ─── Recipe ↔ Stock name mapping ──────────────────────────
const RECIPE_TO_STOCK: Record<string, string> = {
  'Pierś z Kury (marynat.)': 'Pierś z Kurczaka',
  'Pierś z Kaczki (marynat.)': 'Pierś z Kaczki',
  'Rostbef (marynowany)': 'Rostbef Wołowy',
  'Polędwiczka (marynat.)': 'Polędwiczka Wieprzowa',
  'Udko Marynowane': 'Udko z Kury',
  'Orzechy Nerkowca': 'Orzech Nerkowca',
  'Szpinak': 'Szpinak Baby',
  'Jajko': 'Jajka K1',
  'Chilli': 'Papryczka Chilli',
  'Sos Mango': 'Pulpa Mango',
  'Olej z Wkładem': 'Olej',
  'Ryż z Zalewą': 'Ryż',
  'Krewetka 16/20': 'Krewetka 16/20',
  'Ziarna Mix': 'Ziarna Mix',
}

// ─── GoPOS dish name → recipe ID ──────────────────────────
const GOPOS_TO_RECIPE: Record<string, string> = {
  '01 TOKIO': 'tokio',
  '02 YOKOHAMA': 'yokohama',
  '03 OSAKA': 'osaka',
  '04 KOBE': 'kobe',
  '05 SAPPORO': 'sapporo',
  '06 NAGOJA': 'nagoja',
  '07 WEGETARIAN SAN': 'wegetarian-san',
  '08 SAN WEGAN': 'san-wegan',
  '09 SAMON SAN': 'samon-san',
  '10 SENDAI': 'sendai',
  '11 NARA': 'nara',
}

// ─── LocalStorage keys ────────────────────────────────────
const LS_REMANENT = 'kitchenops_remanent'
const LS_DELIVERIES = 'kitchenops_deliveries'

// ─── Types ────────────────────────────────────────────────
interface SavedRemanent {
  date: string
  timestamp: number
  employee: string
  entries: { name: string; quantity: number; unit: string; custom?: boolean }[]
}

interface Delivery {
  id: string
  date: string
  productName: string
  quantity: number
  unit: string
  addedBy: string
  note: string
}

interface SalesItem {
  name: string
  quantity: number
}

interface StockRow {
  name: string
  category: string
  unit: string
  remanentQty: number
  deliveriesQty: number
  consumptionQty: number
  theoreticalStock: number
}

type TabId = 'stan' | 'dostawy' | 'zuzycie'

// ─── Helpers ──────────────────────────────────────────────
function loadRemanentHistory(): SavedRemanent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_REMANENT)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function loadDeliveries(): Delivery[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_DELIVERIES)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveDeliveries(deliveries: Delivery[]) {
  localStorage.setItem(LS_DELIVERIES, JSON.stringify(deliveries))
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function resolveStockName(recipeName: string): string {
  return RECIPE_TO_STOCK[recipeName] || recipeName
}

// ─── Component ────────────────────────────────────────────
export default function MagazynPage() {
  const { user, loading } = useUser()
  const [tab, setTab] = useState<TabId>('stan')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORY_ORDER))

  // Remanent & deliveries
  const [remanentHistory, setRemanentHistory] = useState<SavedRemanent[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [lastRemanent, setLastRemanent] = useState<SavedRemanent | null>(null)

  // Sales / consumption
  const [salesItems, setSalesItems] = useState<SalesItem[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesError, setSalesError] = useState('')

  // Delivery form
  const [deliveryProduct, setDeliveryProduct] = useState('')
  const [deliveryQty, setDeliveryQty] = useState('')
  const [deliveryUnit, setDeliveryUnit] = useState('kg')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // Date range for consumption
  const [dateStart, setDateStart] = useState(todayISO())
  const [dateEnd, setDateEnd] = useState(todayISO())

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Load data ────────────────────────────────────────
  useEffect(() => {
    const history = loadRemanentHistory()
    setRemanentHistory(history)
    if (history.length > 0) {
      setLastRemanent(history[0])
      setDateStart(history[0].date)
    }
    setDeliveries(loadDeliveries())
  }, [])

  // ─── Fetch sales ──────────────────────────────────────
  const fetchSales = useCallback(async (start: string, end: string) => {
    setSalesLoading(true)
    setSalesError('')
    try {
      const res = await fetch(`/api/gopos?action=sales_by_item&date_start=${start}&date_end=${end}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const items: SalesItem[] = (json.data?.items || []).map((it: { name: string; quantity?: number; count?: number }) => ({
        name: it.name,
        quantity: it.quantity || it.count || 0,
      }))
      setSalesItems(items)
    } catch (e: unknown) {
      setSalesError(e instanceof Error ? e.message : 'Brak danych z GoPOS')
      setSalesItems([])
    } finally {
      setSalesLoading(false)
    }
  }, [])

  // Fetch on mount + auto-refresh every 60s
  useEffect(() => {
    if (dateStart && dateEnd) fetchSales(dateStart, dateEnd)
    refreshTimer.current = setInterval(() => {
      if (dateStart && dateEnd) fetchSales(dateStart, dateEnd)
    }, 60000)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
  }, [dateStart, dateEnd, fetchSales])

  // ─── Consumption calculation ──────────────────────────
  const consumptionByProduct = useMemo(() => {
    const usage: Record<string, number> = {}
    for (const sale of salesItems) {
      const recipeId = GOPOS_TO_RECIPE[sale.name]
      if (!recipeId) continue
      const recipe = DEFAULT_RECIPES.find(r => r.id === recipeId)
      if (!recipe) continue
      for (const line of recipe.lines) {
        const stockName = resolveStockName(line.productName)
        usage[stockName] = (usage[stockName] || 0) + line.quantity * sale.quantity
      }
    }
    return usage
  }, [salesItems])

  // ─── Consumption by dish (for Zuzycie tab) ───────────
  const consumptionByDish = useMemo(() => {
    const result: { dishName: string; recipeId: string; sold: number; ingredients: { name: string; qty: number; unit: string }[] }[] = []
    for (const sale of salesItems) {
      const recipeId = GOPOS_TO_RECIPE[sale.name]
      if (!recipeId || sale.quantity === 0) continue
      const recipe = DEFAULT_RECIPES.find(r => r.id === recipeId)
      if (!recipe) continue
      const ingredients = recipe.lines.map(line => ({
        name: resolveStockName(line.productName),
        qty: Math.round(line.quantity * sale.quantity * 1000) / 1000,
        unit: 'kg',
      }))
      result.push({ dishName: sale.name, recipeId, sold: sale.quantity, ingredients })
    }
    return result.sort((a, b) => b.sold - a.sold)
  }, [salesItems])

  // ─── Stock calculation ────────────────────────────────
  const stockRows = useMemo((): StockRow[] => {
    const rows: StockRow[] = []
    const remanentMap: Record<string, { qty: number; unit: string }> = {}

    // Build remanent map from latest remanent
    if (lastRemanent) {
      for (const entry of lastRemanent.entries) {
        remanentMap[entry.name] = { qty: entry.quantity, unit: entry.unit }
      }
    }

    // Build deliveries map (since remanent date)
    const deliveriesMap: Record<string, number> = {}
    const remanentDate = lastRemanent?.date || '2000-01-01'
    for (const d of deliveries) {
      if (d.date >= remanentDate) {
        deliveriesMap[d.productName] = (deliveriesMap[d.productName] || 0) + d.quantity
      }
    }

    // Build rows for all products
    const seen = new Set<string>()
    for (const p of ALL_PRODUCTS) {
      if (seen.has(p.name)) continue
      seen.add(p.name)

      const rem = remanentMap[p.name]?.qty || 0
      const del = deliveriesMap[p.name] || 0
      const con = consumptionByProduct[p.name] || 0
      const theoretical = Math.round((rem + del - con) * 1000) / 1000

      rows.push({
        name: p.name,
        category: p.category,
        unit: p.unit,
        remanentQty: rem,
        deliveriesQty: del,
        consumptionQty: Math.round(con * 1000) / 1000,
        theoreticalStock: theoretical,
      })
    }

    return rows
  }, [lastRemanent, deliveries, consumptionByProduct])

  // ─── Grouped & filtered stock ─────────────────────────
  const groupedStock = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    const filtered = term
      ? stockRows.filter(r => r.name.toLowerCase().includes(term))
      : stockRows

    const map: Record<string, StockRow[]> = {}
    for (const r of filtered) {
      if (!map[r.category]) map[r.category] = []
      map[r.category].push(r)
    }
    return CATEGORY_ORDER
      .filter(cat => map[cat]?.length)
      .map(cat => ({ category: cat, items: map[cat] }))
  }, [stockRows, searchTerm])

  // ─── Color coding ────────────────────────────────────
  function stockColor(row: StockRow): string {
    if (row.remanentQty === 0) return ''
    const ratio = row.theoreticalStock / row.remanentQty
    if (ratio > 0.5) return 'bg-emerald-50 border-l-4 border-l-emerald-400'
    if (ratio >= 0.2) return 'bg-amber-50 border-l-4 border-l-amber-400'
    return 'bg-red-50 border-l-4 border-l-red-400'
  }

  // ─── Toggle category ─────────────────────────────────
  const toggleCategory = useCallback((cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  // ─── Add delivery ─────────────────────────────────────
  const handleAddDelivery = () => {
    const qty = parseFloat(deliveryQty.replace(',', '.'))
    if (!deliveryProduct || isNaN(qty) || qty <= 0) {
      alert('Wybierz produkt i podaj ilość')
      return
    }
    const newDelivery: Delivery = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: todayISO(),
      productName: deliveryProduct,
      quantity: qty,
      unit: deliveryUnit,
      addedBy: user?.full_name || user?.email || 'Nieznany',
      note: deliveryNote.trim(),
    }
    const updated = [newDelivery, ...deliveries]
    setDeliveries(updated)
    saveDeliveries(updated)
    setDeliveryProduct('')
    setDeliveryQty('')
    setDeliveryNote('')
    setProductSearch('')
  }

  // ─── Product dropdown filter ──────────────────────────
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return ALL_PRODUCTS
    const term = productSearch.toLowerCase()
    return ALL_PRODUCTS.filter(p => p.name.toLowerCase().includes(term))
  }, [productSearch])

  // ─── Loading / auth ───────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Ładowanie...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Zaloguj się</h2>
          <p className="text-sm text-gray-500 mb-4">Musisz być zalogowany, żeby korzystać z magazynu.</p>
          <Link href="/login" className="inline-block px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">
            Zaloguj się
          </Link>
        </div>
      </div>
    )
  }

  const recentDeliveries = deliveries.slice(0, 20)

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      {/* ─── Header ──────────────────────────────────── */}
      <div className="bg-gradient-to-br from-teal-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-sm">←</Link>
          <h1 className="text-xl font-bold">Magazyn</h1>
        </div>
        <p className="text-teal-100 text-sm mt-1 ml-11">
          {lastRemanent
            ? `Ostatni remanent: ${fmtDate(lastRemanent.date)} · ${lastRemanent.employee}`
            : 'Brak zapisanego remanentu'
          }
        </p>

        {/* Stats bar */}
        <div className="mt-4 flex gap-3">
          <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{stockRows.filter(r => r.theoreticalStock > 0).length}</div>
            <div className="text-xs text-teal-100">Na stanie</div>
          </div>
          <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{deliveries.filter(d => d.date === todayISO()).length}</div>
            <div className="text-xs text-teal-100">Dostawy dziś</div>
          </div>
          <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">
              {stockRows.filter(r => r.remanentQty > 0 && r.theoreticalStock / r.remanentQty < 0.2).length}
            </div>
            <div className="text-xs text-teal-100">Niski stan</div>
          </div>
        </div>
      </div>

      {/* ─── Tabs ────────────────────────────────────── */}
      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 flex gap-1">
          {([
            { id: 'stan' as TabId, label: 'Stan', icon: '📊' },
            { id: 'dostawy' as TabId, label: 'Dostawy', icon: '📦' },
            { id: 'zuzycie' as TabId, label: 'Zużycie', icon: '📉' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tab: Stan ───────────────────────────────── */}
      {tab === 'stan' && (
        <>
          {/* Search */}
          <div className="px-4 mt-4">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="🔍 Szukaj produktu..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">✕</button>
              )}
            </div>
          </div>

          {/* Grouped stock table */}
          <div className="px-4 mt-4 space-y-3">
            {groupedStock.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">
                {searchTerm ? 'Nie znaleziono produktów' : 'Brak danych remanentu'}
              </div>
            )}
            {groupedStock.map(group => (
              <div key={group.category} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  onClick={() => toggleCategory(group.category)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/80"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CAT_ICONS[group.category] || '📋'}</span>
                    <span className="font-semibold text-gray-800 text-sm">{group.category}</span>
                    <span className="text-xs text-gray-400">({group.items.length})</span>
                  </div>
                  <span className={`text-gray-400 text-xs transition-transform ${expandedCats.has(group.category) ? 'rotate-180' : ''}`}>▼</span>
                </button>

                {expandedCats.has(group.category) && (
                  <div>
                    {/* Column header */}
                    <div className="grid grid-cols-[1fr_50px_50px_50px_55px_30px] gap-1 px-4 py-1.5 text-[10px] text-gray-400 font-medium uppercase border-b border-gray-100">
                      <div>Produkt</div>
                      <div className="text-right">Rem.</div>
                      <div className="text-right text-emerald-500">+Dost.</div>
                      <div className="text-right text-red-400">−Zuż.</div>
                      <div className="text-right font-bold">Stan</div>
                      <div className="text-right">Jdn.</div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {group.items.map(row => (
                        <div
                          key={row.name}
                          className={`grid grid-cols-[1fr_50px_50px_50px_55px_30px] gap-1 px-4 py-2 items-center ${stockColor(row)}`}
                        >
                          <div className="text-sm text-gray-800 truncate">{row.name}</div>
                          <div className="text-xs text-gray-500 text-right">{row.remanentQty > 0 ? row.remanentQty : '—'}</div>
                          <div className="text-xs text-emerald-600 text-right">{row.deliveriesQty > 0 ? `+${row.deliveriesQty}` : '—'}</div>
                          <div className="text-xs text-red-500 text-right">{row.consumptionQty > 0 ? `−${row.consumptionQty}` : '—'}</div>
                          <div className={`text-sm font-bold text-right ${
                            row.theoreticalStock < 0 ? 'text-red-600' : row.theoreticalStock > 0 ? 'text-gray-900' : 'text-gray-400'
                          }`}>
                            {row.theoreticalStock !== 0 ? row.theoreticalStock : '—'}
                          </div>
                          <div className="text-[10px] text-gray-400 text-right">{row.unit}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Tab: Dostawy ────────────────────────────── */}
      {tab === 'dostawy' && (
        <div className="px-4 mt-4 space-y-4">
          {/* Add delivery form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <span className="text-lg">📥</span> Dodaj dostawę
            </h3>

            {/* Product search dropdown */}
            <div className="relative">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Produkt</label>
              <input
                type="text"
                value={deliveryProduct || productSearch}
                onChange={e => {
                  setProductSearch(e.target.value)
                  setDeliveryProduct('')
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Szukaj produktu..."
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
              />
              {showDropdown && filteredProducts.length > 0 && !deliveryProduct && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.slice(0, 30).map(p => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setDeliveryProduct(p.name)
                        setDeliveryUnit(p.unit)
                        setProductSearch('')
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-teal-50 flex justify-between items-center"
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-gray-400">{p.unit}</span>
                    </button>
                  ))}
                </div>
              )}
              {deliveryProduct && (
                <button
                  onClick={() => { setDeliveryProduct(''); setProductSearch('') }}
                  className="absolute right-3 top-8 text-gray-400 text-sm"
                >✕</button>
              )}
            </div>

            {/* Qty + Unit */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ilość</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={deliveryQty}
                  onChange={e => {
                    const v = e.target.value.replace(',', '.')
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setDeliveryQty(v)
                  }}
                  placeholder="0"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
                />
              </div>
              <div className="w-24">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Jednostka</label>
                <select
                  value={deliveryUnit}
                  onChange={e => setDeliveryUnit(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
                >
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="szt">szt</option>
                </select>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notatka (opcjonalna)</label>
              <input
                type="text"
                value={deliveryNote}
                onChange={e => setDeliveryNote(e.target.value)}
                placeholder="np. MAKRO, Coca-Cola HBC..."
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleAddDelivery}
              className="w-full py-3 rounded-xl bg-teal-600 text-white text-sm font-bold shadow-sm active:bg-teal-700 transition"
            >
              Zapisz dostawę
            </button>
          </div>

          {/* Recent deliveries list */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50/80 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">Ostatnie dostawy</h3>
              <span className="text-xs text-gray-400">{recentDeliveries.length} pozycji</span>
            </div>
            {recentDeliveries.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Brak zapisanych dostaw</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentDeliveries.map(d => (
                  <div key={d.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">{d.productName}</span>
                      <span className="text-sm font-bold text-teal-600">+{d.quantity} {d.unit}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-gray-400">
                        {fmtDate(d.date)} · {d.addedBy}
                        {d.note && <span className="ml-1 text-gray-500">· {d.note}</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Zuzycie ────────────────────────────── */}
      {tab === 'zuzycie' && (
        <div className="px-4 mt-4 space-y-4">
          {/* Date range picker */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2 mb-3">
              <span className="text-lg">📅</span> Zakres dat
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Od</label>
                <input
                  type="date"
                  value={dateStart}
                  onChange={e => setDateStart(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Do</label>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={e => setDateEnd(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
                />
              </div>
            </div>
            {salesLoading && (
              <div className="mt-3 text-xs text-teal-600 flex items-center gap-2">
                <span className="animate-spin">⟳</span> Pobieranie danych z GoPOS...
              </div>
            )}
            {salesError && (
              <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{salesError}</div>
            )}
          </div>

          {/* Consumption by dish */}
          {consumptionByDish.length === 0 && !salesLoading ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">
              Brak danych sprzedaży za wybrany okres
            </div>
          ) : (
            <div className="space-y-3">
              {consumptionByDish.map(dish => (
                <div key={dish.recipeId} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50/80 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-gray-800 text-sm">{dish.dishName}</span>
                    </div>
                    <span className="text-sm font-bold text-teal-600">{dish.sold} szt</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {dish.ingredients.map(ing => (
                      <div key={ing.name} className="px-4 py-1.5 flex items-center justify-between">
                        <span className="text-xs text-gray-600">{ing.name}</span>
                        <span className="text-xs font-medium text-red-500">−{ing.qty} {ing.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Consumption totals */}
              {consumptionByDish.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-teal-200 overflow-hidden">
                  <div className="px-4 py-3 bg-teal-50">
                    <h3 className="font-semibold text-teal-800 text-sm">Sumaryczne zużycie surowców</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {Object.entries(consumptionByProduct)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, qty]) => (
                        <div key={name} className="px-4 py-2 flex items-center justify-between">
                          <span className="text-sm text-gray-800">{name}</span>
                          <span className="text-sm font-bold text-red-500">
                            −{Math.round(qty * 1000) / 1000} kg
                          </span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Bottom safe area spacer ─────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] z-[999]">
        <div className="flex gap-2">
          {([
            { id: 'stan' as TabId, label: 'Stan', icon: '📊' },
            { id: 'dostawy' as TabId, label: 'Dostawy', icon: '📦' },
            { id: 'zuzycie' as TabId, label: 'Zużycie', icon: '📉' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition ${
                tab === t.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <div className="text-base">{t.icon}</div>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
