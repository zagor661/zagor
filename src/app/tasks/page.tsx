'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import { notifyNewTask } from '@/lib/pushClient'

type TaskStatus = 'new' | 'read' | 'in_progress' | 'done' | 'problem'

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
  is_private: boolean
  status: TaskStatus
  acknowledged_at: string | null
  started_at: string | null
  problem_at: string | null
  problem_description: string | null
  created_at: string
}

interface TaskMessage {
  id: string
  task_id: string
  sender_id: string
  sender_name: string
  message: string
  created_at: string
}

interface Profile {
  id: string
  full_name: string
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; icon: string }> = {
  new:         { label: 'Nowe',          color: 'text-gray-600',   bg: 'bg-gray-100',   icon: '📩' },
  read:        { label: 'Przeczytane',   color: 'text-blue-600',   bg: 'bg-blue-50',    icon: '👁️' },
  in_progress: { label: 'W trakcie',     color: 'text-orange-600', bg: 'bg-orange-50',  icon: '🔧' },
  done:        { label: 'Wykonane',      color: 'text-green-600',  bg: 'bg-green-50',   icon: '✅' },
  problem:     { label: 'Problem',       color: 'text-red-600',    bg: 'bg-red-50',     icon: '⚠️' },
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
  const [newPrivate, setNewPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'mine' | 'created' | 'all'>('mine')

  // Private message (admin-only shortcut) state
  const [showPrivateMsg, setShowPrivateMsg] = useState(false)
  const [pmAssign, setPmAssign] = useState('')
  const [pmText, setPmText] = useState('')

  // Chat state
  const [openChatId, setOpenChatId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<TaskMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Problem report state
  const [problemTaskId, setProblemTaskId] = useState<string | null>(null)
  const [problemText, setProblemText] = useState('')

  const isAdmin = user ? isAdminRole(user.role) : false

  useEffect(() => {
    if (authLoading || !user) return
    loadTasks()
    loadWorkers()
  }, [user, authLoading, filter])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function loadTasks() {
    let query = supabase
      .from('worker_tasks')
      .select('*')
      .eq('location_id', user!.location_id)
      .order('is_completed')
      .order('created_at', { ascending: false })

    if (filter === 'mine') {
      query = query.eq('assigned_to', user!.id)
    } else if (filter === 'created') {
      query = query.eq('created_by', user!.id)
    } else if (filter === 'all' && !isAdmin) {
      // Zwykły pracownik w "Wszystkie": ukryj tajne, chyba że jest przypisanym albo autorem
      query = query.or(`is_private.eq.false,assigned_to.eq.${user!.id},created_by.eq.${user!.id}`)
    }

    const { data } = await query
    if (data) {
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

  // ─── Status transitions ────────────────────────────────────
  async function updateStatus(taskId: string, newStatus: TaskStatus, extras?: Record<string, any>) {
    const updates: Record<string, any> = { status: newStatus, ...extras }
    if (newStatus === 'read') updates.acknowledged_at = new Date().toISOString()
    if (newStatus === 'in_progress') updates.started_at = new Date().toISOString()
    if (newStatus === 'done') {
      updates.is_completed = true
      updates.completed_at = new Date().toISOString()
    }
    if (newStatus === 'problem') {
      updates.problem_at = new Date().toISOString()
    }

    await supabase.from('worker_tasks').update(updates).eq('id', taskId)

    // If problem — push to Google Sheets
    if (newStatus === 'problem') {
      const task = tasks.find(t => t.id === taskId)
      if (task && user) {
        pushProblemToSheet(task, extras?.problem_description || '')
      }
    }

    loadTasks()
  }

  async function pushProblemToSheet(task: WorkerTask, problemDesc: string) {
    // Load chat messages for context
    const { data: msgs } = await supabase
      .from('task_messages')
      .select('sender_name, message, created_at')
      .eq('task_id', task.id)
      .order('created_at')

    const chatLog = msgs?.map(m =>
      `[${new Date(m.created_at).toLocaleString('pl-PL')}] ${m.sender_name}: ${m.message}`
    ).join('\n') || ''

    fetch('/api/task-problem-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toISOString(),
        location: user!.location_name || '',
        task_title: task.title,
        task_description: task.description || '',
        assigned_to: task.assigned_name || '',
        created_by: task.created_by_name || '',
        problem_description: problemDesc,
        chat_log: chatLog,
        due_date: task.due_date || '',
      }),
    }).catch(() => {})
  }

  // ─── Chat ──────────────────────────────────────────────────
  async function openChat(taskId: string) {
    setOpenChatId(taskId)
    setChatInput('')
    const { data } = await supabase
      .from('task_messages')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at')
    setChatMessages(data || [])
  }

  async function sendMessage() {
    if (!chatInput.trim() || !user || !openChatId) return
    setSendingChat(true)
    const { error } = await supabase.from('task_messages').insert({
      task_id: openChatId,
      sender_id: user.id,
      sender_name: user.full_name,
      message: chatInput.trim(),
    })
    if (!error) {
      setChatInput('')
      const { data } = await supabase
        .from('task_messages')
        .select('*')
        .eq('task_id', openChatId)
        .order('created_at')
      setChatMessages(data || [])
    }
    setSendingChat(false)
  }

  // ─── Problem flow ──────────────────────────────────────────
  function startProblemReport(taskId: string) {
    setProblemTaskId(taskId)
    setProblemText('')
  }

  async function submitProblem() {
    if (!problemTaskId || !problemText.trim()) return
    setSaving(true)

    // Add problem as first chat message
    if (user) {
      await supabase.from('task_messages').insert({
        task_id: problemTaskId,
        sender_id: user.id,
        sender_name: user.full_name,
        message: `⚠️ PROBLEM: ${problemText.trim()}`,
      })
    }

    await updateStatus(problemTaskId, 'problem', {
      problem_description: problemText.trim(),
    })

    setProblemTaskId(null)
    setProblemText('')
    setSaving(false)
  }

  // ─── Add task ──────────────────────────────────────────────
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
      status: 'new',
      is_private: newPrivate,
    })

    if (error) { alert('Błąd: ' + error.message); setSaving(false); return }

    // Push notification to assigned worker
    if (newAssign) {
      notifyNewTask(user.location_id, newAssign, newTitle.trim())
    }

    setNewTitle('')
    setNewDesc('')
    setNewAssign('')
    setNewDate('')
    setNewPrivate(false)
    setShowForm(false)
    setSaving(false)
    loadTasks()
  }

  // ─── Private message (admin-only shortcut) ─────────────────
  async function sendPrivateMessage() {
    if (!pmAssign || !pmText.trim() || !user) return
    setSaving(true)
    const { error } = await supabase.from('worker_tasks').insert({
      location_id: user.location_id,
      title: 'Proszę o odpowiedź',
      description: pmText.trim(),
      assigned_to: pmAssign,
      created_by: user.id,
      status: 'new',
      is_private: true,
    })
    if (error) { alert('Błąd: ' + error.message); setSaving(false); return }
    setPmAssign('')
    setPmText('')
    setShowPrivateMsg(false)
    setSaving(false)
    loadTasks()
  }

  async function deleteTask(id: string) {
    await supabase.from('worker_tasks').delete().eq('id', id)
    loadTasks()
  }

  // ─── Helpers ───────────────────────────────────────────────
  function getNextActions(task: WorkerTask): { primary?: { label: string; action: () => void; color: string }; secondary?: { label: string; action: () => void }; chat?: boolean } {
    const isMine = task.assigned_to === user?.id

    if (!isMine && !isAdmin) return { chat: task.status !== 'new' }

    switch (task.status) {
      case 'new':
        return {
          primary: { label: '👁️ Przeczytałem', action: () => updateStatus(task.id, 'read'), color: 'bg-blue-500 hover:bg-blue-600' },
        }
      case 'read':
        return {
          primary: { label: '🔧 Zajmuję się', action: () => updateStatus(task.id, 'in_progress'), color: 'bg-orange-500 hover:bg-orange-600' },
          chat: true,
        }
      case 'in_progress':
        return {
          primary: { label: '✅ Done', action: () => updateStatus(task.id, 'done'), color: 'bg-green-500 hover:bg-green-600' },
          secondary: { label: '⚠️ Problem', action: () => startProblemReport(task.id) },
          chat: true,
        }
      case 'problem':
        return {
          primary: isAdmin ? { label: '✅ Rozwiązane', action: () => updateStatus(task.id, 'done'), color: 'bg-green-500 hover:bg-green-600' } : undefined,
          chat: true,
        }
      case 'done':
        return { chat: true }
      default:
        return {}
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'teraz'
    if (min < 60) return `${min}min temu`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h temu`
    const d = Math.floor(h / 24)
    return `${d}d temu`
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
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowPrivateMsg(true)}
                className="bg-purple-500 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-purple-600"
                title="Prywatna wiadomość — tajne zadanie 'Proszę o odpowiedź'"
              >
                ✉️ Private
              </button>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-brand-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-600"
            >
              + Dodaj
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setFilter('mine')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${filter === 'mine' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
          >
            Moje
          </button>
          <button
            onClick={() => setFilter('created')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${filter === 'created' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
          >
            Utworzone
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
            <label className="flex items-center gap-2 cursor-pointer select-none px-2 py-2 rounded-lg hover:bg-purple-50">
              <input
                type="checkbox"
                checked={newPrivate}
                onChange={e => setNewPrivate(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-xs font-medium text-gray-700">
                🔒 Tajne zadanie (secret) — widoczne tylko dla: przypisany, autor, Menager, Właściciel
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowForm(false)} className="btn-white text-sm py-3">Anuluj</button>
              <button onClick={addTask} disabled={saving || !newTitle.trim()} className="btn-orange text-sm py-3">
                {saving ? '...' : 'Dodaj zadanie'}
              </button>
            </div>
          </div>
        )}

        {/* Private message modal (admin-only) */}
        {showPrivateMsg && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg p-4 space-y-3 animate-slide-up">
              <h3 className="text-sm font-bold text-purple-700 flex items-center gap-2">
                ✉️ Prywatna wiadomość — „Proszę o odpowiedź"
              </h3>
              <p className="text-[11px] text-gray-500">
                Tajne zadanie, widoczne tylko dla adresata i kierownictwa. Odpowiedź przyjdzie do chata w zadaniu.
              </p>
              <select
                value={pmAssign}
                onChange={e => setPmAssign(e.target.value)}
                className="input"
              >
                <option value="">Do kogo? (wybierz pracownika)</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.full_name}</option>
                ))}
              </select>
              <textarea
                value={pmText}
                onChange={e => setPmText(e.target.value)}
                placeholder="Treść wiadomości..."
                className="input"
                rows={4}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setShowPrivateMsg(false); setPmAssign(''); setPmText('') }} className="btn-white text-sm py-3">
                  Anuluj
                </button>
                <button
                  onClick={sendPrivateMessage}
                  disabled={saving || !pmAssign || !pmText.trim()}
                  className="bg-purple-500 text-white rounded-xl text-sm font-bold py-3 hover:bg-purple-600 disabled:opacity-50"
                >
                  {saving ? '...' : '✉️ Wyślij'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Problem report modal */}
        {problemTaskId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg p-4 space-y-3 animate-slide-up">
              <h3 className="text-sm font-bold text-red-600 flex items-center gap-2">
                ⚠️ Zgłoś problem
              </h3>
              <p className="text-xs text-gray-500">
                Opisz krótko co się stało — wiadomość trafi do managera i na Google Drive.
              </p>
              <textarea
                value={problemText}
                onChange={e => setProblemText(e.target.value)}
                placeholder="Co jest problemem?"
                className="input border-red-200 focus:border-red-400"
                rows={3}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setProblemTaskId(null)} className="btn-white text-sm py-3">Anuluj</button>
                <button
                  onClick={submitProblem}
                  disabled={saving || !problemText.trim()}
                  className="bg-red-500 text-white rounded-xl text-sm font-bold py-3 hover:bg-red-600 disabled:opacity-50"
                >
                  {saving ? '...' : 'Zgłoś problem'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat modal */}
        {openChatId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '70vh' }}>
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">💬 Chat</h3>
                  <p className="text-xs text-gray-400 truncate">
                    {tasks.find(t => t.id === openChatId)?.title}
                  </p>
                </div>
                <button onClick={() => setOpenChatId(null)} className="text-gray-400 hover:text-gray-600 text-lg p-1">✕</button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Brak wiadomości — napisz pierwszą</p>
                ) : (
                  chatMessages.map(msg => {
                    const isMe = msg.sender_id === user?.id
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                          isMe ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-900'
                        }`}>
                          {!isMe && <div className="text-[10px] font-bold mb-0.5 opacity-70">{msg.sender_name}</div>}
                          <div className="text-sm">{msg.message}</div>
                          <div className={`text-[10px] mt-0.5 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
                            {timeAgo(msg.created_at)}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Napisz wiadomość..."
                  className="input flex-1 text-sm"
                  autoFocus
                />
                <button
                  onClick={sendMessage}
                  disabled={sendingChat || !chatInput.trim()}
                  className="bg-brand-500 text-white px-4 rounded-xl text-sm font-bold hover:bg-brand-600 disabled:opacity-50"
                >
                  ➤
                </button>
              </div>
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
              const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.new
              const actions = getNextActions(task)

              return (
                <div key={task.id} className={`card border-2 ${
                  task.status === 'done' ? 'border-green-200 bg-green-50' :
                  task.status === 'problem' ? 'border-red-200 bg-red-50' :
                  'border-gray-100'
                }`}>
                  {/* Status badge */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sc.bg} ${sc.color}`}>
                        {sc.icon} {sc.label}
                      </span>
                      {task.is_private && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700" title="Tajne — widoczne tylko dla przypisanego, autora, Menagera i Właściciela">
                          🔒 Tajne
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400">{timeAgo(task.created_at)}</span>
                  </div>

                  {/* Task content */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${task.status === 'done' ? 'line-through text-green-800' : 'text-gray-900'}`}>
                        {task.title}
                      </div>
                      {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}

                      {/* Problem description */}
                      {task.status === 'problem' && task.problem_description && (
                        <div className="mt-2 p-2 bg-red-100 rounded-lg">
                          <p className="text-xs text-red-700">
                            <span className="font-bold">Problem:</span> {task.problem_description}
                          </p>
                        </div>
                      )}

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

                  {/* Action buttons */}
                  {(actions.primary || actions.secondary || actions.chat) && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      {actions.primary && (
                        <button
                          onClick={actions.primary.action}
                          className={`${actions.primary.color} text-white px-4 py-2 rounded-xl text-xs font-bold flex-1`}
                        >
                          {actions.primary.label}
                        </button>
                      )}
                      {actions.secondary && (
                        <button
                          onClick={actions.secondary.action}
                          className="bg-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-200"
                        >
                          {actions.secondary.label}
                        </button>
                      )}
                      {actions.chat && (
                        <button
                          onClick={() => openChat(task.id)}
                          className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-gray-200"
                        >
                          💬 Chat
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
