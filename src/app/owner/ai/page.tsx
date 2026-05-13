'use client'
import { useState, useRef, useEffect } from 'react'
import { useUser } from '@/lib/useUser'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

const SUGGESTED_QUESTIONS = [
  'Jaki byl przychod w ostatnim tygodniu?',
  'Ktore danie sprzedaje sie najlepiej?',
  'Ile wynosi food cost w tym miesiacu?',
  'Kto pracowal najwiecej godzin?',
  'Jakie sa stany magazynowe?',
  'Porownaj sprzedaz tego tygodnia z poprzednim',
]

export default function AiAssistantPage() {
  const { user } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/owner/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          locationId: user?.location_id,
          userId: user?.id,
        }),
      })

      const data = await res.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.response || data.error || 'Nie udalo sie przetworzyc pytania.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Blad polaczenia. Sprobuj ponownie.',
        timestamp: new Date(),
      }])
    }

    setLoading(false)
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <h1 className="text-white font-bold">AI Asystent</h1>
            <p className="text-gray-500 text-xs">Podlaczony do danych {user?.location_name}</p>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-white text-lg font-bold mb-2">Czesc, {user?.full_name?.split(' ')[0]}!</h2>
            <p className="text-gray-500 text-sm mb-8 text-center max-w-md">
              Jestem Twoim asystentem restauracji. Mam dostep do sprzedazy, food costu, magazynu, grafiku i zadan. Pytaj o cokolwiek!
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left p-3 bg-gray-900 border border-gray-800 rounded-xl text-gray-400 text-xs hover:border-indigo-500/50 hover:text-indigo-400 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-5 py-3 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-900 border border-gray-800 text-gray-300'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-indigo-300' : 'text-gray-600'}`}>
                  {msg.timestamp.toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 border-t border-gray-800">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Zapytaj o sprzedaz, food cost, zespol..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-5 py-3 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Wyslij
          </button>
        </div>
      </div>
    </div>
  )
}
