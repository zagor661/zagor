'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import supabase from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────
interface WorkerProfile {
  id: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  hourly_rate: number
  contract_type: string
  phone: string | null
  address: string | null
  pesel: string | null
  bank_account: string | null
  emergency_contact: string | null
  hire_date: string | null
  notes: string | null
  avatar_url: string | null
  position: string | null
  date_of_birth: string | null
  nip: string | null
  contract_start: string | null
  contract_end: string | null
  shirt_size: string | null
  shoe_size: string | null
}

interface WorkerDocument {
  id: string
  profile_id: string
  document_type: string
  title: string
  description: string | null
  file_url: string | null
  file_name: string | null
  issue_date: string | null
  expiry_date: string | null
  is_active: boolean
  created_at: string
}

interface MonthHours {
  hours: number
  cost: number
  days: number
}

// ─── Constants ─────────────────────────────────────────────
const CONTRACT_LABELS: Record<string, string> = {
  zlecenie: 'Umowa zlecenie',
  o_prace: 'Umowa o prace',
  o_dzielo: 'Umowa o dzielo',
  b2b: 'B2B / Faktura',
  staz: 'Staz',
  praktyki: 'Praktyki',
}

const ROLE_LABELS: Record<string, string> = {
  kitchen: '🍳 Kuchnia',
  hall: '🍽️ Sala',
  manager: '👔 Menager',
  owner: '🥷 Owner',
}

const DOC_TYPES = [
  { key: 'umowa', label: 'Umowa', icon: '📄' },
  { key: 'aneks', label: 'Aneks do umowy', icon: '📎' },
  { key: 'badania_lekarskie', label: 'Badania lekarskie', icon: '🩺' },
  { key: 'bhp', label: 'Szkolenie BHP', icon: '⛑️' },
  { key: 'orzeczenie_sanitarne', label: 'Orzeczenie sanitarne', icon: '🏥' },
  { key: 'szkolenie', label: 'Szkolenie / certyfikat', icon: '📚' },
  { key: 'dowod', label: 'Kopia dowodu', icon: '🪪' },
  { key: 'inne', label: 'Inne', icon: '📋' },
]

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

type SectionType = 'info' | 'employment' | 'documents' | 'hours'

// ─── Main Component ────────────────────────────────────────
export default function WorkerListPage() {
  const { user, loading } = useUser()
  const [workers, setWorkers] = useState<WorkerProfile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionType>('info')
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<WorkerProfile>>({})
  const [monthHours, setMonthHours] = useState<Record<string, MonthHours>>({})
  const [saving, setSaving] = useState(false)

  // Documents
  const [docs, setDocs] = useState<WorkerDocument[]>([])
  const [showDocForm, setShowDocForm] = useState(false)
  const [docType, setDocType] = useState('umowa')
  const [docTitle, setDocTitle] = useState('')
  const [docDesc, setDocDesc] = useState('')
  const [docIssueDate, setDocIssueDate] = useState('')
  const [docExpiryDate, setDocExpiryDate] = useState('')
  const [savingDoc, setSavingDoc] = useState(false)

  // Avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user || !isAdmin) return
    loadWorkers()
  }, [user])

  useEffect(() => {
    if (workers.length > 0 && user) loadMonthHours()
  }, [workers])

  useEffect(() => {
    if (selectedId) loadDocs(selectedId)
  }, [selectedId])

  // ─── Data Loading ──────────────────────────────────────
  async function loadWorkers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, hourly_rate, contract_type, phone, address, pesel, bank_account, emergency_contact, hire_date, notes, avatar_url, position, date_of_birth, nip, contract_start, contract_end, shirt_size, shoe_size')
      .order('full_name')

    if (data) {
      const normalized = data.map((w: any) => ({
        ...w,
        hourly_rate: w.hourly_rate ?? 29,
        contract_type: w.contract_type ?? 'zlecenie',
      }))
      setWorkers(normalized)
    }
  }

  async function loadMonthHours() {
    const now = new Date()
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('clock_logs')
      .select('worker_id, hours_worked')
      .gte('clock_date', monthStart)
      .not('hours_worked', 'is', null)

    if (data) {
      const map: Record<string, { hours: number; days: number }> = {}
      data.forEach((c: any) => {
        if (!c.worker_id) return
        if (!map[c.worker_id]) map[c.worker_id] = { hours: 0, days: 0 }
        map[c.worker_id].hours += c.hours_worked || 0
        map[c.worker_id].days += 1
      })

      const result: Record<string, MonthHours> = {}
      Object.entries(map).forEach(([id, { hours, days }]) => {
        const worker = workers.find(w => w.id === id)
        const rate = worker?.hourly_rate || 29
        result[id] = {
          hours: Math.round(hours * 10) / 10,
          cost: Math.round(hours * rate),
          days,
        }
      })
      setMonthHours(result)
    }
  }

  async function loadDocs(profileId: string) {
    const { data } = await supabase
      .from('worker_documents')
      .select('*')
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (data) setDocs(data)
    else setDocs([])
  }

  // ─── Avatar Upload ─────────────────────────────────────
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedId) return

    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${selectedId}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('worker-files')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      // Jesli bucket nie istnieje, zapisz jako base64 data URL
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        await supabase.from('profiles').update({ avatar_url: dataUrl }).eq('id', selectedId)
        loadWorkers()
        setUploadingAvatar(false)
      }
      reader.readAsDataURL(file)
      return
    }

    const { data: urlData } = supabase.storage.from('worker-files').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', selectedId)
    loadWorkers()
    setUploadingAvatar(false)
  }

  // ─── Save Profile ──────────────────────────────────────
  async function handleSave() {
    if (!selectedId || !editData) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      hourly_rate: editData.hourly_rate,
      contract_type: editData.contract_type,
      phone: editData.phone || null,
      address: editData.address || null,
      pesel: editData.pesel || null,
      bank_account: editData.bank_account || null,
      emergency_contact: editData.emergency_contact || null,
      hire_date: editData.hire_date || null,
      notes: editData.notes || null,
      position: editData.position || null,
      date_of_birth: editData.date_of_birth || null,
      nip: editData.nip || null,
      contract_start: editData.contract_start || null,
      contract_end: editData.contract_end || null,
      shirt_size: editData.shirt_size || null,
      shoe_size: editData.shoe_size || null,
    }).eq('id', selectedId)

    if (error) alert('Blad zapisu: ' + error.message)
    else {
      setEditing(false)
      loadWorkers()
    }
    setSaving(false)
  }

  // ─── Add Document ──────────────────────────────────────
  async function handleAddDoc() {
    if (!selectedId || !docTitle.trim()) return
    setSavingDoc(true)
    const { error } = await supabase.from('worker_documents').insert({
      profile_id: selectedId,
      location_id: user!.location_id,
      document_type: docType,
      title: docTitle.trim(),
      description: docDesc.trim() || null,
      issue_date: docIssueDate || null,
      expiry_date: docExpiryDate || null,
      uploaded_by: user!.id,
    })
    if (error) alert('Blad: ' + error.message)
    else {
      setDocTitle('')
      setDocDesc('')
      setDocIssueDate('')
      setDocExpiryDate('')
      setShowDocForm(false)
      loadDocs(selectedId)
    }
    setSavingDoc(false)
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm('Usunac dokument?')) return
    await supabase.from('worker_documents').update({ is_active: false }).eq('id', docId)
    if (selectedId) loadDocs(selectedId)
  }

  // ─── Guards ────────────────────────────────────────────
  if (loading || !user) return null
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-stone-50 p-4 flex items-center justify-center">
        <p className="text-gray-400">Brak dostepu</p>
      </div>
    )
  }

  const selected = workers.find(w => w.id === selectedId)
  const currentMonth = format(new Date(), 'LLLL yyyy', { locale: pl })

  // ─── LISTA PRACOWNIKÓW ─────────────────────────────────
  if (!selectedId) {
    const active = workers.filter(w => w.is_active)
    const inactive = workers.filter(w => !w.is_active)
    const totalMonthCost = Object.values(monthHours).reduce((s, m) => s + m.cost, 0)
    const totalMonthHours = Object.values(monthHours).reduce((s, m) => s + m.hours, 0)

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
              <h1 className="text-lg font-bold text-gray-900">Teczki pracownikow</h1>
              <p className="text-xs text-gray-400">{active.length} aktywnych · {currentMonth}</p>
            </div>
          </div>

          {/* Month Summary */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Podsumowanie miesiaca</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xl font-bold text-gray-900">{active.length}</div>
                <div className="text-[10px] text-gray-400">pracownikow</div>
              </div>
              <div>
                <div className="text-xl font-bold text-gray-900">{Math.round(totalMonthHours)}h</div>
                <div className="text-[10px] text-gray-400">godzin</div>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-600">{totalMonthCost} zl</div>
                <div className="text-[10px] text-gray-400">koszt</div>
              </div>
            </div>
          </div>

          {/* Worker Cards */}
          <div className="space-y-2">
            {active.map(w => {
              const mh = monthHours[w.id]
              const initials = w.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)
              return (
                <button
                  key={w.id}
                  onClick={() => { setSelectedId(w.id); setActiveSection('info'); setEditing(false) }}
                  className="w-full bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {w.avatar_url ? (
                        <img src={w.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-sm font-bold text-gray-600">
                          {initials}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{w.full_name}</div>
                        <div className="text-xs text-gray-400">
                          {w.position || ROLE_LABELS[w.role] || w.role} · {w.hourly_rate} zl/h
                        </div>
                        <div className="text-[10px] text-gray-300">
                          {CONTRACT_LABELS[w.contract_type] || w.contract_type}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {mh ? (
                        <>
                          <div className="text-sm font-bold text-gray-900">{mh.hours}h</div>
                          <div className="text-[10px] text-emerald-500 font-medium">{mh.cost} zl</div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-300">0h</div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Inactive */}
          {inactive.length > 0 && (
            <div className="pt-2">
              <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2 px-1">
                Nieaktywni ({inactive.length})
              </div>
              {inactive.map(w => (
                <button
                  key={w.id}
                  onClick={() => { setSelectedId(w.id); setActiveSection('info'); setEditing(false) }}
                  className="w-full bg-gray-50 rounded-2xl border border-gray-100 p-3 text-left opacity-50 mb-1.5"
                >
                  <div className="text-sm text-gray-500">{w.full_name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── TECZKA PRACOWNIKA (DETAIL) ──────────────────────
  if (!selected) return null

  const initials = selected.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)
  const mh = monthHours[selected.id]
  const now = new Date()
  const expiringDocs = docs.filter(d => d.expiry_date && new Date(d.expiry_date) <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
  const expiredDocs = docs.filter(d => d.expiry_date && new Date(d.expiry_date) < now)

  const sections: { key: SectionType; label: string; icon: string; badge?: number }[] = [
    { key: 'info', label: 'Dane', icon: '👤' },
    { key: 'employment', label: 'Zatrudnienie', icon: '📋' },
    { key: 'documents', label: 'Dokumenty', icon: '📁', badge: expiredDocs.length || undefined },
    { key: 'hours', label: 'Godziny', icon: '⏱️' },
  ]

  return (
    <div className="min-h-screen bg-stone-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Back */}
        <button
          onClick={() => { setSelectedId(null); setEditing(false); setShowDocForm(false) }}
          className="text-xs text-gray-400 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Powrot do listy
        </button>

        {/* Profile Header Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative">
              {selected.avatar_url ? (
                <img src={selected.avatar_url} alt="" className="w-16 h-16 rounded-2xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xl font-bold text-gray-500">
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] shadow-md active:scale-90 transition-all"
              >
                {uploadingAvatar ? '...' : '📷'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">{selected.full_name}</h2>
              <div className="text-sm text-gray-400">
                {selected.position || ROLE_LABELS[selected.role] || selected.role}
              </div>
              {!selected.is_active && (
                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium mt-1 inline-block">
                  Nieaktywny
                </span>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-blue-50 rounded-xl p-2.5 text-center">
              <div className="text-lg font-bold text-gray-900">{selected.hourly_rate}</div>
              <div className="text-[9px] text-gray-400 uppercase">zl/h</div>
            </div>
            <div className="bg-violet-50 rounded-xl p-2.5 text-center">
              <div className="text-xs font-bold text-gray-900 leading-tight mt-0.5">
                {CONTRACT_LABELS[selected.contract_type]?.replace('Umowa ', '') || selected.contract_type}
              </div>
              <div className="text-[9px] text-gray-400 uppercase">umowa</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
              <div className="text-lg font-bold text-gray-900">{mh?.hours || 0}h</div>
              <div className="text-[9px] text-gray-400 uppercase">ten mies.</div>
            </div>
          </div>
        </div>

        {/* Expired docs alert */}
        {expiredDocs.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3">
            <div className="text-sm font-bold text-red-700">⛔ Wygasle dokumenty ({expiredDocs.length})</div>
            {expiredDocs.map(d => (
              <div key={d.id} className="text-xs text-red-600 mt-1">
                {DOC_TYPES.find(t => t.key === d.document_type)?.icon} {d.title} — wygasl {new Date(d.expiry_date!).toLocaleDateString('pl-PL')}
              </div>
            ))}
          </div>
        )}

        {expiringDocs.length > 0 && expiredDocs.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="text-sm font-bold text-amber-700">⚠️ Dokumenty wygasaja wkrotce ({expiringDocs.length})</div>
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
          {sections.map(s => (
            <button
              key={s.key}
              onClick={() => { setActiveSection(s.key); setEditing(false); setShowDocForm(false) }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all relative ${
                activeSection === s.key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {s.icon} {s.label}
              {s.badge && s.badge > 0 && (
                <span className="absolute -top-1 -right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {s.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── SECTION: DANE OSOBOWE ──────────────────────── */}
        {activeSection === 'info' && !editing && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Dane osobowe
              </div>
              <button
                onClick={() => { setEditing(true); setEditData(selected) }}
                className="text-xs text-blue-500 font-medium px-3 py-1 bg-blue-50 rounded-lg"
              >
                Edytuj
              </button>
            </div>

            <InfoRow label="Imie i nazwisko" value={selected.full_name} />
            <InfoRow label="Stanowisko" value={selected.position} />
            <InfoRow label="Data urodzenia" value={selected.date_of_birth ? format(new Date(selected.date_of_birth), 'd MMMM yyyy', { locale: pl }) : null} />
            <InfoRow label="PESEL" value={selected.pesel} />
            <InfoRow label="NIP" value={selected.nip} />
            <InfoRow label="Telefon" value={selected.phone} />
            <InfoRow label="Email" value={selected.email} />
            <InfoRow label="Adres" value={selected.address} />
            <InfoRow label="Kontakt awaryjny" value={selected.emergency_contact} />
            <InfoRow label="Rozmiar koszulki" value={selected.shirt_size} />
            <InfoRow label="Rozmiar butow" value={selected.shoe_size} />
            {selected.notes && (
              <div className="pt-1">
                <div className="text-[10px] text-gray-400 uppercase mb-1">Notatki</div>
                <div className="text-sm text-gray-700 bg-yellow-50 rounded-lg p-2.5">{selected.notes}</div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'info' && editing && (
          <div className="bg-white rounded-2xl border-2 border-blue-200 p-4 shadow-sm space-y-3">
            <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">
              Edycja danych osobowych
            </div>

            <EditField label="Stanowisko" value={editData.position || ''} placeholder="np. Kucharz, Kelner, Szef kuchni"
              onChange={v => setEditData({ ...editData, position: v })} />
            <EditField label="Data urodzenia" value={editData.date_of_birth || ''} type="date"
              onChange={v => setEditData({ ...editData, date_of_birth: v })} />
            <EditField label="PESEL" value={editData.pesel || ''} placeholder="00000000000"
              onChange={v => setEditData({ ...editData, pesel: v })} />
            <EditField label="NIP" value={editData.nip || ''} placeholder="000-000-00-00"
              onChange={v => setEditData({ ...editData, nip: v })} />
            <EditField label="Telefon" value={editData.phone || ''} type="tel" placeholder="+48 000 000 000"
              onChange={v => setEditData({ ...editData, phone: v })} />
            <EditField label="Adres zamieszkania" value={editData.address || ''} placeholder="ul. Przykladowa 1, 43-300 Bielsko-Biala"
              onChange={v => setEditData({ ...editData, address: v })} />
            <EditField label="Kontakt awaryjny" value={editData.emergency_contact || ''} placeholder="Jan Kowalski, +48 000 000 000"
              onChange={v => setEditData({ ...editData, emergency_contact: v })} />
            <EditField label="Nr konta bankowego" value={editData.bank_account || ''} placeholder="PL 00 0000 0000 0000 0000 0000 0000"
              onChange={v => setEditData({ ...editData, bank_account: v })} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 uppercase">Rozmiar koszulki</label>
                <select
                  value={editData.shirt_size || ''}
                  onChange={e => setEditData({ ...editData, shirt_size: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1"
                >
                  <option value="">—</option>
                  {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <EditField label="Rozmiar butow" value={editData.shoe_size || ''} placeholder="42"
                onChange={v => setEditData({ ...editData, shoe_size: v })} />
            </div>

            <div>
              <label className="text-[10px] text-gray-400 uppercase">Notatki</label>
              <textarea
                value={editData.notes || ''}
                onChange={e => setEditData({ ...editData, notes: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1 min-h-[60px]"
                placeholder="Dodatkowe informacje, alergie, preferencje..."
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => setEditing(false)}
                className="bg-gray-100 text-gray-600 font-semibold py-2.5 rounded-xl text-sm">
                Anuluj
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {saving ? 'Zapisuje...' : 'Zapisz'}
              </button>
            </div>
          </div>
        )}

        {/* ─── SECTION: ZATRUDNIENIE ──────────────────────── */}
        {activeSection === 'employment' && !editing && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Warunki zatrudnienia
              </div>
              <button
                onClick={() => { setEditing(true); setEditData(selected) }}
                className="text-xs text-blue-500 font-medium px-3 py-1 bg-blue-50 rounded-lg"
              >
                Edytuj
              </button>
            </div>

            <InfoRow label="Typ umowy" value={CONTRACT_LABELS[selected.contract_type] || selected.contract_type} />
            <InfoRow label="Stawka godzinowa" value={`${selected.hourly_rate} zl/h`} />
            <InfoRow label="Rola w systemie" value={ROLE_LABELS[selected.role] || selected.role} />
            <InfoRow label="Data zatrudnienia" value={selected.hire_date ? format(new Date(selected.hire_date), 'd MMMM yyyy', { locale: pl }) : null} />
            <InfoRow label="Umowa od" value={selected.contract_start ? format(new Date(selected.contract_start), 'd MMMM yyyy', { locale: pl }) : null} />
            <InfoRow label="Umowa do" value={selected.contract_end ? format(new Date(selected.contract_end), 'd MMMM yyyy', { locale: pl }) : null} />

            {selected.contract_end && new Date(selected.contract_end) < now && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 font-medium">
                ⛔ Umowa wygasla {format(new Date(selected.contract_end), 'd MMMM yyyy', { locale: pl })}!
              </div>
            )}
            {selected.contract_end && new Date(selected.contract_end) >= now && new Date(selected.contract_end) <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700 font-medium">
                ⚠️ Umowa wygasa {format(new Date(selected.contract_end), 'd MMMM yyyy', { locale: pl })}
              </div>
            )}
          </div>
        )}

        {activeSection === 'employment' && editing && (
          <div className="bg-white rounded-2xl border-2 border-blue-200 p-4 shadow-sm space-y-3">
            <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">
              Edycja zatrudnienia
            </div>

            <div>
              <label className="text-[10px] text-gray-400 uppercase">Typ umowy</label>
              <select
                value={editData.contract_type || 'zlecenie'}
                onChange={e => setEditData({ ...editData, contract_type: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1"
              >
                {Object.entries(CONTRACT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <EditField label="Stawka godzinowa (zl/h)" value={editData.hourly_rate?.toString() || ''} type="number"
              onChange={v => setEditData({ ...editData, hourly_rate: parseFloat(v) || 0 })} />
            <EditField label="Data zatrudnienia" value={editData.hire_date || ''} type="date"
              onChange={v => setEditData({ ...editData, hire_date: v })} />
            <EditField label="Umowa od" value={editData.contract_start || ''} type="date"
              onChange={v => setEditData({ ...editData, contract_start: v })} />
            <EditField label="Umowa do" value={editData.contract_end || ''} type="date"
              onChange={v => setEditData({ ...editData, contract_end: v })} />

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => setEditing(false)}
                className="bg-gray-100 text-gray-600 font-semibold py-2.5 rounded-xl text-sm">
                Anuluj
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {saving ? 'Zapisuje...' : 'Zapisz'}
              </button>
            </div>
          </div>
        )}

        {/* ─── SECTION: DOKUMENTY ─────────────────────────── */}
        {activeSection === 'documents' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Dokumenty ({docs.length})
                </div>
                {!showDocForm && (
                  <button
                    onClick={() => setShowDocForm(true)}
                    className="text-xs text-blue-500 font-medium px-3 py-1 bg-blue-50 rounded-lg"
                  >
                    + Dodaj
                  </button>
                )}
              </div>

              {docs.length === 0 && !showDocForm && (
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">📁</div>
                  <p className="text-xs text-gray-300">Brak dokumentow — dodaj umowe, badania, szkolenia</p>
                </div>
              )}

              {/* Documents grouped by type */}
              {docs.length > 0 && (
                <div className="space-y-2">
                  {docs.map(d => {
                    const dt = DOC_TYPES.find(t => t.key === d.document_type)
                    const isExpired = d.expiry_date && new Date(d.expiry_date) < now
                    return (
                      <div key={d.id} className={`border rounded-xl p-3 ${
                        isExpired ? 'border-red-200 bg-red-50/50' : 'border-gray-100'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-lg">{dt?.icon || '📋'}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{d.title}</div>
                              <div className="text-[10px] text-gray-400">{dt?.label || d.document_type}</div>
                              {d.issue_date && (
                                <div className="text-[10px] text-gray-300">
                                  Wydano: {new Date(d.issue_date).toLocaleDateString('pl-PL')}
                                </div>
                              )}
                              {d.expiry_date && (
                                <div className={`text-[10px] font-medium ${isExpired ? 'text-red-600' : 'text-gray-400'}`}>
                                  {isExpired ? '⛔ Wygasl' : 'Wazne do'}: {new Date(d.expiry_date).toLocaleDateString('pl-PL')}
                                </div>
                              )}
                            </div>
                          </div>
                          <button onClick={() => handleDeleteDoc(d.id)} className="text-red-300 hover:text-red-500 text-xs ml-2">
                            ✕
                          </button>
                        </div>
                        {d.description && (
                          <div className="text-xs text-gray-400 mt-1 pl-8">{d.description}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Add Document Form */}
            {showDocForm && (
              <div className="bg-white border-2 border-blue-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">
                  Nowy dokument
                </div>

                <select value={docType} onChange={e => setDocType(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm">
                  {DOC_TYPES.map(dt => <option key={dt.key} value={dt.key}>{dt.icon} {dt.label}</option>)}
                </select>

                <input type="text" placeholder="Nazwa dokumentu" value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm" />

                <input type="text" placeholder="Opis (opcjonalnie)" value={docDesc}
                  onChange={e => setDocDesc(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm" />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase">Data wydania</label>
                    <input type="date" value={docIssueDate} onChange={e => setDocIssueDate(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase">Wazne do</label>
                    <input type="date" value={docExpiryDate} onChange={e => setDocExpiryDate(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={() => setShowDocForm(false)}
                    className="bg-gray-100 text-gray-600 font-semibold py-2.5 rounded-xl text-sm">
                    Anuluj
                  </button>
                  <button onClick={handleAddDoc} disabled={savingDoc || !docTitle.trim()}
                    className="bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {savingDoc ? '...' : 'Dodaj'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── SECTION: GODZINY ──────────────────────────── */}
        {activeSection === 'hours' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-4">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              {currentMonth}
            </div>

            {mh ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">{mh.hours}h</div>
                    <div className="text-[10px] text-gray-400">godziny</div>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">{mh.days}</div>
                    <div className="text-[10px] text-gray-400">dni pracy</div>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{mh.cost} zl</div>
                    <div className="text-[10px] text-gray-400">koszt</div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Srednia dzienna</span>
                    <span className="font-medium text-gray-700">{mh.days > 0 ? (mh.hours / mh.days).toFixed(1) : 0}h</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-400">Stawka</span>
                    <span className="font-medium text-gray-700">{selected.hourly_rate} zl/h</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-400">Prognoza (30 dni)</span>
                    <span className="font-medium text-emerald-600">
                      ~{mh.days > 0 ? Math.round((mh.hours / mh.days) * 22 * selected.hourly_rate) : 0} zl
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">⏱️</div>
                <p className="text-xs text-gray-300">Brak zarejestrowanych godzin w tym miesiacu</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Helper Components ─────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-700 font-medium text-right max-w-[60%] break-words">
        {value || <span className="text-gray-200">—</span>}
      </span>
    </div>
  )
}

function EditField({ label, value, type = 'text', placeholder, onChange }: {
  label: string; value: string; type?: string; placeholder?: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-400 uppercase">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1"
      />
    </div>
  )
}
