'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole } from '@/lib/roles'
import supabase from '@/lib/supabase'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { pl } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────
interface WokiMessage {
  id: string
  location_id: string
  sender_id: string
  receiver_id: string | null
  message_type: 'text' | 'voice'
  text_content: string | null
  audio_url: string | null
  audio_duration_sec: number | null
  transcription: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
  sender_name?: string
  receiver_name?: string
}

interface AdminUser {
  id: string
  full_name: string
  role: string
}

// ─── Component ──────────────────────────────────────────────
export default function WokiTalkiePage() {
  const { user, loading } = useUser()
  const isAdmin = user ? isAdminRole(user.role) : false

  // State
  const [messages, setMessages] = useState<WokiMessage[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Text message state
  const [textInput, setTextInput] = useState('')
  const [receiverId, setReceiverId] = useState<string>('')
  const [sending, setSending] = useState(false)

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Audio playback
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Scroll to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ─── Load data ────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!user) return
    setLoadingData(true)

    try {
      // Load admin users (owner + manager)
      const { data: adminData } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['owner', 'manager'])
        .eq('is_active', true)

      if (adminData) setAdmins(adminData)

      // Load messages (sent or received by me, or broadcast)
      const { data: msgData } = await supabase
        .from('woki_messages')
        .select('*')
        .eq('location_id', user.location_id)
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id},receiver_id.is.null`)
        .order('created_at', { ascending: true })
        .limit(200)

      if (msgData && adminData) {
        const enriched = msgData.map(m => ({
          ...m,
          sender_name: adminData.find(a => a.id === m.sender_id)?.full_name || '?',
          receiver_name: m.receiver_id
            ? adminData.find(a => a.id === m.receiver_id)?.full_name || '?'
            : 'Wszyscy',
        }))
        setMessages(enriched)

        // Mark unread messages as read
        const unread = enriched.filter(m =>
          !m.is_read &&
          m.sender_id !== user.id &&
          (m.receiver_id === user.id || m.receiver_id === null)
        )
        if (unread.length > 0) {
          await supabase
            .from('woki_messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .in('id', unread.map(m => m.id))
        }
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoadingData(false)
  }, [user])

  useEffect(() => { loadMessages() }, [loadMessages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-refresh every 15 sec
  useEffect(() => {
    const interval = setInterval(loadMessages, 15000)
    return () => clearInterval(interval)
  }, [loadMessages])

  // ─── Send text message ────────────────────────────────────
  async function sendTextMessage() {
    if (!user || !textInput.trim()) return
    setSending(true)
    setError('')

    const { error: err } = await supabase.from('woki_messages').insert({
      location_id: user.location_id,
      sender_id: user.id,
      receiver_id: receiverId || null,
      message_type: 'text',
      text_content: textInput.trim(),
    })

    if (err) {
      setError(err.message)
    } else {
      setTextInput('')
      loadMessages()
    }
    setSending(false)
  }

  // ─── Voice recording ─────────────────────────────────────
  async function startRecording() {
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
        setAudioPreviewUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      setAudioBlob(null)
      setAudioPreviewUrl(null)

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (e: any) {
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

  function cancelRecording() {
    stopRecording()
    setAudioBlob(null)
    setAudioPreviewUrl(null)
    setRecordingTime(0)
  }

  async function sendVoiceMessage() {
    if (!user || !audioBlob) return
    setSending(true)
    setError('')

    try {
      // Upload audio to Supabase Storage
      const fileName = `${user.id}_${Date.now()}.webm`
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('woki-talkie')
        .upload(fileName, audioBlob, {
          contentType: audioBlob.type,
          cacheControl: '3600',
        })

      if (uploadErr) throw new Error(uploadErr.message)

      // Get public/signed URL
      const { data: urlData } = supabase.storage
        .from('woki-talkie')
        .getPublicUrl(fileName)

      const audioUrl = urlData?.publicUrl || ''

      // Insert message
      const { error: insertErr } = await supabase.from('woki_messages').insert({
        location_id: user.location_id,
        sender_id: user.id,
        receiver_id: receiverId || null,
        message_type: 'voice',
        audio_url: audioUrl,
        audio_duration_sec: recordingTime,
        text_content: `Wiadomosc glosowa (${recordingTime}s)`,
      })

      if (insertErr) throw new Error(insertErr.message)

      setAudioBlob(null)
      setAudioPreviewUrl(null)
      setRecordingTime(0)
      setSuccess('Wiadomosc glosowa wyslana!')
      loadMessages()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError(e.message)
    }
    setSending(false)
  }

  // ─── Play audio ───────────────────────────────────────────
  function playAudio(messageId: string, url: string) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (playingId === messageId) {
      setPlayingId(null)
      return
    }

    const audio = new Audio(url)
    audioRef.current = audio
    setPlayingId(messageId)

    audio.onended = () => {
      setPlayingId(null)
      audioRef.current = null
    }
    audio.onerror = () => {
      setPlayingId(null)
      audioRef.current = null
      setError('Nie mozna odtworzyc nagrania')
    }
    audio.play()
  }

  // ─── Format time ─────────────────────────────────────────
  function formatMsgTime(dateStr: string): string {
    const date = parseISO(dateStr)
    if (isToday(date)) return format(date, 'HH:mm')
    if (isYesterday(date)) return `Wczoraj ${format(date, 'HH:mm')}`
    return format(date, 'd MMM HH:mm', { locale: pl })
  }

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ─── Date separator ──────────────────────────────────────
  function dateSeparator(dateStr: string): string {
    const date = parseISO(dateStr)
    if (isToday(date)) return 'Dzisiaj'
    if (isYesterday(date)) return 'Wczoraj'
    return format(date, 'EEEE, d MMMM', { locale: pl })
  }

  // ─── Render ───────────────────────────────────────────────
  if (loading || !user) return null

  // Only owner + manager can access
  if (!isAdmin) {
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

  // Other admins (for receiver picker)
  const otherAdmins = admins.filter(a => a.id !== user.id)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ maxHeight: '100dvh' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 flex items-center justify-between shadow-lg">
        <Link href="/" className="text-white/80 font-medium text-sm">← Powrot</Link>
        <div className="text-center">
          <h1 className="text-lg font-bold flex items-center gap-2">
            📻 WOKI TALKIE
          </h1>
          <p className="text-[10px] text-white/60 uppercase tracking-widest">Wlasciciel ↔ Menager</p>
        </div>
        <div className="w-16 text-right">
          {messages.filter(m => !m.is_read && m.sender_id !== user.id).length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {messages.filter(m => !m.is_read && m.sender_id !== user.id).length}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ paddingBottom: '180px' }}>
        {loadingData && messages.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500" />
          </div>
        )}

        {!loadingData && messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">📻</div>
            <p className="text-gray-400 text-sm">Brak wiadomosci</p>
            <p className="text-gray-300 text-xs mt-1">Napisz lub nagraj pierwsza wiadomosc!</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.sender_id === user.id
          const prevMsg = idx > 0 ? messages[idx - 1] : null
          const showDateSep = !prevMsg ||
            format(parseISO(msg.created_at), 'yyyy-MM-dd') !== format(parseISO(prevMsg.created_at), 'yyyy-MM-dd')

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {showDateSep && (
                <div className="flex items-center justify-center my-4">
                  <div className="bg-gray-200 text-gray-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase">
                    {dateSeparator(msg.created_at)}
                  </div>
                </div>
              )}

              {/* Message bubble */}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                  isMe
                    ? 'bg-indigo-500 text-white rounded-br-md'
                    : 'bg-white text-gray-900 rounded-bl-md border border-gray-100'
                }`}>
                  {/* Sender name (if not me) */}
                  {!isMe && (
                    <div className="text-[10px] font-bold text-indigo-600 mb-1">
                      {msg.sender_name}
                      {msg.receiver_id === null && (
                        <span className="text-gray-400 font-normal ml-1">→ Wszyscy</span>
                      )}
                    </div>
                  )}

                  {/* Receiver tag (if me and specific person) */}
                  {isMe && msg.receiver_id && (
                    <div className="text-[10px] text-white/60 mb-1">
                      Do: {msg.receiver_name}
                    </div>
                  )}

                  {/* Text content */}
                  {msg.message_type === 'text' && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.text_content}</p>
                  )}

                  {/* Voice message */}
                  {msg.message_type === 'voice' && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => msg.audio_url && playAudio(msg.id, msg.audio_url)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isMe
                            ? 'bg-white/20 hover:bg-white/30'
                            : 'bg-indigo-100 hover:bg-indigo-200'
                        }`}
                      >
                        <span className="text-lg">
                          {playingId === msg.id ? '⏸' : '▶️'}
                        </span>
                      </button>
                      <div>
                        <div className={`text-xs font-medium ${isMe ? 'text-white/80' : 'text-gray-500'}`}>
                          🎙 Wiadomosc glosowa
                        </div>
                        {msg.audio_duration_sec && (
                          <div className={`text-[10px] ${isMe ? 'text-white/50' : 'text-gray-400'}`}>
                            {formatDuration(msg.audio_duration_sec)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Transcription */}
                  {msg.transcription && (
                    <div className={`mt-2 pt-2 border-t text-xs italic ${
                      isMe ? 'border-white/20 text-white/70' : 'border-gray-100 text-gray-400'
                    }`}>
                      📝 {msg.transcription}
                    </div>
                  )}

                  {/* Time + read status */}
                  <div className={`text-[10px] mt-1 ${isMe ? 'text-white/50 text-right' : 'text-gray-400'}`}>
                    {formatMsgTime(msg.created_at)}
                    {isMe && (
                      <span className="ml-1">
                        {msg.is_read ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Error / Success */}
      {error && (
        <div className="mx-4 mb-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded-xl">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">✕</button>
        </div>
      )}
      {success && (
        <div className="mx-4 mb-2 bg-green-50 border border-green-200 text-green-700 text-xs p-2 rounded-xl">
          {success}
        </div>
      )}

      {/* Input area — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 space-y-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {/* Receiver picker */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-semibold uppercase">Do:</span>
          <button
            onClick={() => setReceiverId('')}
            className={`text-[11px] px-2 py-1 rounded-full font-medium transition-all ${
              receiverId === '' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            Wszyscy
          </button>
          {otherAdmins.map(a => (
            <button
              key={a.id}
              onClick={() => setReceiverId(a.id)}
              className={`text-[11px] px-2 py-1 rounded-full font-medium transition-all ${
                receiverId === a.id ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {a.full_name}
            </button>
          ))}
        </div>

        {/* Voice recording UI */}
        {isRecording && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <div className="flex-1">
              <div className="text-sm font-bold text-red-700">Nagrywanie...</div>
              <div className="text-xs text-red-500">{formatDuration(recordingTime)}</div>
            </div>
            <button
              onClick={stopRecording}
              className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-bold"
            >
              ⏹ Stop
            </button>
            <button
              onClick={cancelRecording}
              className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Audio preview (after recording, before sending) */}
        {audioPreviewUrl && !isRecording && (
          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
            <audio src={audioPreviewUrl} controls className="flex-1 h-8" />
            <div className="text-xs text-indigo-600 font-medium">{formatDuration(recordingTime)}</div>
            <button
              onClick={sendVoiceMessage}
              disabled={sending}
              className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {sending ? '...' : '📤 Wyslij'}
            </button>
            <button
              onClick={cancelRecording}
              className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Text input + mic button */}
        {!isRecording && !audioPreviewUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={startRecording}
              className="w-11 h-11 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all flex-shrink-0"
              title="Nagraj wiadomosc glosowa"
            >
              <span className="text-xl">🎙</span>
            </button>
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendTextMessage()}
              placeholder="Napisz wiadomosc..."
              className="flex-1 p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
            />
            <button
              onClick={sendTextMessage}
              disabled={!textInput.trim() || sending}
              className="w-11 h-11 rounded-full bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-600 disabled:opacity-30 transition-all flex-shrink-0"
            >
              <span className="text-lg">➤</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
