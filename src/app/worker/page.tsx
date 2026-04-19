'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import supabase from '@/lib/supabase'

interface WorkerProfile {
  id: string
  full_name: string
  email: string
  role: string
  pin: string
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
}

interface MonthHours {
  hours: number
  cost: number
  days: number
}

const CONTRACT_LABELS: Record<string, string> = {
  zlecenie: 'Umowa zlecenie',
  o_prace: 'Umowa o prace',
  o_dzielo: 'Umowa o dzielo',
  b2b: 'B2B / Faktura',
}

const ROLE_LABELS: Record<string, string> = {
  kitchen: '🍳 Kuchnia',
  hall: '🍽️ Sala',
  manager: '👔 Menager',
  owner: '🥷 Owner',
}

export default function WorkerListPage() {
  const { user, loading } = useUser()
  const [workers, setWorkers] = useState<WorkerProfile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<WorkerProfile>>({})
  const [monthHours, setMonthHours] = useState<Record<string, MonthHours>>({})
  const [saving, setSaving] = useState(false)

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user || !isAdmin) return
    loadWorkers()
    loadMonthHours()
  }, [user])

  async function loadWorkers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, pin, is_active, hourly_rate, contract_type, phone, address, pesel, bank_account, emergency_contact, hire_date, notes')
      .eq('location_id', user!.location_id)
      .order('full_name')

    if (data) {
      // Fallback for missing columns
      const normalized = data.map((w: any) => ({
        ...w,
        hourly_rate: w.hourly_rate ?? 29,
        contract_type: w.contract_type ?? 'zlecenie',
        phone: w.phone ?? null,
        address: w.address ?? null,
        pesel: w.pesel ?? null,
        bank_account: w.bank_account ?? null,
        emergency_contact: w.emergency_contact ?? null,
        hire_date: w.hire_date ?? null,
        notes: w.notes ?? null,
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
      .eq('location_id', user!.location_id)
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

  // Reload month hours when workers load
  useEffect(() => {
    if (workers.length > 0 && user) loadMonthHours()
  }, [workers])

  const selected = workers.find(w => w.id === selectedId)

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
    }).eq('id', selectedId)

    if (error) {
      alert('Blad zapisu: ' + error.message)
    } else {
      setEditing(false)
      loadWorkers()
    }
    setSaving(false)
  }

  if (loading || !user) return null
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-stone-50 p-4 flex items-center justify-center">
        <p className="text-gray-400">Brak dostepu</p>
      </div>
    )
  }

  const currentMonth = format(new Date(), 'LLLL yyyy', { locale: pl })

  return (
    <div className="min-h-screen bg-stone-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Teczki pracownikow</h1>
              <p className="text-xs text-gray-400">{workers.filter(w => w.is_active).length} aktywnych · {currentMonth}</p>
            </div>
          </div>
        </div>

        {/* Worker List or Detail */}
        {!selectedId ? (
          // ─── LISTA PRACOWNIKÓW ───
          <div className="space-y-2">
            {workers.filter(w => w.is_active).map(w => {
              const mh = monthHours[w.id]
              return (
                <button
                  key={w.id}
                  onClick={() => setSelectedId(w.id)}
                  className="w-full bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg">
                        {w.role === 'kitchen' ? '🍳' : w.role === 'hall' ? '🍽️' : w.role === 'manager' ? '👔' : '🥷'}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{w.full_name}</div>
                        <div className="text-xs text-gray-400">
                          {w.hourly_rate} zl/h · {CONTRACT_LABELS[w.contract_type] || w.contract_type}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {mh ? (
                        <>
                          <div className="text-sm font-bold text-gray-900">{mh.hours}h</div>
                          <div className="text-[10px] text-gray-400">{mh.cost} zl</div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-300">0h</div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}

            {/* Inactive */}
            {workers.filter(w => !w.is_active).length > 0 && (
              <div className="pt-2">
                <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-2 px-1">
                  Nieaktywni
                </div>
                {workers.filter(w => !w.is_active).map(w => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    className="w-full bg-gray-50 rounded-2xl border border-gray-100 p-3 text-left opacity-50 mb-1.5"
                  >
                    <div className="text-sm text-gray-500">{w.full_name}</div>
                    <div className="text-xs text-gray-300">{w.hourly_rate} zl/h</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : selected ? (
          // ─── TECZKA PRACOWNIKA (DETAIL) ───
          <div className="space-y-4">
            {/* Back + Name */}
            <button
              onClick={() => { setSelectedId(null); setEditing(false) }}
              className="text-xs text-gray-400 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Powrot do listy
            </button>

            {/* Profile Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">
                  {selected.role === 'kitchen' ? '🍳' : selected.role === 'hall' ? '🍽️' : selected.role === 'manager' ? '👔' : '🥷'}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selected.full_name}</h2>
                  <div className="text-sm text-gray-400">
                    {ROLE_LABELS[selected.role] || selected.role}
                    {!selected.is_active && <span className="text-red-400 ml-2">· Nieaktywny</span>}
                  </div>
                </div>
              </div>

              {/* Key info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl p-3">
                  <div className="text-[10px] text-gray-400 uppercase">Stawka</div>
                  <div className="text-lg font-bold text-gray-900">{selected.hourly_rate} zl/h</div>
                </div>
                <div className="bg-violet-50 rounded-xl p-3">
                  <div className="text-[10px] text-gray-400 uppercase">Umowa</div>
                  <div className="text-sm font-bold text-gray-900 mt-0.5">{CONTRACT_LABELS[selected.contract_type] || selected.contract_type}</div>
                </div>
              </div>
            </div>

            {/* Month Hours */}
            {monthHours[selected.id] && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {currentMonth}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-900">{monthHours[selected.id].hours}h</div>
                    <div className="text-[10px] text-gray-400">godziny</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-900">{monthHours[selected.id].days}</div>
                    <div className="text-[10px] text-gray-400">dni pracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-900">{monthHours[selected.id].cost} zl</div>
                    <div className="text-[10px] text-gray-400">koszt</div>
                  </div>
                </div>
              </div>
            )}

            {/* Dane osobowe */}
            {!editing ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Dane osobowe
                  </div>
                  <button
                    onClick={() => { setEditing(true); setEditData(selected) }}
                    className="text-xs text-blue-500 font-medium"
                  >
                    Edytuj
                  </button>
                </div>

                <InfoRow label="Telefon" value={selected.phone} />
                <InfoRow label="Adres" value={selected.address} />
                <InfoRow label="PESEL" value={selected.pesel} />
                <InfoRow label="Nr konta" value={selected.bank_account} />
                <InfoRow label="Kontakt awaryjny" value={selected.emergency_contact} />
                <InfoRow label="Data zatrudnienia" value={selected.hire_date ? format(new Date(selected.hire_date), 'd MMMM yyyy', { locale: pl }) : null} />
                <InfoRow label="PIN" value={selected.pin} />
                <InfoRow label="Email" value={selected.email} />
                {selected.notes && (
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase mb-0.5">Notatki</div>
                    <div className="text-sm text-gray-700 bg-yellow-50 rounded-lg p-2">{selected.notes}</div>
                  </div>
                )}
              </div>
            ) : (
              // ─── EDIT MODE ───
              <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-sm space-y-3">
                <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">
                  Edycja danych
                </div>

                <EditField label="Stawka (zl/h)" value={editData.hourly_rate?.toString() || ''} type="number"
                  onChange={v => setEditData({ ...editData, hourly_rate: parseFloat(v) || 0 })} />

                <div>
                  <label className="text-[10px] text-gray-400 uppercase">Typ umowy</label>
                  <select
                    value={editData.contract_type || 'zlecenie'}
                    onChange={e => setEditData({ ...editData, contract_type: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1"
                  >
                    <option value="zlecenie">Umowa zlecenie</option>
                    <option value="o_prace">Umowa o prace</option>
                    <option value="o_dzielo">Umowa o dzielo</option>
                    <option value="b2b">B2B / Faktura</option>
                  </select>
                </div>

                <EditField label="Telefon" value={editData.phone || ''} type="tel"
                  onChange={v => setEditData({ ...editData, phone: v })} />
                <EditField label="Adres" value={editData.address || ''}
                  onChange={v => setEditData({ ...editData, address: v })} />
                <EditField label="PESEL" value={editData.pesel || ''}
                  onChange={v => setEditData({ ...editData, pesel: v })} />
                <EditField label="Nr konta bankowego" value={editData.bank_account || ''}
                  onChange={v => setEditData({ ...editData, bank_account: v })} />
                <EditField label="Kontakt awaryjny" value={editData.emergency_contact || ''}
                  onChange={v => setEditData({ ...editData, emergency_contact: v })} />
                <EditField label="Data zatrudnienia" value={editData.hire_date || ''} type="date"
                  onChange={v => setEditData({ ...editData, hire_date: v })} />

                <div>
                  <label className="text-[10px] text-gray-400 uppercase">Notatki</label>
                  <textarea
                    value={editData.notes || ''}
                    onChange={e => setEditData({ ...editData, notes: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1 min-h-[60px]"
                    placeholder="Dodatkowe informacje..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="bg-gray-100 text-gray-600 font-semibold py-2.5 rounded-xl text-sm"
                  >
                    Anuluj
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
                  >
                    {saving ? 'Zapisuje...' : 'Zapisz'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-700 font-medium">{value || <span className="text-gray-200">—</span>}</span>
    </div>
  )
}

function EditField({ label, value, type = 'text', onChange }: {
  label: string; value: string; type?: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-400 uppercase">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mt-1"
      />
    </div>
  )
}
