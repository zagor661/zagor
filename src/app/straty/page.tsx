'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { FOODCOST_PRODUCTS, FoodcostProduct } from '@/lib/foodcostProducts'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

interface Loss {
  id: string
  reporter_name: string
  product_name: string
  product_category: string | null
  quantity: number | null
  unit: string | null
  reason: string | null
  estimated_value: number | null
  description: string | null
  fault_person_id: string | null
  fault_person_name: string | null
  created_at: string
}

interface Worker { id: string; full_name: string }

const REASONS = ['Zepsute', 'Spalone', 'Upuszczone', 'Zwrot od klienta', 'Termin', 'Inne']
const REASON_COLOR: Record<string, string> = {
  'Zepsute': 'bg-red-100 text-red-700',
  'Spalone': 'bg-orange-100 text-orange-700',
  'Upuszczone': 'bg-yellow-100 text-yellow-700',
  'Zwrot od klienta': 'bg-purple-100 text-purple-700',
  'Termin': 'bg-gray-200 text-gray-700',
  'Inne': 'bg-blue-100 text-blue-700',
}

export default function StratyPage() {
  const { user, loading: authLoading } = useUser()
  const [losses, setLosses] = useState<Loss[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<FoodcostProduct | null>(null)
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<'kg' | 'g' | 'szt'>('kg')
  const [reason, setReason] = useState('Zepsute')
  const [description, setDescription] = useState('')
  const [faultPersonId, setFaultPersonId] = useState('')
  const [workers, setWorkers] = useState<Worker[]>([])

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  // Autocomplete suggestions (max 8)
  const suggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (q.length < 1) return []
    return FOODCOST_PRODUCTS
      .filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 8)
  }, [productQuery])

  // Auto-calculate estimated value
  const estimatedValue = useMemo(() => {
    const q = parseFloat(quantity.replace(',', '.'))
    if (!selectedProduct || !selectedProduct.price_per_kg || isNaN(q)) return null
    if (selectedProduct.type === 'dish') {
      // For dishes: price_per_kg is actually price per portion
      return unit === 'szt' ? +(q * selectedProduct.price_per_kg).toFixed(2) : null
    }
    if (unit === 'kg') return +(q * selectedProduct.price_per_kg).toFixed(2)
    if (unit === 'g')  return +(q / 1000 * selectedProduct.price_per_kg).toFixed(2)
    return null
  }, [selectedProduct, quantity, unit])

  useEffect(() => {
    if (authLoading || !user) return
    loadLosses()
    loadWorkers()
  }, [user, authLoading])

  async function loadWorkers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
    if (data) setWorkers(data as Worker[])
  }

  async function loadLosses() {
    const { data } = await supabase
      .from('worker_losses')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setLosses(data as Loss[])
  }

  function pickProduct(p: FoodcostProduct) {
    setSelectedProduct(p)
    setProductQuery(p.name)
    if (p.type === 'dish') setUnit('szt')
  }

  async function saveLoss() {
    if (!user) return
    const productName = productQuery.trim()
    if (!productName) { alert('Podaj produkt'); return }
    const q = parseFloat(quantity.replace(',', '.'))
    if (isNaN(q) || q <= 0) { alert('Podaj prawidłową ilość'); return }

    setSaving(true)

    const faultWorker = workers.find(w => w.id === faultPersonId)
    const payload = {
      location_id: user.location_id,
      reporter_id: user.id,
      reporter_name: user.full_name,
      product_name: productName,
      product_category: selectedProduct?.category || null,
      quantity: q,
      unit,
      reason,
      estimated_value: estimatedValue,
      description: description.trim() || null,
      fault_person_id: faultPersonId || null,
      fault_person_name: faultWorker?.full_name || null,
    }

    const { error } = await supabase.from('worker_losses').insert(payload)

    if (error) { alert('Błąd: ' + error.message); setSaving(false); return }

    fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'loss',
        data: {
          created_at: new Date().toISOString(),
          location: user.location_name,
          reporter: user.full_name,
          product_name: productName,
          product_category: selectedProduct?.category || '',
          quantity: q,
          unit,
          reason,
          estimated_value: estimatedValue,
          description: description.trim() || '',
          fault_person_name: faultWorker?.full_name || '',
        },
      }),
    }).catch(() => {})

    // Reset form
    setProductQuery('')
    setSelectedProduct(null)
    setQuantity('')
    setUnit('kg')
    setReason('Zepsute')
    setDescription('')
    setFaultPersonId('')
    setShowForm(false)
    setSaving(false)
    await loadLosses()
  }

  async function deleteLoss(id: string) {
    if (!confirm('Usunąć ten wpis?')) return
    await supabase.from('worker_losses').delete().eq('id', id)
    loadLosses()
  }

  if (authLoading || !user) return null

  // Total this week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const weekTotal = losses
    .filter(l => new Date(l.created_at) >= weekAgo)
    .reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <Link href="/" className="text-brand-600 font-medium text-sm">← Powrót</Link>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">📉 Lista strat</h1>
          <p className="text-gray-500 text-sm mt-1">Zgłoszenia produktowe z wyceną</p>
        </div>

        {/* Summary */}
        <div className="card bg-red-50 border-2 border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-red-600 font-medium uppercase">Straty — ostatnie 7 dni</p>
              <p className="text-3xl font-bold text-red-700">{weekTotal.toFixed(2)} zł</p>
            </div>
            <span className="text-5xl">📉</span>
          </div>
        </div>

        {/* Add button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-4 rounded-2xl bg-brand-500 text-white text-lg font-bold shadow-lg active:scale-98"
          >
            + Zgłoś stratę
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div className="card space-y-4">
            <h2 className="font-bold text-gray-900">Nowe zgłoszenie straty</h2>

            {/* Product autocomplete */}
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">Produkt *</label>
              <input
                type="text"
                value={productQuery}
                onChange={e => { setProductQuery(e.target.value); setSelectedProduct(null) }}
                placeholder="Zacznij pisać np. 'kurczak' lub 'makaron'..."
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none"
                autoFocus
              />
              {suggestions.length > 0 && !selectedProduct && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {suggestions.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickProduct(p)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                    >
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {p.category}
                        {p.price_per_kg && (
                          <span className="ml-2 text-brand-600 font-medium">
                            {p.type === 'dish' ? `${p.price_per_kg} zł/szt` : `${p.price_per_kg} zł/kg`}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedProduct && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ Z foodcost: {selectedProduct.category}
                  {selectedProduct.price_per_kg && ` — ${selectedProduct.price_per_kg} zł/${selectedProduct.type === 'dish' ? 'szt' : 'kg'}`}
                </p>
              )}
            </div>

            {/* Quantity + unit */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Ilość *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="np. 0,5"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jednostka</label>
                <select
                  value={unit}
                  onChange={e => setUnit(e.target.value as any)}
                  className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none bg-white"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="szt">szt</option>
                </select>
              </div>
            </div>

            {/* Auto-calculated value */}
            {estimatedValue !== null && (
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                <p className="text-xs text-orange-700">Szacowana wartość z foodcost:</p>
                <p className="text-xl font-bold text-orange-900">{estimatedValue.toFixed(2)} zł</p>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Powód</label>
              <div className="grid grid-cols-3 gap-2">
                {REASONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`px-2 py-2 rounded-xl text-xs font-medium ${reason === r ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Fault person */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Winowajca (opcjonalnie) <span className="text-gray-400">— tylko jeśli ewidentnie czyjaś wina</span>
              </label>
              <select
                value={faultPersonId}
                onChange={e => setFaultPersonId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none bg-white"
              >
                <option value="">— nie przypisuj —</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.full_name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opis (opcjonalnie)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Np. paczka spadła, skończył się termin..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-brand-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowForm(false) }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium"
              >
                Anuluj
              </button>
              <button
                onClick={saveLoss}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-brand-500 text-white font-bold disabled:opacity-50"
              >
                {saving ? 'Zapisuję...' : 'Zapisz stratę'}
              </button>
            </div>
          </div>
        )}

        {/* Recent losses */}
        <div className="card">
          <h2 className="font-bold text-sm text-gray-700 mb-3">📋 Ostatnie zgłoszenia ({losses.length})</h2>
          {losses.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Brak zgłoszeń</p>
          ) : (
            <div className="space-y-2">
              {losses.map(l => (
                <div key={l.id} className="p-3 rounded-xl border border-gray-100 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{l.product_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REASON_COLOR[l.reason || 'Inne'] || 'bg-gray-100'}`}>{l.reason}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {l.quantity} {l.unit} · {l.reporter_name} · {format(new Date(l.created_at), 'd MMM HH:mm', { locale: pl })}
                      </div>
                      {l.fault_person_name && (
                        <div className="text-xs text-red-700 font-medium mt-1">⚠️ Wina: {l.fault_person_name}</div>
                      )}
                      {l.description && <p className="text-xs text-gray-600 mt-1 italic">{l.description}</p>}
                    </div>
                    <div className="text-right">
                      {l.estimated_value != null && (
                        <div className="text-sm font-bold text-red-600">{Number(l.estimated_value).toFixed(2)} zł</div>
                      )}
                      {isAdmin && (
                        <button onClick={() => deleteLoss(l.id)} className="text-xs text-gray-400 hover:text-red-500 mt-1">usuń</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
