'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole, normalizeRole } from '@/lib/roles'
import supabase from '@/lib/supabase'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { pl } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────
interface Worker {
  id: string
  full_name: string
  role: string
  preferred_language: string
}

interface ExtractedTask {
  worker_name: string
  task_text_pl: string
  task_text_translated: string | null
  target_language: string | null
  is_broadcast: boolean
}

interface CommandEntry {
  id: string
  transcription: string
  tasks: ExtractedTask[]
  created_at: string
  status: 'sent' | 'pending'
}

type ViewMode = 'command' | 'history'

// ─── Component ──────────────────────────────────────────────
export default function WokiTalkiePage() {
  const { user, loading } = useUser()
  const isAdmin = user ? isAdminRole(user.role) : false
  const canUseWoki = user ? (isAdmin || normalizeRole(user.role) === 'kitchen') : false

  // View
  const [view, setView] = useState<ViewMode>('command')

  // Workers
  const [workers, setWorkers] = useState<Worker[]>([])

  // Recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Text mode
  const [textMode, setTextMode] = useState(false)
  const [textInput, setTextInput] = useState('')

  // Processing
  const [processing, setProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')

  // Task preview (after AI extraction)
  const [transcription, setTranscription] = useState('')
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([])
  const [showPreview, setShowPreview] = useState(false)

  // Sending
  const [sending, setSending] = useState(false)

  // History
  const [history, setHistory] = useState<CommandEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Feedback
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ─── Load workers ──────────────────────────────────────────
  const loadWorkers = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, preferred_language')
      .eq('location_id', user.location_id)
      .eq('is_active', true)
      .order('full_name')
    if (data) setWorkers(data)
  }, [user])

  // ─── Load history ─────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!user) return
    setLoadingHistory(true)
    const { data } = await supabase
      .from('woki_messages')
      .select('*')
      .eq('location_id', user.location_id)
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      const entries: CommandEntry[] = data.map(m => ({
        id: m.id,
        transcription: m.transcription || m.text_content || '',
        tasks: [], // history items — tasks already dispatched
        created_at: m.created_at,
        status: 'sent' as const,
      }))
      setHistory(entries)
    }
    setLoadingHistory(false)
  }, [user])

  useEffect(() => {
    loadWorkers()
    loadHistory()
  }, [loadWorkers, loadHistory])

  // ─── Voice recording ──────────────────────────────────────
  async function startRecording() {
    setError('')
    setSuccess('')
    setShowPreview(false)
    setTranscription('')
    setExtractedTasks([])

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        setAudioBlob(blob)
        stream.getTracks().forEach(t => t.stop())
        // Automatically process after recording stops
        processAudio(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      setAudioBlob(null)

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch {
      setError('Brak dostepu do mikrofonu. Zezwol w ustawieniach przegladarki.')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  function cancelAll() {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    setAudioBlob(null)
    setRecordingTime(0)
    setTranscription('')
    setExtractedTasks([])
    setShowPreview(false)
    setProcessing(false)
    setTextInput('')
    setError('')
    setSuccess('')
  }

  // ─── Process audio → Whisper + GPT ────────────────────────
  async function processAudio(blob: Blob) {
    setProcessing(true)
    setProcessingStep('Transkrypcja glosu...')
    setError('')

    try {
      const workerList = workers.map(w => ({
        name: w.full_name,
        language: w.preferred_language || 'pl'
      }))

      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      formData.append('workers', JSON.stringify(workerList))

      setProcessingStep('AI analizuje polecenia...')

      const res = await fetch('/api/woki-talkie/process', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Blad przetwarzania')

      setTranscription(data.transcription || '')
      setExtractedTasks(data.tasks || [])
      setShowPreview(true)
    } catch (e: any) {
      setError(e.message)
    }
    setProcessing(false)
    setProcessingStep('')
  }

  // ─── Process text → GPT ───────────────────────────────────
  async function processText() {
    if (!textInput.trim()) return
    setProcessing(true)
    setProcessingStep('AI analizuje polecenia...')
    setError('')

    try {
      const workerList = workers.map(w => ({
        name: w.full_name,
        language: w.preferred_language || 'pl'
      }))

      const res = await fetch('/api/woki-talkie/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textInput.trim(),
          workers: workerList,
        }),
      })

      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Blad przetwarzania')

      setTranscription(data.transcription || textInput.trim())
      setExtractedTasks(data.tasks || [])
      setShowPreview(true)
    } catch (e: any) {
      setError(e.message)
    }
    setProcessing(false)
    setProcessingStep('')
  }

  // ─── Confirm & dispatch tasks ─────────────────────────────
  async function dispatchTasks() {
    if (!user || extractedTasks.length === 0) return
    setSending(true)
    setError('')

    try {
      let dispatched = 0

      for (const task of extractedTasks) {
        // Find worker by name (case-insensitive partial match)
        const worker = workers.find(w =>
          w.full_name.toLowerCase().includes(task.worker_name.toLowerCase()) ||
          task.worker_name.toLowerCase().includes(w.full_name.toLowerCase())
        )

        if (task.is_broadcast) {
          // Broadcast — create task for each worker
          for (const w of workers) {
            const taskTitle = w.preferred_language !== 'pl' && task.task_text_translated
              ? task.task_text_translated
              : task.task_text_pl

            await supabase.from('worker_tasks').insert({
              location_id: user.location_id,
              title: taskTitle,
              description: task.task_text_pl !== taskTitle
                ? `🇵🇱 ${task.task_text_pl}`
                : null,
              assigned_to: w.id,
              created_by: user.id,
              status: 'new',
              is_private: false,
            })
            dispatched++
          }
        } else if (worker) {
          // Single worker task
          const taskTitle = worker.preferred_language !== 'pl' && task.task_text_translated
            ? task.task_text_translated
            : task.task_text_pl

          await supabase.from('worker_tasks').insert({
            location_id: user.location_id,
            title: taskTitle,
            description: task.task_text_pl !== taskTitle
              ? `🇵🇱 ${task.task_text_pl}`
              : null,
            assigned_to: worker.id,
            created_by: user.id,
            status: 'new',
            is_private: false,
          })
          dispatched++
        }
      }

      // Save audio to Storage + log the command in woki_messages
      let audioUrl: string | null = null
      if (audioBlob) {
        const fileName = `${user.id}_${Date.now()}.webm`
        const { error: uploadErr } = await supabase.storage
          .from('woki-talkie')
          .upload(fileName, audioBlob, {
            contentType: audioBlob.type,
            cacheControl: '3600',
          })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from('woki-talkie')
            .getPublicUrl(fileName)
          audioUrl = urlData?.publicUrl || null
        }
      }

      // Log command as woki_message
      await supabase.from('woki_messages').insert({
        location_id: user.location_id,
        sender_id: user.id,
        receiver_id: null,
        message_type: audioBlob ? 'voice' : 'text',
        text_content: transcription,
        audio_url: audioUrl,
        audio_duration_sec: audioBlob ? recordingTime : null,
        transcription: transcription,
      })

      setSuccess(`Wyslano ${dispatched} ${dispatched === 1 ? 'zadanie' : dispatched < 5 ? 'zadania' : 'zadan'}!`)
      setShowPreview(false)
      setTranscription('')
      setExtractedTasks([])
      setAudioBlob(null)
      setRecordingTime(0)
      setTextInput('')
      loadHistory()

      setTimeout(() => setSuccess(''), 4000)
    } catch (e: any) {
      setError(e.message)
    }
    setSending(false)
  }

  // ─── Remove a task from preview ───────────────────────────
  function removeTask(index: number) {
    setExtractedTasks(prev => prev.filter((_, i) => i !== index))
  }

  // ─── Format helpers ───────────────────────────────────────
  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function formatHistoryTime(dateStr: string): string {
    const date = parseISO(dateStr)
    if (isToday(date)) return `Dzis ${format(date, 'HH:mm')}`
    if (isYesterday(date)) return `Wczoraj ${format(date, 'HH:mm')}`
    return format(date, 'd MMM HH:mm', { locale: pl })
  }

  function langFlag(lang: string | null): string {
    switch (lang) {
      case 'uk': return '🇺🇦'
      case 'en': return '🇬🇧'
      case 'de': return '🇩🇪'
      case 'ru': return '🇷🇺'
      default: return '🇵🇱'
    }
  }

  // ─── Render ───────────────────────────────────────────────
  if (loading || !user) return null

  if (!canUseWoki) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="font-bold text-lg">Brak dostepu</h2>
          <p className="text-sm text-gray-500 mt-1">WOKI TALKIE jest dostepny tylko dla Wlasciciela i Menagera.</p>
          <Link href="/" className="mt-4 inline-block text-brand-600 font-medium text-sm">← Powrot</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-700 p-4 flex items-center justify-between shadow-lg">
        <Link href="/" className="text-white/70 font-medium text-sm">← Powrot</Link>
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-tight">
            📻 WOKI TALKIE
          </h1>
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em]">AI Command Center</p>
        </div>
        <div className="w-16" />
      </div>

      {/* ─── Tab switcher ───────────────────────────────────── */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setView('command')}
          className={`flex-1 py-3 text-sm font-semibold text-center transition-all ${
            view === 'command'
              ? 'text-indigo-400 border-b-2 border-indigo-400'
              : 'text-gray-500'
          }`}
        >
          🎙 Polecenie
        </button>
        <button
          onClick={() => { setView('history'); loadHistory() }}
          className={`flex-1 py-3 text-sm font-semibold text-center transition-all ${
            view === 'history'
              ? 'text-indigo-400 border-b-2 border-indigo-400'
              : 'text-gray-500'
          }`}
        >
          📋 Historia
        </button>
      </div>

      {/* ─── Error / Success ────────────────────────────────── */}
      {error && (
        <div className="mx-4 mt-3 bg-red-900/50 border border-red-700 text-red-300 text-xs p-3 rounded-xl flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 font-bold text-red-400">✕</button>
        </div>
      )}
      {success && (
        <div className="mx-4 mt-3 bg-green-900/50 border border-green-700 text-green-300 text-sm p-3 rounded-xl font-semibold text-center">
          {success}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
           COMMAND VIEW
         ═══════════════════════════════════════════════════════ */}
      {view === 'command' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6">

          {/* ─── Processing spinner ───────────────────────────── */}
          {processing && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 animate-spin" />
              <p className="text-indigo-300 text-sm font-medium animate-pulse">{processingStep}</p>
            </div>
          )}

          {/* ─── Task preview (after AI processing) ──────────── */}
          {showPreview && !processing && (
            <div className="w-full max-w-lg space-y-4">
              {/* Transcription */}
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-semibold">Transkrypcja</div>
                <p className="text-sm text-gray-200 italic">&ldquo;{transcription}&rdquo;</p>
              </div>

              {/* Extracted tasks */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold px-1">
                  Wyodrebnione zadania ({extractedTasks.length})
                </div>
                {extractedTasks.length === 0 && (
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 text-center text-gray-500 text-sm">
                    AI nie rozpoznalo zadan. Sprobuj ponownie.
                  </div>
                )}
                {extractedTasks.map((task, idx) => {
                  const worker = workers.find(w =>
                    w.full_name.toLowerCase().includes(task.worker_name.toLowerCase())
                  )
                  return (
                    <div key={idx} className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          {/* Worker name */}
                          <div className="flex items-center gap-2 mb-2">
                            {task.is_broadcast ? (
                              <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full font-semibold">
                                📢 Wszyscy
                              </span>
                            ) : (
                              <span className="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full font-semibold">
                                👤 {task.worker_name}
                                {worker && (
                                  <span className="ml-1 opacity-60">({worker.role})</span>
                                )}
                              </span>
                            )}
                            {task.target_language && task.target_language !== 'pl' && (
                              <span className="text-xs">
                                {langFlag(task.target_language)}
                              </span>
                            )}
                          </div>

                          {/* Task text PL */}
                          <p className="text-sm text-gray-200 font-medium">
                            🇵🇱 {task.task_text_pl}
                          </p>

                          {/* Translated text */}
                          {task.task_text_translated && task.target_language !== 'pl' && (
                            <p className="text-sm text-gray-400 mt-1">
                              {langFlag(task.target_language)} {task.task_text_translated}
                            </p>
                          )}
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => removeTask(idx)}
                          className="text-gray-600 hover:text-red-400 transition-colors p-1"
                          title="Usun zadanie"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Confirm / Cancel buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={cancelAll}
                  className="flex-1 py-3 bg-gray-800 text-gray-400 rounded-2xl text-sm font-semibold hover:bg-gray-700 transition-all"
                >
                  Anuluj
                </button>
                <button
                  onClick={dispatchTasks}
                  disabled={sending || extractedTasks.length === 0}
                  className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl text-sm font-bold hover:from-green-500 hover:to-emerald-500 disabled:opacity-40 transition-all"
                >
                  {sending ? 'Wysylam...' : `Wyslij ${extractedTasks.length} ${extractedTasks.length === 1 ? 'zadanie' : 'zadania'}`}
                </button>
              </div>
            </div>
          )}

          {/* ─── Main mic button (idle state) ────────────────── */}
          {!showPreview && !processing && !isRecording && (
            <div className="flex flex-col items-center gap-6">
              {/* Workers online count */}
              <div className="text-xs text-gray-600">
                {workers.length} {workers.length === 1 ? 'pracownik' : 'pracownikow'} w systemie
              </div>

              {/* Big mic button */}
              <button
                onClick={startRecording}
                className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.3)] hover:shadow-[0_0_80px_rgba(99,102,241,0.5)] hover:scale-105 active:scale-95 transition-all"
              >
                <span className="text-5xl">🎙</span>
              </button>

              <div className="text-center">
                <p className="text-gray-400 text-sm font-medium">Nacisnij i mow</p>
                <p className="text-gray-600 text-xs mt-1">AI rozpozna zadania i przypisze je pracownikom</p>
              </div>

              {/* Text mode toggle */}
              <div className="w-full max-w-md">
                <button
                  onClick={() => setTextMode(!textMode)}
                  className="text-xs text-gray-500 hover:text-gray-400 transition-colors w-full text-center mb-3"
                >
                  {textMode ? '🎙 Przelacz na glos' : '⌨️ Wpisz tekstem'}
                </button>

                {textMode && (
                  <div className="space-y-2">
                    <textarea
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      placeholder="Np. Piotr przygotuj liste pod food cost sajgonek, a Yurii przeslij zamowienie do Kuchni Swiata..."
                      className="w-full p-4 bg-gray-900 border border-gray-700 rounded-2xl text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none placeholder-gray-600"
                      rows={3}
                    />
                    <button
                      onClick={processText}
                      disabled={!textInput.trim()}
                      className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl text-sm font-bold hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 transition-all"
                    >
                      Analizuj polecenie
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Recording state ─────────────────────────────── */}
          {isRecording && (
            <div className="flex flex-col items-center gap-6">
              {/* Pulsing ring */}
              <div className="relative">
                <div className="absolute inset-0 w-32 h-32 rounded-full bg-red-500/20 animate-ping" />
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-[0_0_60px_rgba(239,68,68,0.4)] relative z-10">
                  <span className="text-5xl">🎙</span>
                </div>
              </div>

              {/* Timer */}
              <div className="text-center">
                <div className="text-3xl font-mono font-bold text-red-400 tabular-nums">{formatDuration(recordingTime)}</div>
                <p className="text-red-400/60 text-xs mt-1 animate-pulse">Nagrywanie...</p>
              </div>

              {/* Controls */}
              <div className="flex gap-4">
                <button
                  onClick={cancelAll}
                  className="px-6 py-3 bg-gray-800 text-gray-400 rounded-2xl text-sm font-semibold hover:bg-gray-700 transition-all"
                >
                  ✕ Anuluj
                </button>
                <button
                  onClick={stopRecording}
                  className="px-8 py-3 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-500 transition-all"
                >
                  ⏹ Zakoncz
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
           HISTORY VIEW
         ═══════════════════════════════════════════════════════ */}
      {view === 'history' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingHistory && history.length === 0 && (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-400" />
            </div>
          )}

          {!loadingHistory && history.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3 opacity-30">📋</div>
              <p className="text-gray-500 text-sm">Brak historii polecen</p>
              <p className="text-gray-600 text-xs mt-1">Nagraj pierwsze polecenie glosowe!</p>
            </div>
          )}

          {history.map(entry => (
            <div key={entry.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">
                    {entry.transcription || 'Polecenie glosowe'}
                  </p>
                </div>
                <div className="text-[10px] text-gray-600 whitespace-nowrap flex-shrink-0">
                  {formatHistoryTime(entry.created_at)}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full font-semibold">
                  Wyslano
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
