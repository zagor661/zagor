'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

interface DeliveryLog {
  id: string
  supplier_name: string
  delivery_date: string
  temperature_ok: boolean
  visual_ok: boolean
  document_number: string | null
  notes: string | null
  rejected_items: string | null
  created_at: string
  received_by_name?: string
}

const SUPPLIERS = ['MAKRO', 'Coca-Cola HBC', 'Hurtownia lokalna', 'Dostawa warzywa/owoce', 'Inna']

export default function DostawyPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [logs, setLogs] = useState<DeliveryLog[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form
  const [supplier, setSupplier] = useState('MAKRO')
  const [customSupplier, setCustomSupplier] = useState('')
  const [tempOk, setTempOk] = useState(true)
  const [visualOk, setVisualOk] = useState(true)
  const [docNumber, setDocNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [rejected, setRejected] = useState('')

  useEffect(() => {
    if (!user) return
    loadLogs()
  }, [user])

  async function loadLogs() {
    const { data } = await supabase
      .from('delivery_logs')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('delivery_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      // Enrich with receiver names
      const receiverIds = [...new Set(data.filter(d => d.received_by).map(d => d.received_by))]
      let names: Record<string, string> = {}
      if (receiverIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', receiverIds)
        if (profiles) profiles.forEach(p => { names[p.id] = p.full_name })
      }
      setLogs(data.map(d => ({ ...d, received_by_name: d.received_by ? names[d.received_by] || '?' : undefined })))
    }
  }

  async function handleAdd() {
    if (!user) return
    const supplierName = supplier === 'Inna' ? customSupplier.trim() : supplier
    if (!supplierName) return

    setSaving(true)
    const { error } = await supabase.from('delivery_logs').insert({
      location_id: user.location_id,
      supplier_name: supplierName,
      delivery_date: format(new Date(), 'yyyy-MM-dd'),
      received_by: user.id,
      temperature_ok: tempOk,
      visual_ok: visualOk,
      document_number: docNumber.trim() || null,
      notes: notes.trim() || null,
      rejected_items: rejected.trim() || null,
    })
    if (error) alert('Blad: ' + error.message)
    else {
      setDocNumber('')
      setNotes('')
      setRejected('')
      setTempOk(true)
      setVisualOk(true)
      setShowForm(false)
      loadLogs()
    }
    setSaving(false)
  }

  if (loading || !user) return null

  // Stats
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayLogs = logs.filter(l => l.delivery_date === today)
  const recentRejected = logs.filter(l => l.rejected_items).slice(0, 5)

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/sanepid')} className="text-sm text-gray-500">← Sanepid</button>
          <h1 className="text-lg font-bold">🚚 Dostawy</h1>
          <div className="w-16" />
        </div>

        {/* Today's summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400">Dzisiaj przyjeto</div>
              <div className="text-2xl font-bold text-gray-900">{todayLogs.length}</div>
              <div className="text-xs text-gray-400">dostaw</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-emerald-700">
                  {todayLogs.filter(l => l.temperature_ok).length}
                </div>
                <div className="text-[10px] text-gray-400">Temp OK</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-red-700">
                  {todayLogs.filter(l => !l.temperature_ok || !l.visual_ok).length}
                </div>
                <div className="text-[10px] text-gray-400">Problemy</div>
              </div>
            </div>
          </div>
        </div>

        {/* Add delivery button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-cyan-500 text-white font-bold py-3 rounded-xl active:scale-[0.97] transition-all"
          >
            + Przyjmij dostawe
          </button>
        )}

        {/* Add form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
            <div className="text-sm font-bold text-gray-900">Nowa dostawa</div>

            <select value={supplier} onChange={e => setSupplier(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm">
              {SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {supplier === 'Inna' && (
              <input type="text" placeholder="Nazwa dostawcy" value={customSupplier}
                onChange={e => setCustomSupplier(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl text-sm" />
            )}

            <input type="text" placeholder="Numer WZ / faktury (opcjonalnie)" value={docNumber}
              onChange={e => setDocNumber(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm" />

            {/* Temperature check */}
            <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-gray-700">🌡️ Temperatura OK?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTempOk(true)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                    tempOk ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >TAK</button>
                <button
                  onClick={() => setTempOk(false)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                    !tempOk ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >NIE</button>
              </div>
            </div>

            {/* Visual check */}
            <div className="flex items-center justify-between bg-green-50 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-gray-700">👁️ Stan wizualny OK?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setVisualOk(true)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                    visualOk ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >TAK</button>
                <button
                  onClick={() => setVisualOk(false)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                    !visualOk ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >NIE</button>
              </div>
            </div>

            {(!tempOk || !visualOk) && (
              <textarea
                placeholder="Odrzucone produkty — co i dlaczego?"
                value={rejected}
                onChange={e => setRejected(e.target.value)}
                rows={2}
                className="w-full p-3 border-2 border-red-200 bg-red-50 rounded-xl text-sm"
              />
            )}

            <textarea
              placeholder="Notatki (opcjonalnie)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm"
            />

            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold">
                Anuluj
              </button>
              <button onClick={handleAdd} disabled={saving} className="flex-1 bg-cyan-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                {saving ? '...' : 'Zapisz'}
              </button>
            </div>
          </div>
        )}

        {/* Recent deliveries */}
        {logs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
              Ostatnie dostawy
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 shadow-sm">
              {logs.slice(0, 20).map(l => (
                <div key={l.id} className={`px-4 py-3 ${
                  !l.temperature_ok || !l.visual_ok ? 'bg-red-50/50' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{l.supplier_name}</span>
                      {!l.temperature_ok && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded">🌡️ !</span>}
                      {!l.visual_ok && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded">👁️ !</span>}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">
                        {new Date(l.delivery_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                  {l.document_number && (
                    <div className="text-[10px] text-gray-400 mt-0.5">WZ: {l.document_number}</div>
                  )}
                  {l.received_by_name && (
                    <div className="text-[10px] text-gray-400">Przyjal: {l.received_by_name}</div>
                  )}
                  {l.rejected_items && (
                    <div className="text-xs text-red-600 mt-1 bg-red-50 rounded px-2 py-1">
                      ⛔ {l.rejected_items}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
