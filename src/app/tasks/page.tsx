'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

interface WorkerTask {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  assigned_name?: string
  created_by: string
  created_by_name?: string
  due_date: string | null
  is_completed: boolean
  created_at: string
}

interface Profile {
  id: string
  full_name: string
}

export default function TasksPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useUser()
  const [tasks, setTasks] = useState<WorkerTask[]>([])
  const [workers, setWorkers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newAssign, setNewAssign] = useState('')
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'mine' | 'created' | 'all'>('mine')

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  useEffect(() => {
    if (authLoading || !user) return
    loadTasks()
    loadWorkers()
  }, [user, authLoading, filter])

  async function loadTasks() {
    let query = supabase
      .from('worker_tasks')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('is_completed')
      .order('created_at', { ascending: false })

    // Filter based on selected tab
    if (filter === 'mine') {
      query = query.eq('assigned_to', user!.id)
    } else if (filter === 'created') {
      query = query.eq('created_by', user!.id)
    }
    // 'all' — no filter (everyone sees all tasks)

    const { data } = await query
    if (data) {
      // Get names for assigned_to AND created_by
      const allIds = new Array<string>()
      data.forEach(t => {
        if (t.assigned_to) allIds.push(t.assigned_to)
        if (t.created_by) allIds.push(t.created_by)
      })
      const uniqueIds = allIds.filter((v, i, a) => a.indexOf(v) === i)

      let nameMap: Record<string, string> = {}
      if (uniqueIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueIds)
        if (profiles) {
          profiles.forEach(p => { nameMap[p.id] = p.full_name })
        }
      }
      setTasks(data.map(t => ({
        ...t,
        assigned_name: nameMap[t.assigned_to] || '',
        created_by_name: nameMap[t.created_by] || '',
      })))
    }
    setLoading(false)
  }

  async function loadWorkers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
    if (data) setWorkers(data)
  }

  async function addTask() {
    if (!newTitle.trim() || !user) return
    setSaving(true)

    const { error } = await supabase.from('worker_tasks').insert({
      location_id: user.location_id,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      assigned_to: newAssign || null,
      created_by: user.id,
      due_date: newDate || null,
    })

    if (error) { alert('Błąd: ' + error.message); setSaving(false); return }

    setNewTitle('')
    setNewDesc('')
    setNewAssign('')
    setNewDate('')
    setShowForm(false)
    setSaving(false)
    loadTasks()
  }

  async function toggleTask(task: WorkerTask) {
    await supabase
      .from('worker_tasks')
      .update({
        is_completed: !task.is_completed,
        completed_at: !task.is_completed ? new Date().toISOString() : null,
      })
      .eq('id', task.id)
    loadTasks()
  }

  async function deleteTask(id: string) {
    await supabase.from('worker_tasks').delete().eq('id', id)
    loadTasks()
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/')} className="text-brand-600 text-sm font-medium">← Powrót</button>
            <h1 className="text-xl font-bold mt-1">📋 Zadania</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-brand-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-600"
          >
            + Dodaj
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setFilter('mine')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${filter === 'mine' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
          >
            Moje zadania
          </button>
          <button
            onClick={() => setFilter('created')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${filter === 'created' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
          >
            Utworzone przeze mnie
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${filter === 'all' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
          >
            Wszystkie
          </button>
        </div>

        {/* Add task form */}
        {showForm && (
          <div className="card border-2 border-brand-200 space-y-3">
            <div className="text-xs text-gray-400 font-medium">
              Od: <span className="text-gray-700 font-bold">{user?.full_name}</span>
            </div>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Tytuł zadania..."
              className="input"
              autoFocus
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Opis (opcjonalny)..."
              className="input"
              rows={2}
            />
            <select
              value={newAssign}
              onChange={e => setNewAssign(e.target.value)}
              className="input"
            >
              <option value="">Dla kogo? (przypisz osobę)</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.full_name}</option>
              ))}
            </select>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="input"
              placeholder="Termin"
            />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowForm(false)} className="btn-white text-sm py-3">Anuluj</button>
              <button onClick={addTask} disabled={saving || !newTitle.trim()} className="btn-orange text-sm py-3">
                {saving ? '...' : 'Dodaj zadanie'}
              </button>
            </div>
          </div>
        )}

        {/* Task list */}
        {tasks.length === 0 ? (
          <div className="card text-center py-10">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500">
              {filter === 'mine' ? 'Brak zadań przypisanych do Ciebie.' :
               filter === 'created' ? 'Nie utworzyłeś jeszcze żadnych zadań.' :
               'Brak zadań. Dodaj pierwsze!'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => {
              const canDelete = isAdmin || task.created_by === user?.id

              return (
                <div key={task.id} className={`card border-2 ${task.is_completed ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleTask(task)}
                      className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 ${
                        task.is_completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                      }`}
                    >
                      {task.is_completed && '✓'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${task.is_completed ? 'line-through text-green-800' : 'text-gray-900'}`}>
                        {task.title}
                      </div>
                      {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                        {task.created_by_name && (
                          <span className="text-purple-500">
                            ✉️ Od: <span className="font-medium">{task.created_by_name}</span>
                          </span>
                        )}
                        {task.assigned_name && (
                          <span className="text-blue-500">
                            👤 Dla: <span className="font-medium">{task.assigned_name}</span>
                          </span>
                        )}
                        {task.due_date && <span className="text-gray-400">📅 {task.due_date}</span>}
                      </div>
                    </div>
                    {canDelete && (
                      <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
