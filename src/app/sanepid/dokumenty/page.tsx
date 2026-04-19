'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'

const CATEGORIES = [
  { key: 'decyzja', label: 'Decyzja/wpis do rejestru', icon: '📜' },
  { key: 'umowa_ddd', label: 'Umowa DDD', icon: '🐀' },
  { key: 'odpady', label: 'Wywóz odpadów', icon: '🗑️' },
  { key: 'tluszcz', label: 'Wywóz tłuszczu', icon: '🛢️' },
  { key: 'protokol', label: 'Protokół odbioru', icon: '📋' },
  { key: 'chemia', label: 'Karta chemiczna', icon: '⚗️' },
  { key: 'haccp', label: 'Księga HACCP/GHP/GMP', icon: '📕' },
  { key: 'dostawca', label: 'Umowa z dostawcą', icon: '🤝' },
  { key: 'inne', label: 'Inne', icon: '📎' },
]

interface SanepidDoc {
  id: string
  category: string
  title: string
  description: string | null
  file_url: string | null
  file_name: string | null
  expires_at: string | null
  uploaded_at: string
  is_active: boolean
}

export default function DokumentyPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [docs, setDocs] = useState<SanepidDoc[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [cat, setCat] = useState('decyzja')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (!user) return
    loadDocs()
  }, [user])

  async function loadDocs() {
    const { data } = await supabase
      .from('sanepid_documents')
      .select('*')
      .eq('location_id', user!.location_id)
      .eq('is_active', true)
      .order('category')
    if (data) setDocs(data)
  }

  async function handleAdd() {
    if (!title.trim() || !user) return
    setSaving(true)
    const { error } = await supabase.from('sanepid_documents').insert({
      location_id: user.location_id,
      category: cat,
      title: title.trim(),
      description: desc.trim() || null,
      expires_at: expiresAt || null,
      uploaded_by: user.id,
    })
    if (error) alert('Blad: ' + error.message)
    else {
      setTitle('')
      setDesc('')
      setExpiresAt('')
      setShowForm(false)
      loadDocs()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Usunac dokument?')) return
    await supabase.from('sanepid_documents').update({ is_active: false }).eq('id', id)
    loadDocs()
  }

  if (loading || !user) return null

  // Group by category
  const grouped = CATEGORIES.map(c => ({
    ...c,
    docs: docs.filter(d => d.category === c.key),
  })).filter(g => g.docs.length > 0)

  // Expiring soon (next 30 days)
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const expiring = docs.filter(d => {
    if (!d.expires_at) return false
    const exp = new Date(d.expires_at)
    return exp <= in30 && exp >= now
  })
  const expired = docs.filter(d => {
    if (!d.expires_at) return false
    return new Date(d.expires_at) < now
  })

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/sanepid')} className="text-sm text-gray-500">← Sanepid</button>
          <h1 className="text-lg font-bold">📁 Dokumenty</h1>
          <div className="w-16" />
        </div>

        {/* Alerts */}
        {expired.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="text-sm font-bold text-red-700">🔴 Wygasle dokumenty ({expired.length})</div>
            {expired.map(d => (
              <div key={d.id} className="text-xs text-red-600 mt-1">
                {d.title} — wygasl {new Date(d.expires_at!).toLocaleDateString('pl-PL')}
              </div>
            ))}
          </div>
        )}

        {expiring.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="text-sm font-bold text-amber-700">🟡 Wygasaja wkrotce ({expiring.length})</div>
            {expiring.map(d => (
              <div key={d.id} className="text-xs text-amber-600 mt-1">
                {d.title} — wygasa {new Date(d.expires_at!).toLocaleDateString('pl-PL')}
              </div>
            ))}
          </div>
        )}

        {/* Document list by category */}
        {grouped.length > 0 ? (
          grouped.map(g => (
            <div key={g.key}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                {g.icon} {g.label}
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
                {g.docs.map(d => (
                  <div key={d.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{d.title}</div>
                      {d.description && <div className="text-xs text-gray-400 truncate">{d.description}</div>}
                      {d.expires_at && (
                        <div className={`text-[10px] mt-0.5 ${
                          new Date(d.expires_at) < now ? 'text-red-500 font-bold' : 'text-gray-400'
                        }`}>
                          Wygasa: {new Date(d.expires_at).toLocaleDateString('pl-PL')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noopener" className="text-blue-500 text-xs">Podglad</a>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDelete(d.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-300 py-8">
            <div className="text-4xl mb-2">📁</div>
            <p className="text-sm">Brak dokumentow — dodaj pierwszy</p>
          </div>
        )}

        {/* Add button */}
        {isAdmin && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-amber-500 text-white font-bold py-3 rounded-xl active:scale-[0.97] transition-all"
          >
            + Dodaj dokument
          </button>
        )}

        {/* Add form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
            <select value={cat} onChange={e => setCat(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm">
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Nazwa dokumentu"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm"
            />
            <input
              type="text"
              placeholder="Opis (opcjonalnie)"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm"
            />
            <div>
              <label className="text-xs text-gray-500">Data wygasniecia (opcjonalnie)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl text-sm mt-1"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold">
                Anuluj
              </button>
              <button onClick={handleAdd} disabled={saving || !title.trim()} className="flex-1 bg-amber-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                {saving ? '...' : 'Zapisz'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
