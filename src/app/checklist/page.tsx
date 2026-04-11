'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { normalizeRole, isAdminRole } from '@/lib/roles'
import supabase from '@/lib/supabase'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

interface ChecklistItem {
  id: string
  title: string
  sort_order: number
}

interface ChecklistEntry {
  item_id: string
  is_completed: boolean
}

type ChecklistType = 'opening' | 'during_day' | 'closing' | 'weekly'

const TYPES: { key: ChecklistType; label: string; icon: string; color: string; bgColor: string }[] = [
  { key: 'opening',    label: 'Otwarcie',     icon: '🌅', color: 'text-amber-700',  bgColor: 'bg-amber-50 border-amber-200' },
  { key: 'during_day', label: 'W ciągu dnia', icon: '☀️', color: 'text-blue-700',   bgColor: 'bg-blue-50 border-blue-200' },
  { key: 'closing',    label: 'Zamknięcie',   icon: '🌙', color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200' },
  { key: 'weekly',     label: 'Raz w tygodniu', icon: '📅', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
]

export default function ChecklistPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [activeType, setActiveType] = useState<ChecklistType>('opening')
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [entries, setEntries] = useState<Record<string, boolean>>({})
  const [logId, setLogId] = useState<string | null>(null)
  const [loadingItems, setLoadingItems] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [completionStats, setCompletionStats] = useState<Record<ChecklistType, { done: number; total: number }>>({
    opening: { done: 0, total: 0 },
    during_day: { done: 0, total: 0 },
    closing: { done: 0, total: 0 },
    weekly: { done: 0, total: 0 },
  })

  const role = user ? normalizeRole(user.role) : 'kitchen'
  // Determine department based on role
  const department = (role === 'hall') ? 'hall' : 'kitchen'
  // Admin/manager/owner see both — default to kitchen, can switch
  const isAdmin = user ? isAdminRole(user.role) : false
  const [viewDept, setViewDept] = useState<'kitchen' | 'hall'>(department)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (!user) return
    // Set initial department based on role
    if (role === 'hall') setViewDept('hall')
    else if (role === 'kitchen') setViewDept('kitchen')
  }, [user])

  // Load completion stats for all types
  useEffect(() => {
    if (!user) return
    loadAllStats()
  }, [user, viewDept])

  // Load items when type or department changes
  useEffect(() => {
    if (!user) return
    loadChecklist()
  }, [user, activeType, viewDept])

  async function loadAllStats() {
    const stats: Record<ChecklistType, { done: number; total: number }> = {
      opening: { done: 0, total: 0 },
      during_day: { done: 0, total: 0 },
      closing: { done: 0, total: 0 },
      weekly: { done: 0, total: 0 },
    }

    for (const t of TYPES) {
      // Count total items
      const { count: total } = await supabase
        .from('checklist_items')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', user!.location_id)
        .eq('department', viewDept)
        .eq('checklist_type', t.key)
        .eq('is_active', true)

      // Check today's log
      const { data: log } = await supabase
        .from('checklist_logs')
        .select('id, all_done')
        .eq('location_id', user!.location_id)
        .eq('department', viewDept)
        .eq('checklist_type', t.key)
        .eq('log_date', today)
        .limit(1)

      let done = 0
      if (log && log.length > 0) {
        const { count: doneCount } = await supabase
          .from('checklist_entries')
          .select('*', { count: 'exact', head: true })
          .eq('log_id', log[0].id)
          .eq('is_completed', true)
        done = doneCount || 0
      }

      stats[t.key] = { done, total: total || 0 }
    }

    setCompletionStats(stats)
  }

  async function loadChecklist() {
    setLoadingItems(true)
    setSaved(false)

    // Load items
    const { data: itemsData } = await supabase
      .from('checklist_items')
      .select('id, title, sort_order')
      .eq('location_id', user!.location_id)
      .eq('department', viewDept)
      .eq('checklist_type', activeType)
      .eq('is_active', true)
      .order('sort_order')

    setItems(itemsData || [])

    // Load or create today's log
    const { data: existingLog } = await supabase
      .from('checklist_logs')
      .select('id')
      .eq('location_id', user!.location_id)
      .eq('department', viewDept)
      .eq('checklist_type', activeType)
      .eq('log_date', today)
      .limit(1)

    let currentLogId: string

    if (existingLog && existingLog.length > 0) {
      currentLogId = existingLog[0].id
    } else {
      const { data: newLog } = await supabase
        .from('checklist_logs')
        .insert({
          location_id: user!.location_id,
          department: viewDept,
          checklist_type: activeType,
          log_date: today,
          completed_by: user!.id,
        })
        .select('id')
        .single()
      currentLogId = newLog?.id || ''

      // Create entries for all items
      if (currentLogId && itemsData) {
        const entriesToInsert = itemsData.map(item => ({
          log_id: currentLogId,
          item_id: item.id,
          is_completed: false,
        }))
        if (entriesToInsert.length > 0) {
          await supabase.from('checklist_entries').insert(entriesToInsert)
        }
      }
    }

    setLogId(currentLogId)

    // Load entries
    const { data: entriesData } = await supabase
      .from('checklist_entries')
      .select('item_id, is_completed')
      .eq('log_id', currentLogId)

    const entryMap: Record<string, boolean> = {}
    if (entriesData) {
      for (const e of entriesData) {
        entryMap[e.item_id] = e.is_completed
      }
    }
    setEntries(entryMap)
    setLoadingItems(false)
  }

  async function toggleItem(itemId: string) {
    if (!logId) return
    const newValue = !entries[itemId]
    setEntries(prev => ({ ...prev, [itemId]: newValue }))

    await supabase
      .from('checklist_entries')
      .update({
        is_completed: newValue,
        completed_by: newValue ? user!.id : null,
        completed_at: newValue ? new Date().toISOString() : null,
      })
      .eq('log_id', logId)
      .eq('item_id', itemId)
  }

  async function handleSubmit() {
    if (!logId) return
    setSaving(true)

    const allDone = items.every(item => entries[item.id])

    // Update log
    await supabase
      .from('checklist_logs')
      .update({
        all_done: allDone,
        completed_by: user!.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logId)

    // If NOT all done → create tasks for uncompleted items
    if (!allDone) {
      const uncompleted = items.filter(item => !entries[item.id])
      for (const item of uncompleted) {
        // Check if task already exists for today
        const { data: existing } = await supabase
          .from('worker_tasks')
          .select('id')
          .eq('location_id', user!.location_id)
          .eq('title', `⚠️ Checklist: ${item.title}`)
          .eq('due_date', today)
          .limit(1)

        if (!existing || existing.length === 0) {
          await supabase.from('worker_tasks').insert({
            location_id: user!.location_id,
            title: `⚠️ Checklist: ${item.title}`,
            description: `Niewykonane zadanie z checklisty "${TYPES.find(t => t.key === activeType)?.label}" (${viewDept === 'hall' ? 'Sala' : 'Kuchnia'})`,
            created_by: user!.id,
            due_date: today,
            is_completed: false,
          })
        }
      }
    }

    await loadAllStats()
    setSaving(false)
    setSaved(true)
  }

  if (loading || !user) return null

  const doneCount = items.filter(i => entries[i.id]).length
  const totalCount = items.length
  const allDone = doneCount === totalCount && totalCount > 0
  const activeTypeConfig = TYPES.find(t => t.key === activeType)!

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-900">
            ← Wróć
          </button>
          <p className="text-xs text-gray-400">{user.location_name}</p>
        </div>

        <div className="text-center py-1">
          <h1 className="text-2xl font-bold text-gray-900">✅ Checklist</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale: pl })}
          </p>
        </div>

        {/* Department switch (admin/manager/owner only) */}
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewDept('kitchen')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${
                viewDept === 'kitchen' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              🍳 Kuchnia
            </button>
            <button
              onClick={() => setViewDept('hall')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${
                viewDept === 'hall' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              🍽️ Sala
            </button>
          </div>
        )}

        {/* Type selector with progress */}
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(t => {
            const stat = completionStats[t.key]
            const isComplete = stat.total > 0 && stat.done === stat.total
            const hasProgress = stat.done > 0 && stat.done < stat.total
            return (
              <button
                key={t.key}
                onClick={() => setActiveType(t.key)}
                className={`p-3 rounded-xl border-2 text-center transition-all ${
                  activeType === t.key
                    ? `${t.bgColor} shadow-md scale-[1.02]`
                    : isComplete
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">{isComplete ? '✅' : t.icon}</span>
                <div className={`text-xs font-bold mt-1 ${activeType === t.key ? t.color : 'text-gray-600'}`}>
                  {t.label}
                </div>
                {stat.total > 0 && (
                  <div className={`text-[10px] mt-0.5 ${isComplete ? 'text-green-600' : hasProgress ? 'text-amber-600' : 'text-gray-400'}`}>
                    {stat.done}/{stat.total}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{activeTypeConfig.icon} {activeTypeConfig.label}</span>
              <span className={allDone ? 'text-green-600 font-bold' : ''}>
                {doneCount}/{totalCount} {allDone && '✓ Gotowe!'}
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-brand-500'}`}
                style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Items */}
        {loadingItems ? (
          <div className="text-center py-8">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">Brak zadań na liście.</p>
            <p className="text-gray-400 text-xs mt-1">Menager lub Owner może dodać zadania w ustawieniach.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full card border-2 flex items-center gap-3 transition-all active:scale-98 ${
                  entries[item.id]
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  entries[item.id]
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-gray-300'
                }`}>
                  {entries[item.id] && <span className="text-sm">✓</span>}
                </div>
                <span className={`text-sm text-left flex-1 ${entries[item.id] ? 'text-green-700 line-through' : 'text-gray-800'}`}>
                  {item.title}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Submit button */}
        {items.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={saving || doneCount === 0}
            className={`w-full rounded-xl font-bold py-3.5 transition ${
              allDone
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : doneCount > 0
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving
              ? '⏳ Zapisuję...'
              : saved
                ? allDone ? '✅ Zapisano — wszystko gotowe!' : '⚠️ Zapisano — brakujące wpadły do zadań'
                : allDone
                  ? '✅ Potwierdź — wszystko gotowe!'
                  : `💾 Zapisz (${doneCount}/${totalCount})`
            }
          </button>
        )}

        {saved && !allDone && (
          <div className="rounded-xl bg-amber-50 border-2 border-amber-200 p-3 text-xs text-amber-800">
            <b>⚠️ Niewykonane zadania</b> zostały automatycznie dodane jako zadania w module Zadania.
            Menager i Owner zobaczą je na swoim panelu.
          </div>
        )}

      </div>
    </div>
  )
}
