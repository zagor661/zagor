'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { notifyInvoiceScanned } from '@/lib/pushClient'
import supabase from '@/lib/supabase'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

// ─── Types ─────────────────────────────────────────────────
interface Invoice {
  id: string
  invoice_number: string | null
  supplier_name: string
  invoice_date: string
  due_date: string | null
  net_total: number
  vat_total: number
  gross_total: number
  payment_method: string | null
  status: string
  image_url: string | null
  gdrive_url: string | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
  items?: InvoiceItem[]
  uploader_name?: string
}

interface InvoiceItem {
  id: string
  item_name: string
  quantity: number | null
  unit: string | null
  unit_price: number | null
  net_amount: number | null
  vat_rate: number | null
  gross_amount: number | null
  foodcost_match: string | null
  foodcost_price_per_kg: number | null
  price_per_kg_invoice: number | null
  price_diff_pct: number | null
  price_alert: string | null
}

interface SupplierGroup {
  name: string
  count: number
  totalGross: number
  lastDate: string
  alerts: { higher: number; lower: number }
}

type TabType = 'lista' | 'dostawcy' | 'alerty'

// ─── Component ─────────────────────────────────────────────
export default function FakturyPage() {
  const { user, loading } = useUser()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<TabType>('lista')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [loadingData, setLoadingData] = useState(true)

  const isAdmin = user ? isAdminRole(user.role) : false
  const isYurii = user?.full_name?.toLowerCase().includes('yurii') ?? false
  const canAccess = isAdmin || isYurii

  useEffect(() => {
    if (!user || !canAccess) return
    loadInvoices()
  }, [user])

  async function loadInvoices() {
    setLoadingData(true)
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    if (data) {
      // Get uploader names
      const uploaderIds = [...new Set(data.filter(i => i.uploaded_by).map(i => i.uploaded_by))]
      let names: Record<string, string> = {}
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', uploaderIds)
        if (profiles) profiles.forEach(p => { names[p.id] = p.full_name })
      }
      setInvoices(data.map(i => ({ ...i, uploader_name: i.uploaded_by ? names[i.uploaded_by] : undefined })))
    }
    setLoadingData(false)
  }

  async function loadInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    const { data } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at')
    return data || []
  }

  // ─── Upload & Scan ────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    setUploadProgress('Wysylam zdjecie do AI...')

    const formData = new FormData()
    formData.append('image', file)
    formData.append('locationId', user.location_id)
    formData.append('uploadedBy', user.id)

    try {
      setUploadProgress('Skanuje fakture (GPT-4 Vision)...')
      const res = await fetch('/api/invoices/scan', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()

      if (!res.ok) {
        alert('Blad: ' + (result.error || 'Nieznany blad'))
        setUploading(false)
        setUploadProgress('')
        return
      }

      setUploadProgress('Gotowe! Sprawdzam ceny...')

      // Show alerts summary
      const a = result.alerts
      if (a.higher > 0 || a.lower > 0) {
        const msgs: string[] = []
        if (a.higher > 0) msgs.push(`${a.higher} produktow DROZSZYCH niz food cost`)
        if (a.lower > 0) msgs.push(`${a.lower} produktow TANSZYCH niz food cost`)
        alert('Alerty cenowe:\n' + msgs.join('\n'))
      }

      // Push notification about new invoice
      notifyInvoiceScanned(
        user.location_id,
        result.invoice.supplier_name || 'Dostawca',
        result.invoice.total_gross?.toFixed(2) || '?'
      )

      loadInvoices()
      setSelectedId(result.invoice.id)
    } catch (err: any) {
      alert('Blad uploadu: ' + err.message)
    }

    setUploading(false)
    setUploadProgress('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleVerify(invoiceId: string) {
    if (!user) return
    await supabase.from('invoices').update({
      status: 'verified',
      verified_by: user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', invoiceId)
    loadInvoices()
  }

  // ─── Guards ───────────────────────────────────────────────
  if (loading || !user) return null
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-stone-50 p-4 flex items-center justify-center">
        <p className="text-gray-400">Brak dostepu</p>
      </div>
    )
  }

  // ─── Derived data ─────────────────────────────────────────
  const selected = invoices.find(i => i.id === selectedId)

  // Supplier groups
  const supplierMap: Record<string, SupplierGroup> = {}
  invoices.forEach(inv => {
    const key = inv.supplier_name
    if (!supplierMap[key]) {
      supplierMap[key] = { name: key, count: 0, totalGross: 0, lastDate: inv.invoice_date, alerts: { higher: 0, lower: 0 } }
    }
    supplierMap[key].count++
    supplierMap[key].totalGross += inv.gross_total || 0
    if (inv.invoice_date > supplierMap[key].lastDate) supplierMap[key].lastDate = inv.invoice_date
  })
  const suppliers = Object.values(supplierMap).sort((a, b) => b.totalGross - a.totalGross)

  // Month stats
  const thisMonth = format(new Date(), 'yyyy-MM')
  const monthInvoices = invoices.filter(i => i.invoice_date.startsWith(thisMonth))
  const monthTotal = monthInvoices.reduce((s, i) => s + (i.gross_total || 0), 0)

  return (
    <div className="min-h-screen bg-stone-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Faktury</h1>
            <p className="text-xs text-gray-400">{invoices.length} faktur · {format(new Date(), 'LLLL yyyy', { locale: pl })}</p>
          </div>
        </div>

        {/* Month Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ten miesiac</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xl font-bold text-gray-900">{monthInvoices.length}</div>
              <div className="text-[10px] text-gray-400">faktur</div>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{Math.round(monthTotal)} zl</div>
              <div className="text-[10px] text-gray-400">brutto</div>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{suppliers.length}</div>
              <div className="text-[10px] text-gray-400">dostawcow</div>
            </div>
          </div>
        </div>

        {/* Upload Button */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleUpload} className="hidden" />

        {!uploading && !selectedId && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold py-4 rounded-2xl active:scale-[0.97] transition-all shadow-lg shadow-blue-200"
          >
            <span className="text-lg">📸</span> Skanuj fakture
          </button>
        )}

        {uploading && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
            <div className="animate-pulse text-blue-600 font-semibold text-sm">{uploadProgress}</div>
            <div className="text-xs text-gray-400 mt-1">To moze zajac 10-20 sekund...</div>
          </div>
        )}

        {/* Tabs (when no invoice selected) */}
        {!selectedId && (
          <>
            <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
              {([['lista', '📄 Lista'], ['dostawcy', '🏢 Dostawcy'], ['alerty', '🔔 Alerty']] as [TabType, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    tab === key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ─── TAB: LISTA FAKTUR ──────────────────────── */}
            {tab === 'lista' && (
              <div className="space-y-2">
                {loadingData && <div className="text-center text-gray-300 py-8 text-sm">Laduje...</div>}
                {!loadingData && invoices.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-2">📸</div>
                    <p className="text-sm text-gray-300">Zrob zdjecie pierwszej faktury</p>
                  </div>
                )}
                {invoices.map(inv => (
                  <InvoiceCard key={inv.id} invoice={inv} onClick={() => setSelectedId(inv.id)} />
                ))}
              </div>
            )}

            {/* ─── TAB: DOSTAWCY ──────────────────────────── */}
            {tab === 'dostawcy' && (
              <div className="space-y-2">
                {suppliers.map(s => (
                  <div key={s.name} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-400">
                          {s.count} faktur · ostatnia {new Date(s.lastDate).toLocaleDateString('pl-PL')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">{Math.round(s.totalGross)} zl</div>
                        <div className="text-[10px] text-gray-400">laczna wartosc</div>
                      </div>
                    </div>
                  </div>
                ))}
                {suppliers.length === 0 && (
                  <div className="text-center py-8 text-gray-300 text-sm">Brak dostawcow</div>
                )}
              </div>
            )}

            {/* ─── TAB: ALERTY CENOWE ─────────────────────── */}
            {tab === 'alerty' && <AlertsTab invoices={invoices} />}
          </>
        )}

        {/* ─── INVOICE DETAIL ───────────────────────────────── */}
        {selectedId && selected && (
          <InvoiceDetail
            invoice={selected}
            onBack={() => setSelectedId(null)}
            onVerify={() => handleVerify(selected.id)}
            loadItems={() => loadInvoiceItems(selected.id)}
            isAdmin={isAdmin}
          />
        )}

      </div>
    </div>
  )
}

// ─── Invoice Card ──────────────────────────────────────────
function InvoiceCard({ invoice, onClick }: { invoice: Invoice; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    verified: 'bg-emerald-100 text-emerald-700',
    paid: 'bg-gray-100 text-gray-500',
    disputed: 'bg-red-100 text-red-700',
  }
  const statusLabels: Record<string, string> = {
    new: 'Nowa',
    verified: 'Zweryfikowana',
    paid: 'Zaplacona',
    disputed: 'Sporna',
  }

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left active:scale-[0.98] transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{invoice.supplier_name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${statusColors[invoice.status] || statusColors.new}`}>
              {statusLabels[invoice.status] || invoice.status}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {invoice.invoice_number || 'Bez numeru'} · {new Date(invoice.invoice_date).toLocaleDateString('pl-PL')}
          </div>
          {invoice.uploader_name && (
            <div className="text-[10px] text-gray-300">Dodal: {invoice.uploader_name}</div>
          )}
        </div>
        <div className="text-right ml-3">
          <div className="text-sm font-bold text-gray-900">{Math.round(invoice.gross_total || 0)} zl</div>
          <div className="text-[10px] text-gray-400">brutto</div>
        </div>
      </div>
    </button>
  )
}

// ─── Invoice Detail ────────────────────────────────────────
function InvoiceDetail({ invoice, onBack, onVerify, loadItems, isAdmin }: {
  invoice: Invoice
  onBack: () => void
  onVerify: () => void
  loadItems: () => Promise<InvoiceItem[]>
  isAdmin: boolean
}) {
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [showImage, setShowImage] = useState(false)

  useEffect(() => {
    setLoadingItems(true)
    loadItems().then(data => {
      setItems(data)
      setLoadingItems(false)
    })
  }, [invoice.id])

  const higherItems = items.filter(i => i.price_alert === 'higher')
  const lowerItems = items.filter(i => i.price_alert === 'lower')

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-gray-400 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Powrot do listy
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-lg font-bold text-gray-900">{invoice.supplier_name}</div>
            <div className="text-xs text-gray-400">
              {invoice.invoice_number || 'Bez numeru'} · {new Date(invoice.invoice_date).toLocaleDateString('pl-PL')}
            </div>
          </div>
          <div className="flex gap-2">
            {invoice.image_url && (
              <button onClick={() => setShowImage(!showImage)}
                className="text-xs bg-gray-100 px-2.5 py-1.5 rounded-lg text-gray-600">
                📷
              </button>
            )}
            {invoice.gdrive_url && (
              <a href={invoice.gdrive_url} target="_blank" rel="noopener"
                className="text-xs bg-blue-50 px-2.5 py-1.5 rounded-lg text-blue-600">
                Drive
              </a>
            )}
          </div>
        </div>

        {showImage && invoice.image_url && (
          <img src={invoice.image_url} alt="Faktura" className="w-full rounded-xl mb-3 border border-gray-200" />
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <div className="text-lg font-bold text-gray-900">{(invoice.net_total || 0).toFixed(2)}</div>
            <div className="text-[9px] text-gray-400 uppercase">netto</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <div className="text-lg font-bold text-gray-900">{(invoice.vat_total || 0).toFixed(2)}</div>
            <div className="text-[9px] text-gray-400 uppercase">VAT</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-2.5 text-center">
            <div className="text-lg font-bold text-blue-700">{(invoice.gross_total || 0).toFixed(2)}</div>
            <div className="text-[9px] text-gray-400 uppercase">brutto</div>
          </div>
        </div>

        {isAdmin && invoice.status === 'new' && (
          <button onClick={onVerify}
            className="w-full mt-3 bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-sm active:scale-[0.97] transition-all">
            Zweryfikuj fakture
          </button>
        )}
      </div>

      {/* Price Alerts */}
      {higherItems.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3">
          <div className="text-sm font-bold text-red-700 mb-2">🔴 Drozsze niz Food Cost ({higherItems.length})</div>
          {higherItems.map(item => (
            <div key={item.id} className="flex items-center justify-between py-1 text-xs">
              <span className="text-red-800 font-medium">{item.item_name}</span>
              <div className="text-right">
                <span className="text-red-600 font-bold">+{item.price_diff_pct?.toFixed(1)}%</span>
                <span className="text-red-400 ml-2">
                  {item.price_per_kg_invoice?.toFixed(2)} vs {item.foodcost_price_per_kg?.toFixed(2)} zl/kg
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lowerItems.length > 0 && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3">
          <div className="text-sm font-bold text-emerald-700 mb-2">🟢 Tansze niz Food Cost ({lowerItems.length})</div>
          {lowerItems.map(item => (
            <div key={item.id} className="flex items-center justify-between py-1 text-xs">
              <span className="text-emerald-800 font-medium">{item.item_name}</span>
              <div className="text-right">
                <span className="text-emerald-600 font-bold">{item.price_diff_pct?.toFixed(1)}%</span>
                <span className="text-emerald-400 ml-2">
                  {item.price_per_kg_invoice?.toFixed(2)} vs {item.foodcost_price_per_kg?.toFixed(2)} zl/kg
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All Items */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Pozycje ({items.length})
          </div>
        </div>
        {loadingItems ? (
          <div className="p-4 text-center text-gray-300 text-sm">Laduje...</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map(item => (
              <div key={item.id} className={`px-4 py-3 ${
                item.price_alert === 'higher' ? 'bg-red-50/30' :
                item.price_alert === 'lower' ? 'bg-emerald-50/30' : ''
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                    <div className="text-[10px] text-gray-400">
                      {item.quantity} {item.unit} × {item.unit_price?.toFixed(2)} zl
                      {item.vat_rate != null && <span className="ml-1">· VAT {item.vat_rate}%</span>}
                    </div>
                    {item.foodcost_match && (
                      <div className="text-[10px] mt-0.5">
                        {item.price_alert === 'higher' && (
                          <span className="text-red-500 font-medium">
                            🔴 +{item.price_diff_pct?.toFixed(1)}% vs FC ({item.foodcost_match})
                          </span>
                        )}
                        {item.price_alert === 'lower' && (
                          <span className="text-emerald-500 font-medium">
                            🟢 {item.price_diff_pct?.toFixed(1)}% vs FC ({item.foodcost_match})
                          </span>
                        )}
                        {item.price_alert === 'match' && (
                          <span className="text-gray-400">
                            Cena OK ({item.foodcost_match})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-2">
                    <div className="text-sm font-bold text-gray-900">{item.gross_amount?.toFixed(2)}</div>
                    <div className="text-[10px] text-gray-400">brutto</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Alerts Tab ────────────────────────────────────────────
function AlertsTab({ invoices }: { invoices: Invoice[] }) {
  const [allItems, setAllItems] = useState<(InvoiceItem & { supplier: string; date: string })[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)

  useEffect(() => {
    loadAllAlerts()
  }, [invoices])

  async function loadAllAlerts() {
    setLoadingAlerts(true)
    // Filter via invoice IDs already loaded for this location
    const invoiceIds = invoices.map(i => i.id)
    if (invoiceIds.length === 0) { setAllItems([]); setLoadingAlerts(false); return }
    const { data } = await (await import('@/lib/supabase')).default
      .from('invoice_items')
      .select('*, invoices!inner(supplier_name, invoice_date)')
      .in('invoice_id', invoiceIds)
      .in('price_alert', ['higher', 'lower'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      setAllItems(data.map((d: any) => ({
        ...d,
        supplier: d.invoices?.supplier_name || '?',
        date: d.invoices?.invoice_date || '',
      })))
    }
    setLoadingAlerts(false)
  }

  if (loadingAlerts) return <div className="text-center py-8 text-gray-300 text-sm">Laduje alerty...</div>

  const higher = allItems.filter(i => i.price_alert === 'higher')
  const lower = allItems.filter(i => i.price_alert === 'lower')

  return (
    <div className="space-y-4">
      {higher.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 px-1">
            🔴 Drozsze niz Food Cost ({higher.length})
          </h3>
          <div className="bg-white rounded-2xl border border-red-100 divide-y divide-red-50 shadow-sm overflow-hidden">
            {higher.map(item => (
              <div key={item.id} className="px-4 py-3 bg-red-50/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                    <div className="text-[10px] text-gray-400">{item.supplier} · {new Date(item.date).toLocaleDateString('pl-PL')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-600">+{item.price_diff_pct?.toFixed(1)}%</div>
                    <div className="text-[10px] text-gray-400">
                      {item.price_per_kg_invoice?.toFixed(2)} vs {item.foodcost_price_per_kg?.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lower.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 px-1">
            🟢 Tansze niz Food Cost ({lower.length})
          </h3>
          <div className="bg-white rounded-2xl border border-emerald-100 divide-y divide-emerald-50 shadow-sm overflow-hidden">
            {lower.map(item => (
              <div key={item.id} className="px-4 py-3 bg-emerald-50/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                    <div className="text-[10px] text-gray-400">{item.supplier} · {new Date(item.date).toLocaleDateString('pl-PL')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-600">{item.price_diff_pct?.toFixed(1)}%</div>
                    <div className="text-[10px] text-gray-400">
                      {item.price_per_kg_invoice?.toFixed(2)} vs {item.foodcost_price_per_kg?.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {higher.length === 0 && lower.length === 0 && (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm text-gray-300">Brak alertow cenowych</p>
        </div>
      )}
    </div>
  )
}
