'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
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
  invoice_id: string | null
  created_at: string
  received_by_name?: string
}

interface InvoicePreview {
  id: string
  invoice_number: string | null
  supplier_name: string
  gross_total: number
  alerts: { higher: number; lower: number; match: number }
  gdrive_url: string | null
}

const SUPPLIERS = ['Farutex', 'MAKRO', 'Pilarz', 'Jajka Agatka', 'Comimport', 'WOA', 'Inne']

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

  // Invoice photo
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null)
  const [scanningInvoice, setScanningInvoice] = useState(false)
  const [scanResult, setScanResult] = useState<InvoicePreview | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAdmin = user ? isAdminRole(user.role) : false
  const isYurii = user?.full_name?.toLowerCase().includes('yurii') ?? false
  const canScanInvoice = isAdmin || isYurii

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
      const receiverIds = [...new Set(data.filter(d => d.received_by).map(d => d.received_by))]
      let names: Record<string, string> = {}
      if (receiverIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', receiverIds)
        if (profiles) profiles.forEach(p => { names[p.id] = p.full_name })
      }
      setLogs(data.map(d => ({ ...d, received_by_name: d.received_by ? names[d.received_by] || '?' : undefined })))
    }
  }

  function handleInvoicePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setInvoiceFile(file)
    setScanResult(null)
    setScanError(null)
    // Preview
    const reader = new FileReader()
    reader.onload = () => setInvoicePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  function removeInvoicePhoto() {
    setInvoiceFile(null)
    setInvoicePreview(null)
    setScanResult(null)
    setScanError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleAdd() {
    if (!user) return
    const supplierName = supplier === 'Inna' ? customSupplier.trim() : supplier
    if (!supplierName) return

    setSaving(true)
    let invoiceId: string | null = null

    // 1. If invoice photo attached — scan it first
    if (invoiceFile && canScanInvoice) {
      setScanningInvoice(true)
      try {
        const formData = new FormData()
        formData.append('image', invoiceFile)
        formData.append('locationId', user.location_id)
        formData.append('uploadedBy', user.id)

        const res = await fetch('/api/invoices/scan', {
          method: 'POST',
          body: formData,
        })
        const result = await res.json()

        if (res.ok && result.invoice) {
          invoiceId = result.invoice.id
          setScanResult({
            id: result.invoice.id,
            invoice_number: result.invoice.invoice_number,
            supplier_name: result.invoice.supplier_name,
            gross_total: result.invoice.gross_total,
            alerts: result.alerts,
            gdrive_url: result.gdrive?.url || null,
          })
          // Auto-fill doc number if OCR got it
          if (result.invoice.invoice_number && !docNumber.trim()) {
            setDocNumber(result.invoice.invoice_number)
          }
        } else {
          setScanError(result.error || 'Nie udalo sie odczytac faktury')
        }
      } catch (err: any) {
        setScanError(err.message)
      }
      setScanningInvoice(false)
    }

    // 2. Save delivery log (Sanepid nota)
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
      invoice_id: invoiceId,
    })

    if (error) {
      alert('Blad: ' + error.message)
    } else {
      // Reset form but keep scan result visible briefly
      if (!scanResult && !scanError) {
        resetForm()
      }
      loadLogs()
    }
    setSaving(false)
  }

  function resetForm() {
    setDocNumber('')
    setNotes('')
    setRejected('')
    setTempOk(true)
    setVisualOk(true)
    setInvoiceFile(null)
    setInvoicePreview(null)
    setScanResult(null)
    setScanError(null)
    setShowForm(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading || !user) return null

  // Stats
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayLogs = logs.filter(l => l.delivery_date === today)

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/sanepid')} className="text-sm text-gray-500">← Sanepid</button>
          <h1 className="text-lg font-bold">🚚 Dostawy</h1>
          {canScanInvoice && (
            <button onClick={() => router.push('/faktury')} className="text-xs text-blue-500 font-medium">
              Faktury →
            </button>
          )}
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

        {/* ─── DELIVERY FORM ──────────────────────────────── */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
            <div className="text-sm font-bold text-gray-900">Nowa dostawa</div>

            {/* Supplier */}
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
                <button onClick={() => setTempOk(true)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tempOk ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  TAK
                </button>
                <button onClick={() => setTempOk(false)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${!tempOk ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  NIE
                </button>
              </div>
            </div>

            {/* Visual check */}
            <div className="flex items-center justify-between bg-green-50 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-gray-700">👁️ Stan wizualny OK?</span>
              <div className="flex gap-2">
                <button onClick={() => setVisualOk(true)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${visualOk ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  TAK
                </button>
                <button onClick={() => setVisualOk(false)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold ${!visualOk ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  NIE
                </button>
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

            {/* ─── INVOICE PHOTO SECTION ──────────────────── */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleInvoicePhoto} className="hidden" />

            {!invoiceFile ? (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-xl py-4 text-center active:scale-[0.98] transition-all"
              >
                <div className="text-2xl mb-1">📸</div>
                <div className="text-sm font-semibold text-blue-600">Zrob zdjecie faktury / WZ</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {canScanInvoice
                    ? 'AI odczyta dane, porówna ceny z Food Cost, wyśle na Drive'
                    : 'Zdjęcie zostanie dołączone do dostawy'}
                </div>
              </button>
            ) : (
              <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📄</span>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Faktura dolaczona</div>
                      <div className="text-[10px] text-gray-400">{invoiceFile.name}</div>
                    </div>
                  </div>
                  <button onClick={removeInvoicePhoto} className="text-red-400 text-xs font-medium">
                    Usun
                  </button>
                </div>
                {invoicePreview && (
                  <img src={invoicePreview} alt="Podglad" className="w-full rounded-lg max-h-40 object-cover border border-gray-200" />
                )}
                {canScanInvoice && (
                  <div className="text-[10px] text-blue-500 font-medium">
                    AI automatycznie odczyta dane po zapisaniu dostawy
                  </div>
                )}
              </div>
            )}

            {/* Scan progress */}
            {scanningInvoice && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="animate-pulse text-blue-600 font-semibold text-sm">
                  Skanuje fakture (GPT-4 Vision)...
                </div>
                <div className="text-[10px] text-gray-400 mt-1">To moze zajac 10-20 sekund</div>
              </div>
            )}

            {/* Scan result */}
            {scanResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                <div className="text-sm font-bold text-emerald-700">✅ Faktura zeskanowana!</div>
                <div className="text-xs text-gray-700">
                  {scanResult.supplier_name} · {scanResult.invoice_number || 'bez numeru'} · {scanResult.gross_total?.toFixed(2)} zl brutto
                </div>
                <div className="flex gap-2 flex-wrap">
                  {scanResult.alerts.higher > 0 && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                      🔴 {scanResult.alerts.higher} drozszych
                    </span>
                  )}
                  {scanResult.alerts.lower > 0 && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                      🟢 {scanResult.alerts.lower} tanszych
                    </span>
                  )}
                  {scanResult.alerts.match > 0 && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      ✅ {scanResult.alerts.match} w cenie
                    </span>
                  )}
                </div>
                {scanResult.gdrive_url && (
                  <a href={scanResult.gdrive_url} target="_blank" rel="noopener"
                    className="text-[10px] text-blue-500 underline">
                    Otworz na Google Drive →
                  </a>
                )}
              </div>
            )}

            {scanError && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="text-xs text-amber-700 font-medium">⚠️ {scanError}</div>
                <div className="text-[10px] text-gray-400 mt-1">Dostawa zostanie zapisana bez skanu faktury</div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              <button onClick={resetForm} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold">
                Anuluj
              </button>
              <button onClick={handleAdd} disabled={saving || scanningInvoice}
                className="flex-1 bg-cyan-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                {scanningInvoice ? 'Skanuje...' : saving ? 'Zapisuje...' : invoiceFile && canScanInvoice ? 'Zapisz + Skanuj FV' : 'Zapisz'}
              </button>
            </div>

            {/* After successful save with scan */}
            {scanResult && (
              <div className="flex gap-2">
                <button onClick={() => router.push(`/faktury`)}
                  className="flex-1 bg-blue-50 text-blue-600 py-2.5 rounded-xl text-xs font-semibold">
                  Zobacz fakture →
                </button>
                <button onClick={resetForm}
                  className="flex-1 bg-gray-50 text-gray-500 py-2.5 rounded-xl text-xs font-semibold">
                  Nowa dostawa
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── RECENT DELIVERIES ──────────────────────────── */}
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
                      {l.invoice_id && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">📄 FV</span>}
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
