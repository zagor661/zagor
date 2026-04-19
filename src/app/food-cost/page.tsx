'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole, normalizeRole } from '@/lib/roles'
import supabase from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────
interface Ingredient {
  id: string
  name: string
  unit: string
  price_per_unit: number
  supplier: string | null
  category: string
  is_active: boolean
}

interface Recipe {
  id: string
  name: string
  category: string
  brand: string
  portions: number
  selling_price: number | null
  notes: string | null
  is_active: boolean
}

interface RecipeIngredient {
  id: string
  recipe_id: string
  ingredient_id: string
  quantity: number
  unit: string
  notes: string | null
  ingredient_name?: string
  ingredient_price?: number
  ingredient_unit?: string
}

type TabType = 'recipes' | 'ingredients' | 'add-recipe' | 'add-ingredient'

const CATEGORIES = [
  { value: 'warzywa', label: '🥬 Warzywa' },
  { value: 'mieso', label: '🍗 Mięso' },
  { value: 'nabial', label: '🧀 Nabiał' },
  { value: 'suche', label: '🌾 Suche / sypkie' },
  { value: 'sosy', label: '🫙 Sosy / przyprawy' },
  { value: 'makarony', label: '🍜 Makarony / ryż' },
  { value: 'owoce_morza', label: '🦐 Owoce morza' },
  { value: 'napoje', label: '🥤 Napoje' },
  { value: 'opakowania', label: '📦 Opakowania' },
  { value: 'inne', label: '📎 Inne' },
]

const RECIPE_CATEGORIES = [
  { value: 'main', label: 'Danie główne' },
  { value: 'starter', label: 'Przystawka' },
  { value: 'soup', label: 'Zupa' },
  { value: 'side', label: 'Dodatek' },
  { value: 'drink', label: 'Napój' },
  { value: 'dessert', label: 'Deser' },
]

const UNITS = ['kg', 'g', 'l', 'ml', 'szt', 'opak']

// ─── Component ──────────────────────────────────────────────
export default function FoodCostPage() {
  const { user, loading } = useUser()
  const canAccess = user ? (isAdminRole(user.role) || normalizeRole(user.role) === 'kitchen') : false

  const [tab, setTab] = useState<TabType>('recipes')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recipeIngredients, setRecipeIngredients] = useState<Record<string, RecipeIngredient[]>>({})
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New ingredient form
  const [ingName, setIngName] = useState('')
  const [ingUnit, setIngUnit] = useState('kg')
  const [ingPrice, setIngPrice] = useState('')
  const [ingSupplier, setIngSupplier] = useState('')
  const [ingCategory, setIngCategory] = useState('inne')

  // New recipe form
  const [recName, setRecName] = useState('')
  const [recCategory, setRecCategory] = useState('main')
  const [recPortions, setRecPortions] = useState('1')
  const [recPrice, setRecPrice] = useState('')
  const [recNotes, setRecNotes] = useState('')
  const [recLines, setRecLines] = useState<{ ingredient_id: string; quantity: string; unit: string }[]>([])

  // Detail view
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)

  // Search
  const [searchIng, setSearchIng] = useState('')
  const [searchRec, setSearchRec] = useState('')

  // ─── Load data ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadingData(true)
    const { data: ingData } = await supabase
      .from('ingredients')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (ingData) setIngredients(ingData)

    const { data: recData } = await supabase
      .from('recipes')
      .select('*')
      .eq('is_active', true)
      .eq('brand', 'woki_woki')
      .order('name')
    if (recData) {
      setRecipes(recData)
      // Load all recipe ingredients
      const ids = recData.map(r => r.id)
      if (ids.length > 0) {
        const { data: riData } = await supabase
          .from('recipe_ingredients')
          .select('*')
          .in('recipe_id', ids)
        if (riData && ingData) {
          const grouped: Record<string, RecipeIngredient[]> = {}
          riData.forEach(ri => {
            const ing = ingData.find(i => i.id === ri.ingredient_id)
            const enriched = {
              ...ri,
              ingredient_name: ing?.name || '?',
              ingredient_price: ing?.price_per_unit || 0,
              ingredient_unit: ing?.unit || ri.unit,
            }
            if (!grouped[ri.recipe_id]) grouped[ri.recipe_id] = []
            grouped[ri.recipe_id].push(enriched)
          })
          setRecipeIngredients(grouped)
        }
      }
    }
    setLoadingData(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─── Calculate cost ─────────────────────────────────────
  function calcRecipeCost(recipeId: string): number {
    const lines = recipeIngredients[recipeId] || []
    return lines.reduce((sum, line) => {
      return sum + (line.quantity * (line.ingredient_price || 0))
    }, 0)
  }

  function calcFoodCostPercent(recipeId: string, sellingPrice: number | null): number {
    if (!sellingPrice || sellingPrice <= 0) return 0
    const cost = calcRecipeCost(recipeId)
    const recipe = recipes.find(r => r.id === recipeId)
    const portions = recipe?.portions || 1
    return (cost / portions / sellingPrice) * 100
  }

  // ─── Add ingredient ──────────────────────────────────────
  async function addIngredient() {
    if (!ingName.trim() || !ingPrice) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('ingredients').insert({
      name: ingName.trim(),
      unit: ingUnit,
      price_per_unit: parseFloat(ingPrice),
      supplier: ingSupplier.trim() || null,
      category: ingCategory,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setIngName(''); setIngPrice(''); setIngSupplier('')
    setSuccess('Składnik dodany!')
    setTimeout(() => setSuccess(''), 3000)
    setSaving(false)
    loadData()
    setTab('ingredients')
  }

  // ─── Add recipe ──────────────────────────────────────────
  async function addRecipe() {
    if (!recName.trim()) return
    setSaving(true)
    setError('')

    const { data: newRec, error: err } = await supabase.from('recipes').insert({
      name: recName.trim(),
      category: recCategory,
      brand: 'woki_woki',
      portions: parseInt(recPortions) || 1,
      selling_price: recPrice ? parseFloat(recPrice) : null,
      notes: recNotes.trim() || null,
    }).select().single()

    if (err || !newRec) { setError(err?.message || 'Błąd'); setSaving(false); return }

    // Add recipe lines
    const validLines = recLines.filter(l => l.ingredient_id && parseFloat(l.quantity) > 0)
    if (validLines.length > 0) {
      const inserts = validLines.map(l => ({
        recipe_id: newRec.id,
        ingredient_id: l.ingredient_id,
        quantity: parseFloat(l.quantity),
        unit: l.unit,
      }))
      await supabase.from('recipe_ingredients').insert(inserts)
    }

    setRecName(''); setRecPrice(''); setRecNotes(''); setRecPortions('1')
    setRecLines([])
    setSuccess('Przepis dodany!')
    setTimeout(() => setSuccess(''), 3000)
    setSaving(false)
    loadData()
    setTab('recipes')
  }

  // ─── Delete recipe ─────────────────────────────────────
  async function deleteRecipe(id: string) {
    if (!confirm('Usunąć przepis?')) return
    await supabase.from('recipes').update({ is_active: false }).eq('id', id)
    setSelectedRecipe(null)
    loadData()
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

  const filteredIng = ingredients.filter(i =>
    i.name.toLowerCase().includes(searchIng.toLowerCase()) ||
    i.category.toLowerCase().includes(searchIng.toLowerCase())
  )

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
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em]">WOKI WOKI</p>
        </div>
        <div className="w-16" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {([
          ['recipes', '🍜 Przepisy'],
          ['ingredients', '🥬 Składniki'],
          ['add-recipe', '+ Przepis'],
          ['add-ingredient', '+ Składnik'],
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

      {/* Error / Success */}
      {error && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded-xl">
          {error} <button onClick={() => setError('')} className="ml-2 font-bold">✕</button>
        </div>
      )}
      {success && (
        <div className="mx-4 mt-3 bg-green-50 border border-green-200 text-green-700 text-xs p-2 rounded-xl font-semibold text-center">
          {success}
        </div>
      )}

      <div className="max-w-lg mx-auto p-4">

        {/* Loading */}
        {loadingData && (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-500" />
          </div>
        )}

        {/* ═══════════════════════════════════════════════
             RECIPES TAB
           ═══════════════════════════════════════════════ */}
        {tab === 'recipes' && !loadingData && (
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
              const cost = calcRecipeCost(rec.id)
              const costPerPortion = rec.portions > 0 ? cost / rec.portions : cost
              const fcPercent = calcFoodCostPercent(rec.id, rec.selling_price)
              const lines = recipeIngredients[rec.id] || []
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
                        {rec.selling_price && (
                          <div className={`text-[10px] font-bold ${
                            fcPercent <= 30 ? 'text-green-600' : fcPercent <= 35 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            FC: {fcPercent.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>

                    {/* FC bar */}
                    {rec.selling_price && (
                      <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            fcPercent <= 30 ? 'bg-green-500' : fcPercent <= 35 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(fcPercent, 100)}%` }}
                        />
                      </div>
                    )}
                  </button>

                  {/* Detail view */}
                  {isOpen && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                      {rec.selling_price && (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-white rounded-xl p-2">
                            <div className="text-[10px] text-gray-400">Koszt</div>
                            <div className="text-sm font-bold">{costPerPortion.toFixed(2)} zł</div>
                          </div>
                          <div className="bg-white rounded-xl p-2">
                            <div className="text-[10px] text-gray-400">Cena</div>
                            <div className="text-sm font-bold">{rec.selling_price.toFixed(2)} zł</div>
                          </div>
                          <div className="bg-white rounded-xl p-2">
                            <div className="text-[10px] text-gray-400">Marża</div>
                            <div className="text-sm font-bold text-green-600">
                              {(rec.selling_price - costPerPortion).toFixed(2)} zł
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text-gray-400 font-semibold uppercase">Składniki ({lines.length})</div>
                      {lines.length === 0 && (
                        <p className="text-xs text-gray-400">Brak składników w przepisie</p>
                      )}
                      {lines.map(line => (
                        <div key={line.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                          <div>
                            <span className="text-sm text-gray-700">{line.ingredient_name}</span>
                            <span className="text-xs text-gray-400 ml-2">{line.quantity} {line.unit}</span>
                          </div>
                          <span className="text-xs font-bold text-gray-600">
                            {(line.quantity * (line.ingredient_price || 0)).toFixed(2)} zł
                          </span>
                        </div>
                      ))}

                      {rec.notes && (
                        <p className="text-xs text-gray-500 italic">📝 {rec.notes}</p>
                      )}

                      <button
                        onClick={() => deleteRecipe(rec.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Usuń przepis
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Summary */}
            {filteredRec.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <div className="text-xs text-green-600 font-semibold">Średni Food Cost</div>
                <div className="text-2xl font-bold text-green-700">
                  {(() => {
                    const withPrice = filteredRec.filter(r => r.selling_price && r.selling_price > 0)
                    if (withPrice.length === 0) return '—'
                    const avg = withPrice.reduce((s, r) => s + calcFoodCostPercent(r.id, r.selling_price), 0) / withPrice.length
                    return `${avg.toFixed(1)}%`
                  })()}
                </div>
                <div className="text-[10px] text-green-500 mt-1">Cel: poniżej 30%</div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
             INGREDIENTS TAB
           ═══════════════════════════════════════════════ */}
        {tab === 'ingredients' && !loadingData && (
          <div className="space-y-3">
            <input
              type="text"
              value={searchIng}
              onChange={e => setSearchIng(e.target.value)}
              placeholder="Szukaj składnika..."
              className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-300 outline-none"
            />

            {filteredIng.length === 0 && (
              <div className="text-center py-8">
                <div className="text-4xl mb-2 opacity-30">🥬</div>
                <p className="text-gray-400 text-sm">Brak składników</p>
                <button onClick={() => setTab('add-ingredient')} className="mt-3 text-green-600 text-sm font-semibold">
                  + Dodaj pierwszy składnik
                </button>
              </div>
            )}

            {/* Group by category */}
            {CATEGORIES.map(cat => {
              const items = filteredIng.filter(i => i.category === cat.value)
              if (items.length === 0) return null
              return (
                <div key={cat.value}>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 px-1">
                    {cat.label} ({items.length})
                  </div>
                  <div className="space-y-1">
                    {items.map(ing => (
                      <div key={ing.id} className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between">
                        <div>
                          <span className="text-sm text-gray-700 font-medium">{ing.name}</span>
                          {ing.supplier && (
                            <span className="text-[10px] text-gray-400 ml-2">{ing.supplier}</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-gray-900">{ing.price_per_unit.toFixed(2)} zł</span>
                          <span className="text-[10px] text-gray-400 ml-1">/{ing.unit}</span>
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
             ADD INGREDIENT
           ═══════════════════════════════════════════════ */}
        {tab === 'add-ingredient' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Nowy składnik</h2>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Nazwa</label>
              <input value={ingName} onChange={e => setIngName(e.target.value)}
                placeholder="np. Pierś z kurczaka" className="w-full p-3 border rounded-xl text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Cena (PLN)</label>
                <input type="number" step="0.01" value={ingPrice} onChange={e => setIngPrice(e.target.value)}
                  placeholder="0.00" className="w-full p-3 border rounded-xl text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Jednostka</label>
                <select value={ingUnit} onChange={e => setIngUnit(e.target.value)}
                  className="w-full p-3 border rounded-xl text-sm bg-white">
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Kategoria</label>
              <select value={ingCategory} onChange={e => setIngCategory(e.target.value)}
                className="w-full p-3 border rounded-xl text-sm bg-white">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Dostawca (opcjonalnie)</label>
              <input value={ingSupplier} onChange={e => setIngSupplier(e.target.value)}
                placeholder="np. MAKRO, Kuchnia Świata" className="w-full p-3 border rounded-xl text-sm" />
            </div>

            <button onClick={addIngredient} disabled={saving || !ingName.trim() || !ingPrice}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm disabled:opacity-40">
              {saving ? 'Zapisuję...' : 'Dodaj składnik'}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
             ADD RECIPE
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

            {/* Recipe lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500">Składniki</label>
                <button
                  onClick={() => setRecLines([...recLines, { ingredient_id: '', quantity: '', unit: 'kg' }])}
                  className="text-xs text-green-600 font-semibold"
                >
                  + Dodaj składnik
                </button>
              </div>

              {ingredients.length === 0 && (
                <p className="text-xs text-gray-400 py-2">
                  Najpierw dodaj składniki w zakładce &quot;+ Składnik&quot;
                </p>
              )}

              <div className="space-y-2">
                {recLines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                    <select
                      value={line.ingredient_id}
                      onChange={e => {
                        const updated = [...recLines]
                        updated[idx].ingredient_id = e.target.value
                        const ing = ingredients.find(i => i.id === e.target.value)
                        if (ing) updated[idx].unit = ing.unit
                        setRecLines(updated)
                      }}
                      className="flex-1 p-2 border rounded-lg text-xs bg-white"
                    >
                      <option value="">Wybierz...</option>
                      {ingredients.map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.price_per_unit} zł/{i.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.001"
                      value={line.quantity}
                      onChange={e => {
                        const updated = [...recLines]
                        updated[idx].quantity = e.target.value
                        setRecLines(updated)
                      }}
                      placeholder="Ilość"
                      className="w-20 p-2 border rounded-lg text-xs text-right"
                    />
                    <span className="text-xs text-gray-400 w-8">{line.unit}</span>
                    <button
                      onClick={() => setRecLines(recLines.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 text-sm p-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Live cost preview */}
              {recLines.some(l => l.ingredient_id && parseFloat(l.quantity) > 0) && (
                <div className="mt-3 bg-lime-50 border border-lime-200 rounded-xl p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Koszt składników:</span>
                    <span className="font-bold">
                      {recLines.reduce((sum, l) => {
                        const ing = ingredients.find(i => i.id === l.ingredient_id)
                        return sum + (parseFloat(l.quantity) || 0) * (ing?.price_per_unit || 0)
                      }, 0).toFixed(2)} zł
                    </span>
                  </div>
                  {recPrice && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-600">Food Cost:</span>
                      <span className={`font-bold ${
                        (() => {
                          const cost = recLines.reduce((sum, l) => {
                            const ing = ingredients.find(i => i.id === l.ingredient_id)
                            return sum + (parseFloat(l.quantity) || 0) * (ing?.price_per_unit || 0)
                          }, 0)
                          const fc = cost / (parseInt(recPortions) || 1) / parseFloat(recPrice) * 100
                          return fc <= 30 ? 'text-green-600' : fc <= 35 ? 'text-amber-600' : 'text-red-600'
                        })()
                      }`}>
                        {(() => {
                          const cost = recLines.reduce((sum, l) => {
                            const ing = ingredients.find(i => i.id === l.ingredient_id)
                            return sum + (parseFloat(l.quantity) || 0) * (ing?.price_per_unit || 0)
                          }, 0)
                          return (cost / (parseInt(recPortions) || 1) / parseFloat(recPrice) * 100).toFixed(1)
                        })()}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Notatki (opcjonalnie)</label>
              <textarea value={recNotes} onChange={e => setRecNotes(e.target.value)}
                placeholder="np. sposób przygotowania, czas, uwagi"
                rows={2} className="w-full p-3 border rounded-xl text-sm resize-none" />
            </div>

            <button onClick={addRecipe} disabled={saving || !recName.trim()}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm disabled:opacity-40">
              {saving ? 'Zapisuję...' : 'Dodaj przepis'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
