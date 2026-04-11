'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { ROLES, normalizeRole } from '@/lib/roles'
import type { RoleType } from '@/lib/roles'
import supabase from '@/lib/supabase'

interface ProfileRow {
  id: string
  full_name: string
  email: string
  role: string
  pin: string
  is_active: boolean
}

const ROLE_OPTIONS: { value: RoleType; label: string; icon: string }[] = [
  { value: 'kitchen', label: 'Kuchnia', icon: '🍳' },
  { value: 'hall',    label: 'Sala',    icon: '🍽️' },
  { value: 'manager', label: 'Menager', icon: '👔' },
  { value: 'owner',   label: 'Właściciel', icon: '👑' },
]

export default function SettingsPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<RoleType>('kitchen')
  const [newPin, setNewPin] = useState('')
  const [addError, setAddError] = useState('')

  // Only owner can access
  useEffect(() => {
    if (!loading && user && normalizeRole(user.role) !== 'owner') {
      router.push('/')
    }
  }, [user, loading])

  useEffect(() => {
    if (!user) return
    loadProfiles()
  }, [user])

  async function loadProfiles() {
    setLoadingProfiles(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, pin, is_active')
      .order('full_name')
    if (data) setProfiles(data)
    setLoadingProfiles(false)
  }

  async function updateRole(profileId: string, newRole: RoleType) {
    setSaving(profileId)
    await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)
    await loadProfiles()
    setSaving(null)
  }

  async function toggleActive(profileId: string, currentActive: boolean) {
    setSaving(profileId)
    await supabase
      .from('profiles')
      .update({ is_active: !currentActive })
      .eq('id', profileId)
    await loadProfiles()
    setSaving(null)
  }

  async function addUser() {
    setAddError('')
    if (!newName.trim()) { setAddError('Wpisz imię i nazwisko'); return }
    if (newPin.length !== 4) { setAddError('PIN musi mieć 4 cyfry'); return }

    const res = await fetch('/api/add-worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: newName.trim(),
        role: newRole,
        pin: newPin,
        location_id: user!.location_id,
      }),
    })

    if (!res.ok) {
      setAddError('Błąd dodawania użytkownika')
      return
    }

    setNewName('')
    setNewPin('')
    setNewRole('kitchen')
    setShowAdd(false)
    await loadProfiles()
  }

  if (loading || !user) return null
  if (normalizeRole(user.role) !== 'owner') return null

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/')} className="text-brand-600 text-sm mb-1">← Powrót</button>
            <h1 className="text-2xl font-bold">⚙️ Ustawienia</h1>
            <p className="text-gray-500 text-sm">Zarządzanie użytkownikami i rolami</p>
          </div>
        </div>

        {/* Users list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Użytkownicy</h2>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 px-4 py-2 rounded-xl transition-colors"
            >
              {showAdd ? '✕ Anuluj' : '+ Dodaj'}
            </button>
          </div>

          {/* Add user form */}
          {showAdd && (
            <div className="card border-2 border-brand-200 space-y-3">
              <h3 className="font-bold text-sm">Nowy użytkownik</h3>
              <input
                type="text"
                placeholder="Imię i nazwisko"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="input"
              />
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setNewRole(r.value)}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${
                      newRole === r.value
                        ? `border-brand-500 bg-brand-50 shadow-md`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{r.icon}</span>
                    <div className="text-xs font-bold mt-1">{r.label}</div>
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="PIN (4 cyfry)"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="input text-center text-xl tracking-widest"
              />
              {addError && <p className="text-red-600 text-sm font-medium">{addError}</p>}
              <button onClick={addUser} className="btn-orange w-full">
                Dodaj użytkownika
              </button>
            </div>
          )}

          {/* Profiles */}
          {loadingProfiles ? (
            <div className="text-center py-8">
              <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
            </div>
          ) : (
            profiles.map(p => {
              const role = normalizeRole(p.role)
              const config = ROLES[role]
              const isSelf = p.id === user.id
              return (
                <div
                  key={p.id}
                  className={`card border-2 ${p.is_active ? 'border-gray-200' : 'border-red-200 bg-red-50 opacity-60'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} flex items-center justify-center text-lg shadow`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">
                        {p.full_name} {isSelf && <span className="text-xs text-gray-400">(Ty)</span>}
                      </div>
                      <div className="text-xs text-gray-400">PIN: {p.pin}</div>
                    </div>

                    {/* Role selector */}
                    <select
                      value={role}
                      onChange={e => updateRole(p.id, e.target.value as RoleType)}
                      disabled={saving === p.id || isSelf}
                      className={`text-xs font-bold px-2 py-1.5 rounded-lg border ${config.bgColor} ${config.color} ${isSelf ? 'opacity-50' : ''}`}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
                      ))}
                    </select>

                    {/* Active toggle */}
                    {!isSelf && (
                      <button
                        onClick={() => toggleActive(p.id, p.is_active)}
                        disabled={saving === p.id}
                        className={`text-xs px-2 py-1.5 rounded-lg font-bold ${
                          p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {p.is_active ? '✓' : '✕'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}
