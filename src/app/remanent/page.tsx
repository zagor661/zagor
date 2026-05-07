'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FOODCOST_PRODUCTS } from '@/lib/foodcostProducts'

// ─── Config ────────────────────────────────────────────────
const INGREDIENTS = FOODCOST_PRODUCTS.filter(p => p.type === 'ingredient')
const CATEGORY_ORDER = ['Makarony', 'Mięso', 'Ryby', 'Warzywa', 'Azjatyckie', 'Przyprawy', 'Inne', 'Opakowania']
const LS_KEY = 'kitchenops_remanent'

// Category icons for visual grouping
const CAT_ICONS: Record<string, string> = {
  'Makarony': '🍜',
  'Mięso': '🥩',
  'Ryby': '🐟',
  'Warzywa': '🥬',
  'Azjatyckie': '🥢',
  'Przyprawy': '🌶️',
  'Inne': '📦',
  'Opakowania': '🥡',
}

// Unit hints — some items are counted in pieces (szt), most in kg
const PIECE_ITEMS = new Set([
  'Jajka K1', 'Box', 'Torba Papierowa', 'Pałeczki', 'Serwetka Box',
  'Widelczyk', 'Łyżki', 'Miso opakowanie', 'Zupa opakowanie',
  'Worki Wakum', 'Limonka', 'Ananas Puszka',
])

function getUnit(name: string): string {
  if (PIECE_ITEMS.has(name)) return 'szt'
  // Liquid items
  if (['Olej Sezamowy', 'Mleko Kokosowe', 'Kikkoman', 'Mirin', 'Suehiro', 'Sos Rybny', 'Sriracha Zielona', 'Sok Pomarańczowy', 'Olej'].includes(name)) return 'L'
  return 'kg'
}

interface RemanentEntry {
  name: string
  category: string
  quantity: string // string for input control
  unit: string
  pricePerKg: number | null
}

interface CustomProduct {
  id: number
  name: string
  quantity: string
  unit: string
  category: string
}

interface SavedRemanent {
  date: string
  timestamp: number
  employee: string
  entries: { name: string; quantity: number; unit: string; custom?: boolean }[]
}

function loadHistory(): SavedRemanent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveHistory(history: SavedRemanent[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(history))
}

export default function RemanentPage() {
  const [entries, setEntries] = useState<RemanentEntry[]>([])
  const [employeeName, setEmployeeName] = useState('')
  const [saved, setSaved] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<SavedRemanent[]>([])
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORY_ORDER))
  const [searchTerm, setSearchTerm] = useState('')
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([])
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [newCustomName, setNewCustomName] = useState('')
  const [newCustomUnit, setNewCustomUnit] = useState('kg')
  const [newCustomCategory, setNewCustomCategory] = useState('Inne')
  let nextCustomId = customProducts.length > 0 ? Math.max(...customProducts.map(c => c.id)) + 1 : 1

  // Init entries from INGREDIENTS
  useEffect(() => {
    const initial: RemanentEntry[] = INGREDIENTS.map(p => ({
      name: p.name,
      category: p.category,
      quantity: '',
      unit: getUnit(p.name),
      pricePerKg: p.price_per_kg,
    }))
    setEntries(initial)
    setHistory(loadHistory())
  }, [])

  // Group entries by category (including custom products)
  const grouped = useMemo(() => {
    const map: Record<string, RemanentEntry[]> = {}
    for (const e of entries) {
      if (!map[e.category]) map[e.category] = []
      map[e.category].push(e)
    }
    // Add custom products to their categories
    for (const cp of customProducts) {
      if (!map[cp.category]) map[cp.category] = []
      map[cp.category].push({
        name: `✚ ${cp.name}`,
        category: cp.category,
        quantity: cp.quantity,
        unit: cp.unit,
        pricePerKg: null,
      })
    }
    return CATEGORY_ORDER
      .filter(cat => map[cat]?.length)
      .map(cat => ({ category: cat, items: map[cat] }))
  }, [entries, customProducts])

  // Filtered by search
  const filteredGrouped = useMemo(() => {
    if (!searchTerm.trim()) return grouped
    const term = searchTerm.toLowerCase()
    return grouped
      .map(g => ({
        ...g,
        items: g.items.filter(e => e.name.toLowerCase().includes(term)),
      }))
      .filter(g => g.items.length > 0)
  }, [grouped, searchTerm])

  const updateQuantity = useCallback((name: string, value: string) => {
    // Allow empty, numbers, and decimals
    if (value !== '' && !/^\d*[.,]?\d*$/.test(value)) return
    const cleanVal = value.replace(',', '.')
    // Check if it's a custom product
    if (name.startsWith('✚ ')) {
      setCustomProducts(prev => prev.map(cp =>
        `✚ ${cp.name}` === name ? { ...cp, quantity: cleanVal } : cp
      ))
    } else {
      setEntries(prev => prev.map(e =>
        e.name === name ? { ...e, quantity: cleanVal } : e
      ))
    }
    setSaved(false)
  }, [])

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const filledCount = useMemo(() =>
    entries.filter(e => e.quantity !== '' && parseFloat(e.quantity) > 0).length +
    customProducts.filter(cp => cp.quantity !== '' && parseFloat(cp.quantity) > 0).length
  , [entries, customProducts])

  const totalValue = useMemo(() => {
    let sum = 0
    for (const e of entries) {
      const qty = parseFloat(e.quantity)
      if (qty > 0 && e.pricePerKg) {
        sum += qty * e.pricePerKg
      }
    }
    return sum
  }, [entries])

  const handleSave = () => {
    if (!employeeName.trim()) {
      alert('Wpisz imię osoby robiącej remanent')
      return
    }
    const filledEntries = [
      ...entries
        .filter(e => e.quantity !== '' && parseFloat(e.quantity) > 0)
        .map(e => ({ name: e.name, quantity: parseFloat(e.quantity), unit: e.unit })),
      ...customProducts
        .filter(cp => cp.quantity !== '' && parseFloat(cp.quantity) > 0)
        .map(cp => ({ name: cp.name, quantity: parseFloat(cp.quantity), unit: cp.unit, custom: true })),
    ]

    if (filledEntries.length === 0) {
      alert('Uzupełnij przynajmniej jedną pozycję')
      return
    }

    const now = new Date()
    const record: SavedRemanent = {
      date: now.toISOString().split('T')[0],
      timestamp: now.getTime(),
      employee: employeeName.trim(),
      entries: filledEntries,
    }

    const updated = [record, ...history]
    setHistory(updated)
    saveHistory(updated)
    setSaved(true)
  }

  const handleClear = () => {
    if (!confirm('Wyczyścić wszystkie pola?')) return
    setEntries(prev => prev.map(e => ({ ...e, quantity: '' })))
    setCustomProducts([])
    setShowAddCustom(false)
    setSaved(false)
  }

  const addCustomProduct = () => {
    const trimmed = newCustomName.trim()
    if (!trimmed) return
    // Check if already exists
    const exists = entries.some(e => e.name.toLowerCase() === trimmed.toLowerCase()) ||
                   customProducts.some(cp => cp.name.toLowerCase() === trimmed.toLowerCase())
    if (exists) {
      alert('Ten produkt już jest na liście')
      return
    }
    setCustomProducts(prev => [...prev, {
      id: Date.now(),
      name: trimmed,
      quantity: '',
      unit: newCustomUnit,
      category: newCustomCategory,
    }])
    setNewCustomName('')
    setShowAddCustom(false)
    // Expand the target category
    setExpandedCats(prev => { const next = new Set(prev); next.add(newCustomCategory); return next })
  }

  const removeCustomProduct = (id: number) => {
    setCustomProducts(prev => prev.filter(cp => cp.id !== id))
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-sm">←</Link>
          <h1 className="text-xl font-bold">Remanent</h1>
        </div>
        <p className="text-indigo-100 text-sm mt-1 ml-11">Stany magazynowe · {todayStr}</p>

        {/* Stats bar */}
        <div className="mt-4 flex gap-3">
          <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{filledCount}</div>
            <div className="text-xs text-indigo-100">Uzupełnione</div>
          </div>
          <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{INGREDIENTS.length}</div>
            <div className="text-xs text-indigo-100">Wszystkich</div>
          </div>
          <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
            <div className="text-2xl font-bold">{totalValue > 0 ? `${(totalValue / 100).toFixed(0)}` : '—'}</div>
            <div className="text-xs text-indigo-100">Wartość (zł)</div>
          </div>
        </div>
      </div>

      {/* Employee name + search */}
      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Kto robi remanent</label>
            <input
              type="text"
              value={employeeName}
              onChange={e => setEmployeeName(e.target.value)}
              placeholder="Imię i nazwisko"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
            />
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="🔍 Szukaj produktu..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"
              >✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: Remanent / Historia */}
      <div className="px-4 mt-4 flex gap-2">
        <button
          onClick={() => setShowHistory(false)}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
            !showHistory
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Remanent
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
            showHistory
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Historia ({history.length})
        </button>
      </div>

      {!showHistory ? (
        <>
          {/* Add custom product button */}
          <div className="px-4 mt-4">
            {!showAddCustom ? (
              <button
                onClick={() => setShowAddCustom(true)}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 text-sm font-medium flex items-center justify-center gap-2 active:bg-gray-50 transition"
              >
                <span className="text-lg">+</span> Dodaj produkt spoza listy
              </button>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-800">Nowy produkt</span>
                  <button onClick={() => setShowAddCustom(false)} className="text-gray-400 text-sm">✕</button>
                </div>
                <input
                  type="text"
                  value={newCustomName}
                  onChange={e => setNewCustomName(e.target.value)}
                  placeholder="Nazwa produktu"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  autoFocus
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Kategoria</label>
                    <select
                      value={newCustomCategory}
                      onChange={e => setNewCustomCategory(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      {CATEGORY_ORDER.map(cat => (
                        <option key={cat} value={cat}>{CAT_ICONS[cat]} {cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-gray-500">Jednostka</label>
                    <select
                      value={newCustomUnit}
                      onChange={e => setNewCustomUnit(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="kg">kg</option>
                      <option value="L">L</option>
                      <option value="szt">szt</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={addCustomProduct}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium active:bg-indigo-700 transition"
                >
                  Dodaj do listy
                </button>
              </div>
            )}
          </div>

          {/* Category groups */}
          <div className="px-4 mt-4 space-y-3">
            {filteredGrouped.map(group => (
              <div key={group.category} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Category header — collapsible */}
                <button
                  onClick={() => toggleCategory(group.category)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/80"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CAT_ICONS[group.category] || '📋'}</span>
                    <span className="font-semibold text-gray-800 text-sm">{group.category}</span>
                    <span className="text-xs text-gray-400">({group.items.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {group.items.filter(e => e.quantity !== '' && parseFloat(e.quantity) > 0).length}/{group.items.length}
                    </span>
                    <span className={`text-gray-400 text-xs transition-transform ${expandedCats.has(group.category) ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                </button>

                {expandedCats.has(group.category) && (
                  <div className="divide-y divide-gray-50">
                    {group.items.map(entry => {
                      const isCustom = entry.name.startsWith('✚ ')
                      const customItem = isCustom ? customProducts.find(cp => `✚ ${cp.name}` === entry.name) : null
                      return (
                        <div key={entry.name} className={`flex items-center gap-3 px-4 py-2.5 ${isCustom ? 'bg-amber-50/50' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">
                              {isCustom ? (
                                <span className="text-amber-700">{entry.name}</span>
                              ) : entry.name}
                            </div>
                            {entry.pricePerKg ? (
                              <div className="text-xs text-gray-400">{entry.pricePerKg.toFixed(2)} zł/{entry.unit}</div>
                            ) : isCustom ? (
                              <div className="text-xs text-amber-500">Dodany ręcznie</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={entry.quantity}
                              onChange={e => updateQuantity(entry.name, e.target.value)}
                              placeholder="0"
                              className={`w-20 text-right px-2 py-2 rounded-lg border text-sm font-medium transition
                                ${entry.quantity && parseFloat(entry.quantity) > 0
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-700'
                                }
                                focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400`}
                            />
                            <span className="text-xs text-gray-400 w-6">{entry.unit}</span>
                            {isCustom && customItem && (
                              <button
                                onClick={() => removeCustomProduct(customItem.id)}
                                className="text-red-400 text-xs ml-1"
                              >✕</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save / Clear buttons */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 flex gap-3 z-50">
            <button
              onClick={handleClear}
              className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
            >
              Wyczyść
            </button>
            <button
              onClick={handleSave}
              className={`flex-1 py-3 rounded-xl text-sm font-bold shadow-sm transition ${
                saved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-indigo-600 text-white active:bg-indigo-700'
              }`}
            >
              {saved ? '✓ Zapisano!' : `Zapisz remanent (${filledCount} poz.)`}
            </button>
          </div>
        </>
      ) : (
        /* History tab */
        <div className="px-4 mt-4 space-y-3">
          {history.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">
              Brak zapisanych remanentów
            </div>
          ) : (
            history.map((record, idx) => (
              <div key={record.timestamp} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50/80 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-gray-800">{record.date}</div>
                    <div className="text-xs text-gray-500">{record.employee} · {record.entries.length} pozycji</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(record.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="px-4 py-2 max-h-48 overflow-y-auto">
                  {record.entries.map(e => (
                    <div key={e.name} className="flex justify-between py-1 text-sm">
                      <span className="text-gray-700">{e.name}</span>
                      <span className="font-medium text-gray-900">{e.quantity} {e.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
