'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'

// 14 alergenów UE — obowiązek ustawowy dla gastronomii
const ALLERGENS = [
  { id: 1, name: 'Gluten', icon: '🌾' },
  { id: 2, name: 'Skorupiaki', icon: '🦐' },
  { id: 3, name: 'Jaja', icon: '🥚' },
  { id: 4, name: 'Ryby', icon: '🐟' },
  { id: 5, name: 'Orzeszki ziemne', icon: '🥜' },
  { id: 6, name: 'Soja', icon: '🫘' },
  { id: 7, name: 'Mleko', icon: '🥛' },
  { id: 8, name: 'Orzechy', icon: '🌰' },
  { id: 9, name: 'Seler', icon: '🥬' },
  { id: 10, name: 'Gorczyca', icon: '🟡' },
  { id: 11, name: 'Sezam', icon: '🫓' },
  { id: 12, name: 'Dwutlenek siarki', icon: '🧪' },
  { id: 13, name: 'Lubin', icon: '🌿' },
  { id: 14, name: 'Mieczaki', icon: '🦑' },
]

const DISH_CATEGORIES = [
  { key: 'starter', label: 'Przystawki' },
  { key: 'main', label: 'Dania glowne' },
  { key: 'side', label: 'Dodatki' },
  { key: 'drink', label: 'Napoje' },
  { key: 'dessert', label: 'Desery' },
]

interface MenuAllergen {
  id: string
  dish_name: string
  category: string | null
  allergens: number[]
  notes: string | null
  is_active: boolean
}

export default function AlergenyPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [dishes, setDishes] = useState<MenuAllergen[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form
  const [dishName, setDishName] = useState('')
  const [dishCat, setDishCat] = useState('main')
  const [selected, setSelected] = useState<number[]>([])
  const [notes, setNotes] = useState('')

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user) return
    loadDishes()
  }, [user])

  async function loadDishes() {
    const { data } = await supabase
      .from('menu_allergens')
      .select('*')
      .eq('location_id', user!.location_id)
      .eq('is_active', true)
      .order('category')
    if (data) setDishes(data)
  }

  function startEdit(dish: MenuAllergen) {
    setEditId(dish.id)
    setDishName(dish.dish_name)
    setDishCat(dish.category || 'main')
    setSelected(dish.allergens || [])
    setNotes(dish.notes || '')
    setShowForm(true)
  }

  function resetForm() {
    setEditId(null)
    setDishName('')
    setDishCat('main')
    setSelected([])
    setNotes('')
    setShowForm(false)
  }

  async function handleSave() {
    if (!dishName.trim() || !user) return
    setSaving(true)

    if (editId) {
      const { error } = await supabase.from('menu_allergens').update({
        dish_name: dishName.trim(),
        category: dishCat,
        allergens: selected,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editId)
      if (error) alert('Blad: ' + error.message)
    } else {
      const { error } = await supabase.from('menu_allergens').insert({
        location_id: user.location_id,
        dish_name: dishName.trim(),
        category: dishCat,
        allergens: selected,
        notes: notes.trim() || null,
      })
      if (error) alert('Blad: ' + error.message)
    }

    resetForm()
    loadDishes()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Usunac danie?')) return
    await supabase.from('menu_allergens').update({ is_active: false }).eq('id', id)
    loadDishes()
  }

  function toggleAllergen(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  if (loading || !user) return null

  // Group by category
  const grouped = DISH_CATEGORIES.map(c => ({
    ...c,
    dishes: dishes.filter(d => d.category === c.key),
  })).filter(g => g.dishes.length > 0)

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/sanepid')} className="text-sm text-gray-500">← Sanepid</button>
          <h1 className="text-lg font-bold">⚠️ Karta alergenow</h1>
          <div className="w-16" />
        </div>

        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-xs text-pink-700">
          Obowiazek ustawowy — 14 alergenow UE. Kazde danie w menu musi miec oznaczone alergeny.
          Brak karty = mandat do 5000 PLN.
        </div>

        {/* Dish list */}
        {grouped.length > 0 ? (
          grouped.map(g => (
            <div key={g.key}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                {g.label} ({g.dishes.length})
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 shadow-sm">
                {g.dishes.map(d => (
                  <div key={d.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-semibold text-gray-900">{d.dish_name}</div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(d)} className="text-blue-400 text-xs">Edytuj</button>
                          <button onClick={() => handleDelete(d.id)} className="text-red-400 text-xs">✕</button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {d.allergens.length > 0 ? (
                        d.allergens.sort((a, b) => a - b).map(aId => {
                          const al = ALLERGENS.find(a => a.id === aId)
                          return al ? (
                            <span key={aId} className="text-[10px] bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded border border-pink-200">
                              {al.icon} {al.name}
                            </span>
                          ) : null
                        })
                      ) : (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                          ✅ Bez alergenow
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-300 py-8">
            <div className="text-4xl mb-2">⚠️</div>
            <p className="text-sm">Brak dan — dodaj menu z alergenami</p>
          </div>
        )}

        {/* Stats */}
        {dishes.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Podsumowanie</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-gray-900">{dishes.length}</div>
                <div className="text-[10px] text-gray-400">Dan</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-gray-900">
                  {dishes.filter(d => d.allergens.length > 0).length}
                </div>
                <div className="text-[10px] text-gray-400">Z alergenami</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-emerald-600">
                  {dishes.filter(d => d.allergens.length === 0).length}
                </div>
                <div className="text-[10px] text-gray-400">Bez</div>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit form */}
        {isAdmin && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-pink-500 text-white font-bold py-3 rounded-xl active:scale-[0.97] transition-all"
          >
            + Dodaj danie
          </button>
        )}

        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
            <div className="text-sm font-bold text-gray-900">{editId ? 'Edytuj danie' : 'Nowe danie'}</div>
            <input type="text" placeholder="Nazwa dania" value={dishName} onChange={e => setDishName(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm" />
            <select value={dishCat} onChange={e => setDishCat(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm">
              {DISH_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>

            <div>
              <div className="text-xs font-semibold text-gray-500 mb-2">Alergeny (kliknij aby zaznaczyc):</div>
              <div className="grid grid-cols-2 gap-1.5">
                {ALLERGENS.map(al => (
                  <button
                    key={al.id}
                    onClick={() => toggleAllergen(al.id)}
                    className={`text-xs px-2.5 py-2 rounded-lg text-left transition-all ${
                      selected.includes(al.id)
                        ? 'bg-pink-100 border-2 border-pink-400 text-pink-800 font-semibold'
                        : 'bg-gray-50 border border-gray-200 text-gray-600'
                    }`}
                  >
                    {al.icon} {al.name}
                  </button>
                ))}
              </div>
            </div>

            <input type="text" placeholder="Notatki (opcjonalnie)" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm" />

            <div className="flex gap-2">
              <button onClick={resetForm} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold">
                Anuluj
              </button>
              <button onClick={handleSave} disabled={saving || !dishName.trim()} className="flex-1 bg-pink-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                {saving ? '...' : editId ? 'Aktualizuj' : 'Dodaj'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
