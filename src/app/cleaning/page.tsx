'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

interface Task {
  id: string
  name: string
  description: string | null
  category: string
}

const catLabels: Record<string, string> = {
  equipment: '🔧 Sprzęt',
  cooling: '❄️ Chłodnictwo',
  sanitation: '🧹 Sanitaria',
  inventory: '📦 Magazyn',
}

function getWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const year = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - year.getTime()) / 86400000 + 1) / 7)
}

export default function CleaningPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useUser()
  const [tasks, setTasks] = useState<Task[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (authLoading || !user) return
    async function load() {
      const { data } = await supabase
        .from('cleaning_tasks')
        .select('*')
        .eq('location_id', user!.location_id)
        .eq('is_active', true)
        .order('sort_order')
      if (data) setTasks(data)
      setLoading(false)
    }
    load()
  }, [user, authLoading])

  const doneCount = Object.values(checked).filter(Boolean).length
  const pct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const grouped = tasks.reduce((acc, t) => {
    const c = t.category || 'general'
    if (!acc[c]) acc[c] = []
    acc[c].push(t)
    return acc
  }, {} as Record<string, Task[]>)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)

    try {
      const { data: log, error: logErr } = await supabase
        .from('cleaning_logs')
        .insert({
          location_id: user.location_id,
          author_id: user.id,
          log_date: new Date().toISOString().split('T')[0],
          week_number: getWeek(new Date()),
          status: 'submitted',
        })
        .select()
        .single()

      if (logErr) throw logErr

      const entries = tasks.map(t => ({
        log_id: log.id,
        cleaning_task_id: t.id,
        is_completed: checked[t.id] || false,
        completed_by: checked[t.id] ? user.id : null,
        completed_at: checked[t.id] ? new Date().toISOString() : null,
      }))

      const { error } = await supabase.from('cleaning_entries').insert(entries)
      if (error) throw error

      // Send email report
      try {
        await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'cleaning',
            data: {
              date: new Date().toISOString().split('T')[0],
              week: getWeek(new Date()),
              author: user.full_name,
              tasks: tasks.map(t => ({
                name: t.name,
                done: checked[t.id] || false,
              })),
            },
          }),
        })
      } catch (e) { console.log('Email skip:', e) }

      setDone(true)
      setTimeout(() => router.push('/'), 2000)
    } catch (err: any) {
      alert('Błąd: ' + (err.message || 'Nieznany'))
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-700">Zapisano!</h2>
          <p className="text-gray-500 mt-2">Raport czystości wysłany.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        <div>
          <button onClick={() => router.push('/')} className="text-brand-600 text-sm font-medium">← Powrót</button>
          <h1 className="text-xl font-bold mt-1">🧹 Sprzątanie tygodniowe</h1>
          <p className="text-xs text-gray-400">Tydzień {getWeek(new Date())}</p>
        </div>

        {/* Progress */}
        <div className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Postęp</span>
            <span className="font-bold text-brand-600">{doneCount}/{tasks.length} ({pct}%)</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Tasks by category */}
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              {catLabels[cat] || cat}
            </h3>
            <div className="space-y-2">
              {items.map(task => (
                <button
                  key={task.id}
                  onClick={() => setChecked(p => ({ ...p, [task.id]: !p[task.id] }))}
                  className={`w-full card border-2 text-left flex items-start gap-3 transition-all ${
                    checked[task.id] ? 'border-green-300 bg-green-50' : 'border-gray-100'
                  }`}
                >
                  <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 ${
                    checked[task.id] ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                  }`}>
                    {checked[task.id] && '✓'}
                  </div>
                  <div>
                    <div className={`font-medium text-sm ${checked[task.id] ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                      {task.name}
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {tasks.length > 0 && (
          <button onClick={handleSave} disabled={saving} className="btn-green">
            {saving ? 'Zapisuję...' : `✅ Zapisz raport (${doneCount}/${tasks.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
