import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

export async function POST(req: Request) {
  try {
    const { message, locationId } = await req.json()

    if (!message || !locationId) {
      return NextResponse.json({ error: 'Missing message or locationId' }, { status: 400 })
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI nie skonfigurowany — dodaj OPENAI_API_KEY w Vercel' }, { status: 500 })
    }

    // ─── Gather context data ───────────────────────────
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const monthStart = today.slice(0, 7) + '-01'

    // 1. Recent tasks
    const { data: tasks } = await supabase
      .from('worker_tasks')
      .select('title, assigned_to_name, is_completed, created_at')
      .eq('location_id', locationId)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(20)

    // 2. Today's checklist
    const { data: checklists } = await supabase
      .from('checklist_logs')
      .select('shift, completed_by_name, created_at')
      .eq('location_id', locationId)
      .gte('created_at', today)

    // 3. Temperature logs
    const { data: temps } = await supabase
      .from('temperature_logs')
      .select('device_name, temperature, recorded_by_name, created_at')
      .eq('location_id', locationId)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(20)

    // 4. Worker meals this month
    const { data: meals } = await supabase
      .from('worker_meals')
      .select('menu_number, menu_description, meal_date')
      .eq('location_id', locationId)
      .gte('meal_date', monthStart)

    // 5. Profiles (staff)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('full_name, role, is_active')
      .eq('is_active', true)

    // 6. Sales from GoPOS (try, may fail)
    let salesData = 'Brak danych GoPOS'
    try {
      const salesRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(req.url).origin : 'http://localhost:3000'}/api/gopos?action=sales_by_item&date_start=${weekAgo}&date_end=${today}`,
        { headers: { 'Content-Type': 'application/json' } }
      )
      if (salesRes.ok) {
        const sJson = await salesRes.json()
        const items = sJson.data?.items || []
        if (items.length > 0) {
          const top10 = items
            .sort((a: any, b: any) => (b.quantity || 0) - (a.quantity || 0))
            .slice(0, 10)
            .map((it: any) => `${it.name}: ${it.quantity || 0} szt`)
          salesData = `Top 10 dania (ostatnie 7 dni): ${top10.join(', ')}`

          // food cost calculation
          let totalCost = 0
          let totalRevenue = 0
          for (const item of items) {
            const recipe = DEFAULT_RECIPES.find(r => r.name === item.name)
            if (recipe) {
              const portionCost = recipe.lines.reduce((s: number, l) => s + l.pricePerKg * l.quantity, 0)
              totalCost += portionCost * (item.quantity || 0)
              totalRevenue += recipe.sellingPrice * (item.quantity || 0)
            }
          }
          if (totalRevenue > 0) {
            salesData += `\nFood Cost: ${Math.round(totalCost)} zl / Przychod: ${Math.round(totalRevenue)} zl = ${Math.round((totalCost / totalRevenue) * 100)}%`
          }
        }
      }
    } catch {}

    // 7. Meal deductions
    const { data: deductions } = await supabase
      .from('meal_deductions')
      .select('ingredient_name, quantity_kg')
      .eq('location_id', locationId)
      .gte('created_at', weekAgo)

    const deductionSummary = deductions && deductions.length > 0
      ? deductions.reduce((acc: Record<string, number>, d) => {
          acc[d.ingredient_name] = (acc[d.ingredient_name] || 0) + d.quantity_kg
          return acc
        }, {} as Record<string, number>)
      : null

    // ─── Build context for AI ──────────────────────────
    const context = `
DANE RESTAURACJI (aktualne):

SPRZEDAZ:
${salesData}

ZADANIA (ostatni tydzien):
${tasks?.map(t => `- ${t.title} [${t.is_completed ? 'DONE' : 'TODO'}] → ${t.assigned_to_name || '?'}`).join('\n') || 'Brak zadan'}

CHECKLISTA DZIS:
${checklists?.length ? `Wykonane: ${checklists.length} checkow` : 'Brak checkow dzis'}

TEMPERATURY:
${temps?.slice(0, 5).map(t => `${t.device_name}: ${t.temperature}°C (${t.recorded_by_name})`).join(', ') || 'Brak pomiarow'}

ZESPOL:
${profiles?.map(p => `${p.full_name} (${p.role})`).join(', ') || 'Brak danych'}

POSILKI PRACOWNICZE (ten miesiac):
${meals?.length || 0} posilkow

ZUZYCIE SKLADNIKOW Z POSILKOW (tydzien):
${deductionSummary ? Object.entries(deductionSummary).map(([k, v]) => `${k}: ${Math.round(v as number * 1000)}g`).join(', ') : 'Brak'}
`.trim()

    // ─── Call OpenAI ───────────────────────────────────
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Jestes asystentem AI restauracji. Odpowiadasz KROTKO i KONKRETNIE po polsku.
Masz dostep do danych sprzedazy, food costu, zadan, checklisty, temperatur, posilkow pracowniczych i zespolu.
Uzywaj danych ponizej do odpowiedzi. Jesli nie masz danych, powiedz o tym.
Podawaj liczby i procenty. Nie zmyslaj danych.
Formatuj odpowiedz czytelnie, uzywaj emoji do podkreslenia.

${context}`
          },
          { role: 'user', content: message }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      return NextResponse.json({ error: `AI error: ${aiRes.status}` }, { status: 500 })
    }

    const aiData = await aiRes.json()
    const response = aiData.choices?.[0]?.message?.content || 'Brak odpowiedzi'

    return NextResponse.json({ response })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
