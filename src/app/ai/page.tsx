'use client'
import { useState, useRef, useEffect } from 'react'
import { useUser } from '@/lib/useUser'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTIONS = [
  'Jaki mamy food cost?',
  'Podaj sklad Tokio',
  'Co sie najlepiej sprzedaje?',
  'Ile godzin przepracowal zespol?',
  'Jakie sa otwarte zadania?',
  'Podsumuj dzisiejszy dzien',
]

export default function MobileAIPage() {
  const { user } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || !user || loading) return

    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/owner/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), locationId: user.location_id }),
      })

      const data = await res.json()
      const aiMsg: Message = {
        role: 'assistant',
        content: data.response || data.error || 'Brak odpowiedzi',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMsg])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Blad polaczenia — sprobuj ponownie',
        timestamp: new Date(),
      }])
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-4 text-white">
        <div className="flex items-center gap-3">
          <a href="/" className="text-white/80 text-lg">&larr;</a>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm">🤖</div>
          <div>
            <h1 className="font-bold text-sm">AI Asystent</h1>
            <p className="text-white/60 text-[10px]">{user?.location_name} — wszystkie dane</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-gray-800 font-bold text-sm mb-1">Zapytaj o cokolwiek</h2>
            <p className="text-gray-400 text-xs mb-6">Znam sprzedaz, receptury, godziny pracy, faktury, zadania i wiecej</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-left px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md'
            }`}>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <p className={`text-[9px] mt-1 ${msg.role === 'user' ? 'text-white/50' : 'text-gray-400'}`}>
                {msg.timestamp.toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            placeholder="Zapytaj o restauracje..."
            className="flex-1 bg-gray-100 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-indigo-500 transition-all"
          >
            Wyslij
          </button>
        </div>
      </div>
    </div>
  )
}
