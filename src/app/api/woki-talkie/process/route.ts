import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// WOKI TALKIE — AI Voice Command Pipeline
// 1. Whisper: audio → transkrypcja (polski)
// 2. GPT: transkrypcja → wyodrębnione zadania + osoby
// 3. Tłumaczenie zadań na język pracownika
// ============================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

interface ExtractedTask {
  worker_name: string
  task_text_pl: string
  task_text_translated: string | null
  target_language: string | null
  is_broadcast: boolean
}

interface ProcessResult {
  transcription: string
  tasks: ExtractedTask[]
}

// ─── Step 1: Whisper transcription ─────────────────────────
async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const formData = new FormData()

  // Determine file extension from mime type
  const ext = mimeType.includes('webm') ? 'webm'
    : mimeType.includes('mp4') ? 'mp4'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mpeg') ? 'mp3'
    : 'webm'

  const blob = new Blob([audioBuffer], { type: mimeType })
  formData.append('file', blob, `audio.${ext}`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'pl')
  formData.append('response_format', 'text')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper error: ${err}`)
  }

  const text = await res.text()
  return text.trim()
}

// ─── Step 2: GPT task extraction ───────────────────────────
async function extractTasks(
  transcription: string,
  workers: { name: string; language: string }[],
  locationName: string = 'restauracja'
): Promise<ExtractedTask[]> {

  const workerList = workers.map(w => `- ${w.name} (język: ${w.language})`).join('\n')

  const systemPrompt = `Jesteś asystentem restauracji ${locationName}. Analizujesz transkrypcję nagrania głosowego właściciela i wyodrębniasz z niej zadania dla pracowników.

Lista pracowników:
${workerList}

ZASADY:
1. Rozpoznaj imiona pracowników w tekście (mogą być w formie zdrobniałej: Kasia=Katarzyna, Jurek=Yurii, itp.)
2. Dla każdego wymienionego pracownika wyodrębnij KONKRETNE zadanie
3. Jeśli tekst zaczyna się od "wszyscy" lub nie wymienia konkretnej osoby — oznacz jako broadcast
4. Przetłumacz zadanie na język pracownika (jeśli inny niż polski)
5. Zachowaj naturalny ton — to polecenia szefa do pracowników

Odpowiedz TYLKO w formacie JSON (bez markdown, bez komentarzy):
{
  "tasks": [
    {
      "worker_name": "Piotr",
      "task_text_pl": "Przygotuj listę pod food cost sajgonek",
      "task_text_translated": null,
      "target_language": "pl",
      "is_broadcast": false
    }
  ]
}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Transkrypcja nagrania:\n\n"${transcription}"` },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GPT error: ${err}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || '{}'

  // Parse JSON from response (handle potential markdown wrapping)
  let cleaned = content.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  try {
    const parsed = JSON.parse(cleaned)
    return parsed.tasks || []
  } catch {
    console.error('Failed to parse GPT response:', cleaned)
    return []
  }
}

// ─── Main handler ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'OPENAI_API_KEY nie skonfigurowany' },
        { status: 500 }
      )
    }

    const contentType = req.headers.get('content-type') || ''

    let transcription: string
    let workers: { name: string; language: string }[] = []
    let locationName: string = 'restauracja'

    if (contentType.includes('multipart/form-data')) {
      // Voice message — transcribe first
      const formData = await req.formData()
      const audioFile = formData.get('audio') as File | null
      const workersJson = formData.get('workers') as string | null
      const manualText = formData.get('text') as string | null
      locationName = (formData.get('location_name') as string) || 'restauracja'

      if (manualText) {
        // Text mode — skip Whisper
        transcription = manualText
      } else if (audioFile) {
        const buffer = Buffer.from(await audioFile.arrayBuffer())
        transcription = await transcribeAudio(buffer, audioFile.type)
      } else {
        return NextResponse.json(
          { ok: false, error: 'Brak audio lub tekstu' },
          { status: 400 }
        )
      }

      if (workersJson) {
        try { workers = JSON.parse(workersJson) } catch {}
      }
    } else {
      // JSON body (text mode)
      const body = await req.json()
      transcription = body.text || ''
      workers = body.workers || []
      locationName = body.location_name || 'restauracja'

      if (!transcription) {
        return NextResponse.json(
          { ok: false, error: 'Brak tekstu' },
          { status: 400 }
        )
      }
    }

    // Extract tasks using GPT
    const tasks = await extractTasks(transcription, workers, locationName)

    const result: ProcessResult = {
      transcription,
      tasks,
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('WOKI TALKIE process error:', e.message)
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    )
  }
}
