'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

interface MenuItem {
  id: string
  number: string
  name: string
  category: string
  is_active: boolean
  sort_order: number
  recipe_id: string | null
}

const CATEGORIES = [
  { value: 'danie', label: 'Danie glowne', icon: '🍛' },
  { value: 'zupa', label: 'Zupa', icon: '🥣' },
  { value: 'deser', label: 'Deser', icon: '🍰' },
  { value: 'napoj', label: 'Napoj', icon: '🥤' },
]

export default function StaffMenuPage() {
  const { user, loading: authLoading } = useUser()
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('danie')
  const [recipeId, setRecipeId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user || authLoading) return
    loadMenu()
  }, [user, authLoading])

  async function loadMenu() {
    setLoading(true)
    const { data } = await supabase
      .from('staff_menu')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('sort_order', { ascending: true })
      .order('number', { ascending: true })

    setItems(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditId(null)
    setNumber('')
    setName('')
    setCategory('danie')
    setRecipeId('')
    setShowForm(true)
  }

  function openEdit(item: MenuItem) {
    setEditId(item.id)
    setNumber(item.number)
    setName(item.name)
    setCategory(item.category)
    setRecipeId(item.recipe_id || '')
    setShowForm(true)
  }

  async function handleSave() {
    if (!number.trim() || !name.trim()) return
    setSaving(true)

    const payload = {
      number: number.trim(),
      name: name.trim(),
      category,
      recipe_id: recipeId || null,
      updated_at: new Date().toISOString(),
    }

    if (editId) {
      await supabase.from('staff_menu').update(payload).eq('id', editId)
    } else {
      const maxSort = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0
      await supabase.from('staff_menu').insert({
        ...payload,
        location_id: user!.location_id,
        sort_order: maxSort,
      })
    }

    setSaving(false)
    setShowForm(false)
    loadMenu()
  }

  async function toggleActive(item: MenuItem) {
    await supabase.from('staff_menu').update({
      is_active: !item.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    loadMenu()
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(`Usunac "${item.number}. ${item.name}"?`)) return
    await supabase.from('staff_menu').delete().eq('id', item.id)
    loadMenu()
  }

  // Helper: get recipe name by id
  function recipeName(rid: string | null): string | null {
    if (!rid) return null
    const r = DEFAULT_RECIPES.find(r => r.id === rid)
    return r ? r.name : rid
  }

  if (authLoading || !user) return null
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Brak dostepu</p>
          <Link href="/meals" className="text-brand-600 text-sm mt-2 block">&larr; Wroc</Link>
        </div>
      </div>
    )
  }

  const activeItems = items.filter(i => i.is_active)
  const inactiveItems = items.filter(i => !i.is_active)
  const catIcon = (cat: string) => CATEGORIES.find(c => c.value === cat)?.icon || '🍛'

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/meals" className="text-brand-600 font-medium text-sm">&larr; Posilki</Link>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">📋 Menu pracownicze</h1>
          <p className="text-gray-400 text-sm mt-1">Zarzadzaj lista dan</p>
        </div>

        {/* Add button */}
        <button
          onClick={openNew}
          className="w-full py-3 bg-brand-500 text-white font-bold rounded-2xl active:scale-95 transition-transform shadow-sm"
        >
          + Dodaj danie
        </button>

        {/* Form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-6 space-y-4 animate-slide-up max-h-[90vh] overflow-y-auto">
              <h2 className="font-bold text-lg">{editId ? 'Edytuj danie' : 'Nowe danie'}</h2>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Numer dania *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  placeholder="np. 1, 2a, 3"
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nazwa dania *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="np. Kurczak teriyaki z ryzem"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kategoria</label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`py-2 px-1 rounded-xl text-center text-xs font-medium transition-all ${
                        category === cat.value
                          ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-400'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <div className="text-lg mb-0.5">{cat.icon}</div>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipe link */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Receptura (auto-odejmowanie z magazynu)
                </label>
                <select
                  value={recipeId}
                  onChange={e => setRecipeId(e.target.value)}
                  className="input"
                >
                  <option value="">— Brak (nie odejmuje skladnikow)</option>
                  {DEFAULT_RECIPES.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.lines.length} skladnikow)
                    </option>
                  ))}
                </select>
                {recipeId && (
                  <div className="mt-2 bg-green-50 rounded-xl p-3">
                    <p className="text-xs font-bold text-green-700 mb-1">Skladniki do odejmowania:</p>
                    <div className="space-y-0.5">
                      {DEFAULT_RECIPES.find(r => r.id === recipeId)?.lines.map((line, i) => (
                        <div key={i} className="text-xs text-green-600 flex justify-between">
                          <span>{line.productName}</span>
                          <span className="font-mono">{Math.round(line.quantity * 1000)}g</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !number.trim() || !name.trim()}
                  className="flex-1 py-3 rounded-xl bg-brand-500 text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Zapisuje...' : 'Zapisz'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active items */}
        {loading ? (
          <div className="text-center py-8 text-gray-300">Laduje...</div>
        ) : activeItems.length === 0 ? (
          <div className="card text-center py-8">
            <div className="text-4xl mb-2">🍽️</div>
            <p className="text-gray-400 text-sm">Brak dan w menu</p>
            <p className="text-gray-300 text-xs mt-1">Kliknij &quot;Dodaj danie&quot; aby zaczac</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeItems.map(item => (
              <div key={item.id} className="card flex items-center gap-3 !p-3">
                <div className="text-2xl">{catIcon(item.category)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="bg-brand-100 text-brand-700 text-xs font-bold px-2 py-0.5 rounded-lg">
                      #{item.number}
                    </span>
                    <span className="font-medium text-sm text-gray-800 truncate">{item.name}</span>
                  </div>
                  {item.recipe_id && (
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                        📦 {recipeName(item.recipe_id)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(item)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 text-sm"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => toggleActive(item)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 text-sm"
                  >
                    🚫
                  </button>
                  <button
                    onClick={() => deleteItem(item)}
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 text-sm"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inactive items */}
        {inactiveItems.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nieaktywne</h3>
            {inactiveItems.map(item => (
              <div key={item.id} className="card flex items-center gap-3 !p-3 opacity-50">
                <div className="text-2xl">{catIcon(item.category)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-0.5 rounded-lg">
                      #{item.number}
                    </span>
                    <span className="font-medium text-sm text-gray-500 truncate">{item.name}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(item)}
                  className="p-2 rounded-lg hover:bg-green-50 text-green-500 text-sm font-medium"
                >
                  ✅
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
