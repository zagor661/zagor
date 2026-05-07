'use client'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole, normalizeRole } from '@/lib/roles'
import { FOODCOST_PRODUCTS } from '@/lib/foodcostProducts'

// ─── Types ──────────────────────────────────────────────────
interface RecipeLine {
  productName: string
  pricePerKg: number
  quantity: number // in kg
}

interface Recipe {
  id: string
  name: string
  category: string
  sellingPrice: number
  portions: number
  lines: RecipeLine[]
}

// ─── GoPOS ↔ Food Cost mapping ─────────────────────────────
// GoPOS name → foodcostProducts dish name
const GOPOS_TO_FC: Record<string, string> = {
  '01 TOKYO': 'TOKIO',
  '02 JOKOHAMA': 'YOKOHAMA',
  '03 OSAKA': 'OSAKA',
  '04 KOBE': 'KOBE',
  '05 SAPPORO': 'SAPPORO',
  '06 NAGOJA': 'NAGOJA',
  '07 WEGETARIAN SAN': 'WEGETARIAN SAN',
  '08 SAN VEGAN': 'SAN WEGAN',
  '09 SAMON SAN': 'SAMON SAN',
  '10 SENDAI': 'SENDAI',
  '11 NARA': 'NARA',
  '12 Kompozycja Własna': 'KOMPOZYCJA',
  '13 Kompozycja Własna Krewetka': 'KOMPOZYCJA KREWETKA',
}

interface SalesItemData {
  goposName: string
  fcName: string | null
  quantity: number
  revenue: number
  sellingPrice: number
}

type SalesPeriod = 'today' | 'week' | 'month'

type TabType = 'sales' | 'recipes' | 'ingredients' | 'add-recipe'

const RECIPE_CATEGORIES = [
  { value: 'main', label: 'Danie główne' },
  { value: 'starter', label: 'Przystawka' },
  { value: 'soup', label: 'Zupa' },
  { value: 'side', label: 'Dodatek' },
  { value: 'drink', label: 'Napój' },
  { value: 'dessert', label: 'Deser' },
]

// Get only ingredients (not dishes) from foodcost
const INGREDIENTS = FOODCOST_PRODUCTS.filter(p => p.type === 'ingredient')
const CATEGORY_ORDER = ['Makarony', 'Mięso', 'Ryby', 'Warzywa', 'Azjatyckie', 'Przyprawy', 'Inne', 'Opakowania']

// LocalStorage key for recipes
const RECIPES_KEY = 'kitchenops_recipes'

function loadRecipes(): Recipe[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECIPES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecipes(recipes: Recipe[]) {
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes))
}

// ─── Component ──────────────────────────────────────────────
export default function FoodCostPage() {
  const { user, loading } = useUser()
  const canAccess = user ? (isAdminRole(user.role) || normalizeRole(user.role) === 'kitchen') : false

  const [tab, setTab] = useState<TabType>('sales')
  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes)

  // Sales state
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>('today')
  const [salesItems, setSalesItems] = useState<SalesItemData[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesTotalRevenue, setSalesTotalRevenue] = useState(0)
  const [salesTotalQty, setSalesTotalQty] = useState(0)

  // Search
  const [searchIng, setSearchIng] = useState('')
  const [searchRec, setSearchRec] = useState('')

  // New recipe form
  const [recName, setRecName] = useState('')
  const [recCategory, setRecCategory] = useState('main')
  const [recPortions, setRecPortions] = useState('1')
  const [recPrice, setRecPrice] = useState('')
  const [recLines, setRecLines] = useState<{ name: string; quantity: string }[]>([])
  const [lineQuery, setLineQuery] = useState('')
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null)

  // Detail view
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)

  // ─── Fetch sales from GoPOS ────────────────────────────
  useEffect(() => {
    if (tab === 'sales' && canAccess) fetchSales(salesPeriod)
  }, [tab, salesPeriod, canAccess])

  async function fetchSales(period: SalesPeriod) {
    setSalesLoading(true)
    try {
      const { start, end } = getSalesPeriodRange(period)
      const res = await fetch(`/api/gopos?action=sales_by_item&date_start=${start}&date_end=${end}`)
      const json = await res.json()

      if (!json.ok) {
        setSalesItems([])
        setSalesLoading(false)
        return
      }

      // Parse server-aggregated items
      const rawItems = json.data?.items || []
      const items: SalesItemData[] = []
      let totalRev = 0
      let totalQty = 0

      for (const ri of rawItems) {
        const goposName = ri.name || 'Nieznany'
        const qty = ri.quantity || 0
        const revenue = ri.revenue || 0
        const sellingPrice = qty > 0 ? revenue / qty : 0
        const fcName = GOPOS_TO_FC[goposName] || null

        if (qty > 0) {
          items.push({ goposName, fcName, quantity: qty, revenue, sellingPrice })
          totalRev += revenue
          totalQty += qty
        }
      }

      items.sort((a, b) => b.revenue - a.revenue)
      setSalesItems(items)
      setSalesTotalRevenue(totalRev)
      setSalesTotalQty(totalQty)
    } catch {
      setSalesItems([])
    }
    setSalesLoading(false)
  }

  function getSalesPeriodRange(p: SalesPeriod): { start: string; end: string } {
    const now = new Date()
    const end = now.toISOString().split('T')[0]
    switch (p) {
      case 'today': return { start: end, end }
      case 'week': {
        const d = new Date(now); d.setDate(d.getDate() - 7)
        return { start: d.toISOString().split('T')[0], end }
      }
      case 'month': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1)
        return { start: d.toISOString().split('T')[0], end }
      }
    }
  }

  // Match a GoPOS item to a local recipe for FC% calculation
  function getRecipeFc(fcName: string | null, sellingPrice: number): number | null {
    if (!fcName) return null
    const recipe = recipes.find(r => r.name.toUpperCase() === fcName.toUpperCase())
    if (!recipe || recipe.lines.length === 0) return null
    const cost = calcCost(recipe.lines) / (recipe.portions || 1)
    return sellingPrice > 0 ? (cost / sellingPrice) * 100 : null
  }

  // ─── Filtered ingredients ──────────────────────────────
  const filteredIngredients = useMemo(() => {
    const q = searchIng.toLowerCase()
    return INGREDIENTS.filter(p =>
      p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    )
  }, [searchIng])

  // ─── Ingredient suggestions for recipe lines ──────────
  const lineSuggestions = useMemo(() => {
    if (activeLineIdx === null) return []
    const line = recLines[activeLineIdx]
    if (!line || line.name.length < 1) return []
    const q = line.name.toLowerCase()
    return INGREDIENTS.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6)
  }, [recLines, activeLineIdx])

  // ─── Calculate recipe cost ─────────────────────────────
  function calcCost(lines: RecipeLine[]): number {
    return lines.reduce((sum, l) => sum + l.pricePerKg * l.quantity, 0)
  }

  // ─── Add recipe ────────────────────────────────────────
  function addRecipe() {
    if (!recName.trim() || !recPrice) return
    const lines: RecipeLine[] = recLines
      .filter(l => l.name && parseFloat(l.quantity) > 0)
      .map(l => {
        const product = INGREDIENTS.find(p => p.name === l.name)
        return {
          productName: l.name,
          pricePerKg: product?.price_per_kg || 0,
          quantity: parseFloat(l.quantity),
        }
      })

    const newRecipe: Recipe = {
      id: Date.now().toString(),
      name: recName.trim(),
      category: recCategory,
      sellingPrice: parseFloat(recPrice),
      portions: parseInt(recPortions) || 1,
      lines,
    }

    const updated = [...recipes, newRecipe]
    setRecipes(updated)
    saveRecipes(updated)
    setRecName(''); setRecPrice(''); setRecPortions('1'); setRecLines([])
    setTab('recipes')
  }

  // ─── Delete recipe ─────────────────────────────────────
  function deleteRecipe(id: string) {
    if (!confirm('Usunąć przepis?')) return
    const updated = recipes.filter(r => r.id !== id)
    setRecipes(updated)
    saveRecipes(updated)
    setSelectedRecipe(null)
  }

  // ─── Render ───────────────────────────────────────────────
  if (loading || !user) return null

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="font-bold text-lg">Brak dostępu</h2>
          <Link href="/" className="mt-4 inline-block text-brand-600 font-medium text-sm">← Powrót</Link>
        </div>
      </div>
    )
  }

  const filteredRec = recipes.filter(r =>
    r.name.toLowerCase().includes(searchRec.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-lime-600 to-green-600 text-white p-4 flex items-center justify-between shadow-lg">
        <Link href="/" className="text-white/70 font-medium text-sm">← Powrót</Link>
        <div className="text-center">
          <h1 className="text-lg font-bold">💰 Food Cost</h1>
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em]">{user?.location_name || 'KitchenOps'}</p>
        </div>
        <div className="w-16" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {([
          ['sales', '📈 Sprzedaz'],
          ['ingredients', '🥬 Składniki'],
          ['recipes', '🍜 Przepisy'],
          ['add-recipe', '+ Przepis'],
        ] as [TabType, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-xs font-semibold text-center transition-all ${
              tab === key ? 'text-green-600 border-b-2 border-green-500' : 'text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto p-4">

        {/* ═══════════════════════════════════════════════
             SALES TAB — live z GoPOS
           ═══════════════════════════════════════════════ */}
        {tab === 'sales' && (
          <div className="space-y-4">
            {/* Period selector */}
            <div className="flex gap-2">
              {([
                ['today', 'Dzisiaj'],
                ['week', '7 dni'],
                ['month', 'Miesiąc'],
              ] as [SalesPeriod, string][]).map(([p, label]) => (
                <button
                  key={p}
                  onClick={() => setSalesPeriod(p)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                    salesPeriod === p
                      ? 'bg-gray-900 text-white shadow-md'
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {salesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
              </div>
            ) : salesItems.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-2 opacity-30">📊</div>
                <p className="text-gray-400 text-sm">Brak danych sprzedazowych</p>
                <p className="text-[10px] text-gray-300 mt-1">Sprawdz polaczenie z GoPOS</p>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-emerald-600 font-semibold">Przychod</div>
                    <div className="text-lg font-bold text-emerald-700">
                      {new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(salesTotalRevenue)}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-blue-600 font-semibold">Sprzedano</div>
                    <div className="text-lg font-bold text-blue-700">{Math.round(salesTotalQty)}</div>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-violet-600 font-semibold">Sr. cena</div>
                    <div className="text-lg font-bold text-violet-700">
                      {salesTotalQty > 0 ? `${(salesTotalRevenue / salesTotalQty).toFixed(0)} zl` : '—'}
                    </div>
                  </div>
                </div>

                {/* Per-item breakdown */}
                <div className="space-y-2">
                  {salesItems.map((item, i) => {
                    const fc = getRecipeFc(item.fcName, item.sellingPrice)
                    const hasRecipe = item.fcName && recipes.some(r => r.name.toUpperCase() === item.fcName?.toUpperCase())

                    return (
                      <div key={i} className="bg-white rounded-xl border border-gray-100 p-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                            i === 0 ? 'bg-yellow-100 text-yellow-700' :
                            i === 1 ? 'bg-gray-100 text-gray-600' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-50 text-gray-400'
                          }`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 text-sm truncate">{item.goposName}</div>
                            <div className="text-[10px] text-gray-400">
                              {Math.round(item.quantity)}x · {item.sellingPrice.toFixed(0)} zl/szt
                              {item.fcName && !hasRecipe && (
                                <span className="ml-1 text-amber-500">· brak receptury</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold text-gray-900 text-sm">
                              {new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(item.revenue)}
                            </div>
                            {fc !== null ? (
                              <div className={`text-[10px] font-bold ${
                                fc <= 30 ? 'text-green-600' : fc <= 35 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                FC: {fc.toFixed(1)}%
                              </div>
                            ) : (
                              <div className="text-[10px] text-gray-300">FC: —</div>
                            )}
                          </div>
                        </div>

                        {/* Revenue bar */}
                        <div className="mt-2 w-full bg-gray-100 rounded-full h-1">
                          <div
                            className="h-1 rounded-full bg-emerald-400"
                            style={{ width: `${Math.min((item.revenue / salesTotalRevenue) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Info */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400">
                    Dane live z GoPOS · FC% liczone z Twoich receptur
                  </p>
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    Dodaj receptury w zakladce &quot;Przepisy&quot; zeby zobaczyc FC%
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
             INGREDIENTS TAB — z foodcostProducts.ts
           ═══════════════════════════════════════════════ */}
        {tab === 'ingredients' && (
          <div className="space-y-3">
            <input
              type="text"
              value={searchIng}
              onChange={e => setSearchIng(e.target.value)}
              placeholder="Szukaj składnika..."
              className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-300 outline-none"
            />

            <div className="text-[10px] text-gray-400 text-right">
              {filteredIngredients.length} składników
            </div>

            {CATEGORY_ORDER.map(cat => {
              const items = filteredIngredients.filter(p => p.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 px-1">
                    {cat} ({items.length})
                  </div>
                  <div className="space-y-1">
                    {items.map((p, i) => (
                      <div key={i} className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between">
                        <span className="text-sm text-gray-700 font-medium">{p.name}</span>
                        <div className="text-right">
                          {p.price_per_kg != null && p.price_per_kg > 0 ? (
                            <>
                              <span className="text-sm font-bold text-gray-900">{p.price_per_kg.toFixed(2)} zł</span>
                              <span className="text-[10px] text-gray-400 ml-1">/kg</span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-300">brak ceny</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
             RECIPES TAB
           ═══════════════════════════════════════════════ */}
        {tab === 'recipes' && (
          <div className="space-y-3">
            <input
              type="text"
              value={searchRec}
              onChange={e => setSearchRec(e.target.value)}
              placeholder="Szukaj przepisu..."
              className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-300 outline-none"
            />

            {filteredRec.length === 0 && (
              <div className="text-center py-8">
                <div className="text-4xl mb-2 opacity-30">🍜</div>
                <p className="text-gray-400 text-sm">Brak przepisów</p>
                <button onClick={() => setTab('add-recipe')} className="mt-3 text-green-600 text-sm font-semibold">
                  + Dodaj pierwszy przepis
                </button>
              </div>
            )}

            {filteredRec.map(rec => {
              const cost = calcCost(rec.lines)
              const costPerPortion = rec.portions > 0 ? cost / rec.portions : cost
              const fcPercent = rec.sellingPrice > 0 ? (costPerPortion / rec.sellingPrice) * 100 : 0
              const isOpen = selectedRecipe === rec.id

              return (
                <div key={rec.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setSelectedRecipe(isOpen ? null : rec.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-900 truncate">{rec.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {RECIPE_CATEGORIES.find(c => c.value === rec.category)?.label || rec.category}
                          {rec.portions > 1 && ` · ${rec.portions} porcji`}
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        <div className="text-sm font-bold text-gray-900">
                          {costPerPortion.toFixed(2)} zł
                        </div>
                        <div className={`text-[10px] font-bold ${
                          fcPercent <= 30 ? 'text-green-600' : fcPercent <= 35 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          FC: {fcPercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          fcPercent <= 30 ? 'bg-green-500' : fcPercent <= 35 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(fcPercent, 100)}%` }}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white rounded-xl p-2">
                          <div className="text-[10px] text-gray-400">Koszt</div>
                          <div className="text-sm font-bold">{costPerPortion.toFixed(2)} zł</div>
                        </div>
                        <div className="bg-white rounded-xl p-2">
                          <div className="text-[10px] text-gray-400">Cena</div>
                          <div className="text-sm font-bold">{rec.sellingPrice.toFixed(2)} zł</div>
                        </div>
                        <div className="bg-white rounded-xl p-2">
                          <div className="text-[10px] text-gray-400">Marża</div>
                          <div className="text-sm font-bold text-green-600">
                            {(rec.sellingPrice - costPerPortion).toFixed(2)} zł
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-gray-400 font-semibold uppercase">
                        Składniki ({rec.lines.length})
                      </div>
                      {rec.lines.map((line, i) => (
                        <div key={i} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                          <div>
                            <span className="text-sm text-gray-700">{line.productName}</span>
                            <span className="text-xs text-gray-400 ml-2">{line.quantity} kg</span>
                          </div>
                          <span className="text-xs font-bold text-gray-600">
                            {(line.pricePerKg * line.quantity).toFixed(2)} zł
                          </span>
                        </div>
                      ))}

                      <button onClick={() => deleteRecipe(rec.id)}
                        className="text-xs text-red-400 hover:text-red-600">
                        Usuń przepis
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {filteredRec.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <div className="text-xs text-green-600 font-semibold">Średni Food Cost</div>
                <div className="text-2xl font-bold text-green-700">
                  {(() => {
                    const valid = filteredRec.filter(r => r.sellingPrice > 0 && r.lines.length > 0)
                    if (valid.length === 0) return '—'
                    const avg = valid.reduce((s, r) => {
                      const c = calcCost(r.lines) / (r.portions || 1)
                      return s + (c / r.sellingPrice * 100)
                    }, 0) / valid.length
                    return `${avg.toFixed(1)}%`
                  })()}
                </div>
                <div className="text-[10px] text-green-500 mt-1">Cel: poniżej 30%</div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
             ADD RECIPE — z autocomplete z foodcostProducts
           ═══════════════════════════════════════════════ */}
        {tab === 'add-recipe' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Nowy przepis</h2>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Nazwa dania</label>
              <input value={recName} onChange={e => setRecName(e.target.value)}
                placeholder="np. Pad Thai z kurczakiem" className="w-full p-3 border rounded-xl text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Kategoria</label>
                <select value={recCategory} onChange={e => setRecCategory(e.target.value)}
                  className="w-full p-3 border rounded-xl text-sm bg-white">
                  {RECIPE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Ilość porcji</label>
                <input type="number" min="1" value={recPortions} onChange={e => setRecPortions(e.target.value)}
                  className="w-full p-3 border rounded-xl text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Cena sprzedaży (PLN)</label>
              <input type="number" step="0.01" value={recPrice} onChange={e => setRecPrice(e.target.value)}
                placeholder="np. 32.00" className="w-full p-3 border rounded-xl text-sm" />
            </div>

            {/* Recipe lines with autocomplete */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500">Składniki</label>
                <button
                  onClick={() => { setRecLines([...recLines, { name: '', quantity: '' }]); setActiveLineIdx(recLines.length) }}
                  className="text-xs text-green-600 font-semibold"
                >
                  + Dodaj składnik
                </button>
              </div>

              <div className="space-y-2">
                {recLines.map((line, idx) => {
                  const product = INGREDIENTS.find(p => p.name === line.name)
                  const lineCost = product?.price_per_kg && parseFloat(line.quantity)
                    ? (product.price_per_kg * parseFloat(line.quantity)).toFixed(2)
                    : null

                  return (
                    <div key={idx} className="relative">
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={line.name}
                            onChange={e => {
                              const updated = [...recLines]
                              updated[idx].name = e.target.value
                              setRecLines(updated)
                              setActiveLineIdx(idx)
                            }}
                            onFocus={() => setActiveLineIdx(idx)}
                            placeholder="Wpisz składnik..."
                            className="w-full p-2 border rounded-lg text-xs bg-white"
                          />
                          {/* Autocomplete dropdown */}
                          {activeLineIdx === idx && lineSuggestions.length > 0 && line.name.length > 0 && !product && (
                            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {lineSuggestions.map((s, si) => (
                                <button
                                  key={si}
                                  onClick={() => {
                                    const updated = [...recLines]
                                    updated[idx].name = s.name
                                    setRecLines(updated)
                                    setActiveLineIdx(null)
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-green-50 flex justify-between"
                                >
                                  <span>{s.name}</span>
                                  <span className="text-gray-400">
                                    {s.price_per_kg ? `${s.price_per_kg} zł/kg` : '—'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          value={line.quantity}
                          onChange={e => {
                            const updated = [...recLines]
                            updated[idx].quantity = e.target.value
                            setRecLines(updated)
                          }}
                          placeholder="kg"
                          className="w-20 p-2 border rounded-lg text-xs text-right"
                        />
                        {lineCost && (
                          <span className="text-[10px] font-bold text-green-600 w-16 text-right">{lineCost} zł</span>
                        )}
                        <button onClick={() => setRecLines(recLines.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 text-sm p-1">✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Live cost preview */}
              {recLines.some(l => l.name && parseFloat(l.quantity) > 0) && (
                <div className="mt-3 bg-lime-50 border border-lime-200 rounded-xl p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Koszt składników:</span>
                    <span className="font-bold">
                      {recLines.reduce((sum, l) => {
                        const p = INGREDIENTS.find(x => x.name === l.name)
                        return sum + (parseFloat(l.quantity) || 0) * (p?.price_per_kg || 0)
                      }, 0).toFixed(2)} zł
                    </span>
                  </div>
                  {recPrice && parseFloat(recPrice) > 0 && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-600">Food Cost:</span>
                      {(() => {
                        const cost = recLines.reduce((sum, l) => {
                          const p = INGREDIENTS.find(x => x.name === l.name)
                          return sum + (parseFloat(l.quantity) || 0) * (p?.price_per_kg || 0)
                        }, 0)
                        const fc = cost / (parseInt(recPortions) || 1) / parseFloat(recPrice) * 100
                        return (
                          <span className={`font-bold ${fc <= 30 ? 'text-green-600' : fc <= 35 ? 'text-amber-600' : 'text-red-600'}`}>
                            {fc.toFixed(1)}%
                          </span>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={addRecipe} disabled={!recName.trim() || !recPrice}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm disabled:opacity-40">
              Dodaj przepis
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
