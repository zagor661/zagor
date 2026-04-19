'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'

const DOC_TYPES = [
  { key: 'orzeczenie_sanitarne', label: 'Orzeczenie sanitarno-epidemiologiczne', icon: '🏥', critical: true },
  { key: 'szkolenie_higiena', label: 'Szkolenie z higieny zywnosci', icon: '📚', critical: true },
  { key: 'badania_lekarskie', label: 'Badania lekarskie', icon: '🩺', critical: false },
]

interface PersonnelDoc {
  id: string
  profile_id: string
  document_type: string
  issue_date: string | null
  expiry_date: string | null
  file_url: string | null
  notes: string | null
  worker_name?: string
}

interface WorkerProfile {
  id: string
  full_name: string
  role: string
}

export default function PersonelPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [docs, setDocs] = useState<PersonnelDoc[]>([])
  const [workers, setWorkers] = useState<WorkerProfile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form
  const [selWorker, setSelWorker] = useState('')
  const [docType, setDocType] = useState('orzeczenie_sanitarne')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  async function loadData() {
    const [{ data: docData }, { data: profileData }] = await Promise.all([
      supabase.from('sanepid_personnel').select('*').eq('location_id', user!.location_id),
      supabase.from('profiles').select('id, full_name, role').eq('location_id', user!.location_id).eq('is_active', true),
    ])
    if (profileData) setWorkers(profileData)
    if (docData && profileData) {
      setDocs(docData.map((d: any) => ({
        ...d,
        worker_name: profileData.find((p: any) => p.id === d.profile_id)?.full_name || '?',
      })))
    }
  }

  async function handleAdd() {
    if (!selWorker || !user) return
    setSaving(true)
    const { error } = await supabase.from('sanepid_personnel').upsert({
      location_id: user.location_id,
      profile_id: selWorker,
      document_type: docType,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
      notes: notes.trim() || null,
    }, { onConflict: 'profile_id,document_type' })
    if (error) alert('Blad: ' + error.message)
    else {
      setSelWorker('')
      setIssueDate('')
      setExpiryDate('')
      setNotes('')
      setShowForm(false)
      loadData()
    }
    setSaving(false)
  }

  if (loading || !user) return null

  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Group by worker
  const byWorker = workers.map(w => ({
    worker: w,
    docs: DOC_TYPES.map(dt => {
      const doc = docs.find(d => d.profile_id === w.id && d.document_type === dt.key)
      const isExpired = doc?.expiry_date ? new Date(doc.expiry_date) < now : false
      const isExpiring = doc?.expiry_date ? new Date(doc.expiry_date) <= in30 && !isExpired : false
      return { ...dt, doc, isExpired, isExpiring }
    }),
  }))

  // Overall alerts
  const criticalExpired = docs.filter(d => {
    if (!d.expiry_date) return false
    const dt = DOC_TYPES.find(t => t.key === d.document_type)
    return dt?.critical && new Date(d.expiry_date) < now
  })

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/sanepid')} className="text-sm text-gray-500">← Sanepid</button>
          <h1 className="text-lg font-bold">🏥 Personel</h1>
          <div className="w-16" />
        </div>

        {/* Critical alert */}
        {criticalExpired.length > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
            <div className="text-sm font-bold text-red-800">🚨 UWAGA — wygasle dokumenty krytyczne</div>
            <p className="text-xs text-red-600 mt-1">
              Brak aktualnego orzeczenia sanitarnego = ryzyko zamkniecia lokalu przez Sanepid!
            </p>
            {criticalExpired.map(d => (
              <div key={d.id} className="text-xs text-red-700 mt-1 font-semibold">
                • {d.worker_name}: {DOC_TYPES.find(t => t.key === d.document_type)?.label} — wygasl {new Date(d.expiry_date!).toLocaleDateString('pl-PL')}
              </div>
            ))}
          </div>
        )}

        {/* Workers list */}
        {byWorker.map(({ worker, docs: wDocs }) => (
          <div key={worker.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="text-sm font-bold text-gray-900">{worker.full_name}</div>
              <div className="text-[10px] text-gray-400 uppercase">{worker.role}</div>
            </div>
            <div className="divide-y divide-gray-50">
              {wDocs.map(dt => (
                <div key={dt.key} className={`px-4 py-3 flex items-center justify-between ${
                  dt.isExpired ? 'bg-red-50/50' : dt.isExpiring ? 'bg-amber-50/50' : ''
                }`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span>{dt.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-gray-700">{dt.label}</div>
                      {dt.doc ? (
                        <div className={`text-[10px] ${
                          dt.isExpired ? 'text-red-600 font-bold' : dt.isExpiring ? 'text-amber-600' : 'text-gray-400'
                        }`}>
                          {dt.doc.expiry_date
                            ? (dt.isExpired ? '⛔ WYGASL ' : dt.isExpiring ? '⚠️ Wygasa ' : 'Wazne do ')
                              + new Date(dt.doc.expiry_date).toLocaleDateString('pl-PL')
                            : 'Dodano ' + new Date(dt.doc.issue_date || dt.doc.notes || '').toLocaleDateString('pl-PL')
                          }
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-300">Brak wpisu</div>
                      )}
                    </div>
                  </div>
                  <div>
                    {dt.doc ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        dt.isExpired ? 'bg-red-100 text-red-700'
                          : dt.isExpiring ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {dt.isExpired ? '⛔' : dt.isExpiring ? '⚠️' : '✅'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Add button */}
        {isAdmin && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-purple-500 text-white font-bold py-3 rounded-xl active:scale-[0.97] transition-all"
          >
            + Dodaj/aktualizuj dokument
          </button>
        )}

        {/* Add form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
            <select value={selWorker} onChange={e => setSelWorker(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm">
              <option value="">Wybierz pracownika</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm">
              {DOC_TYPES.map(dt => <option key={dt.key} value={dt.key}>{dt.icon} {dt.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Data wydania</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Data wygasniecia</label>
                <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm mt-1" />
              </div>
            </div>
            <input type="text" placeholder="Notatki (opcjonalnie)" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold">
                Anuluj
              </button>
              <button onClick={handleAdd} disabled={saving || !selWorker} className="flex-1 bg-purple-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                {saving ? '...' : 'Zapisz'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
