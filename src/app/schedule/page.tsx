'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/useUser'
import { isAdminRole, normalizeRole } from '@/lib/roles'
import supabase from '@/lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameDay, isSameMonth, isToday as isTodayFn,
  parseISO, isWithinInterval
} from 'date-fns'
import { pl } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────
interface Shift {
  id: string
  worker_id: string
  shift_date: string
  department: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  schedule_month: string
  worker_name?: string
  worker_role?: string
}

interface Worker {
  id: string
  full_name: string
  role: string
  is_head_chef: boolean
}

interface ScheduleSettings {
  restaurant_open: string
  restaurant_close: string
  worker_start: string
  worker_end: string
  min_kitchen: number
  min_hall: number
  open_days: number[]
}

interface Approval {
  id: string
  schedule_month: string
  status: string
  manager_approved: boolean
  manager_id: string | null
  headchef_approved: boolean
  headchef_id: string | null
  approval_deadline: string
  generated_at: string | null
}

interface Constraint {
  id: string
  worker_a_id: string
  worker_b_id: string
  constraint_type: 'prefer' | 'avoid'
  reason: string | null
}

interface ClockLog {
  id: string
  worker_id: string
  clock_date: string
  clock_in: string | null
  clock_out: string | null
  hours_worked: number | null
  clocked_by: string | null
}

interface MonthStats {
  worker_id: string
  worker_name: string
  department: string
  shifts_count: number
  total_hours: number
  clocked_hours: number
}

interface Availability {
  id: string
  worker_id: string
  date_from: string
  date_to: string
  availability_type: string
  reason: string | null
  approved: boolean
  approved_by: string | null
}

interface SwapRequest {
  id: string
  requester_id: string
  target_id: string
  requester_shift_id: string
  target_shift_id: string
  status: string
  message: string | null
  created_at: string
}

// ─── Tabs ───────────────────────────────────────────────────
type TabType = 'calendar' | 'generate' | 'constraints' | 'clock' | 'stats' | 'availability' | 'swaps'

// ─── Helper: hours between two TIME strings ─────────────────
function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em - sh * 60 - sm) / 60
}

// ─── Day names for calendar header ──────────────────────────
const DAY_NAMES = ['Pon', 'Wt', 'Sr', 'Czw', 'Pt', 'Sob', 'Ndz']

export default function SchedulePage() {
  const { user, loading } = useUser()
  const isAdmin = user ? isAdminRole(user.role) : false

  // ─── State ──────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [shifts, setShifts] = useState<Shift[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [settings, setSettings] = useState<ScheduleSettings | null>(null)
  const [approval, setApproval] = useState<Approval | null>(null)
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [clockLogs, setClockLogs] = useState<ClockLog[]>([])
  const [availabilities, setAvailabilities] = useState<Availability[]>([])
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([])
  const [tab, setTab] = useState<TabType>('calendar')
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Generate modal state
  const [generateMonth, setGenerateMonth] = useState(() =>
    format(addMonths(new Date(), 1), 'yyyy-MM')
  )

  // ─── Live clock for countdown ──────────────────────────────
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // ─── Selected day for detail view ─────────────────────────
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  // Constraint add state
  const [newConstraintA, setNewConstraintA] = useState('')
  const [newConstraintB, setNewConstraintB] = useState('')
  const [newConstraintType, setNewConstraintType] = useState<'prefer' | 'avoid'>('avoid')

  // Availability add state
  const [availFrom, setAvailFrom] = useState('')
  const [availTo, setAvailTo] = useState('')
  const [availType, setAvailType] = useState<'unavailable' | 'preferred_off' | 'vacation'>('unavailable')
  const [availReason, setAvailReason] = useState('')

  // Swap state
  const [swapMyShiftId, setSwapMyShiftId] = useState('')
  const [swapTargetWorker, setSwapTargetWorker] = useState('')
  const [swapTargetShiftId, setSwapTargetShiftId] = useState('')
  const [swapMessage, setSwapMessage] = useState('')

  // ─── Data loading ─────────────────────────────────────────
  const monthStr = format(currentMonth, 'yyyy-MM-01')

  const loadData = useCallback(async () => {
    if (!user) return
    setLoadingData(true)
    setError('')

    try {
      // Load workers
      const { data: wData } = await supabase
        .from('profiles')
        .select('id, full_name, role, is_head_chef')
        .eq('is_active', true)
        .in('role', ['kitchen', 'hall'])
        .order('role')

      if (wData) setWorkers(wData)

      // Load settings
      const { data: sData } = await supabase
        .from('schedule_settings')
        .select('*')
        .eq('location_id', user.location_id)
        .single()

      if (sData) setSettings(sData)

      // Load shifts for current month
      const monthStart = format(currentMonth, 'yyyy-MM-01')
      const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

      const { data: shData } = await supabase
        .from('schedule_shifts')
        .select('*')
        .eq('location_id', user.location_id)
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
        .order('shift_date')

      if (shData) {
        const enriched = shData.map(sh => ({
          ...sh,
          worker_name: wData?.find(w => w.id === sh.worker_id)?.full_name || '?',
          worker_role: wData?.find(w => w.id === sh.worker_id)?.role || '?',
        }))
        setShifts(enriched)
      }

      // Load approval
      const { data: apData } = await supabase
        .from('schedule_approvals')
        .select('*')
        .eq('location_id', user.location_id)
        .eq('schedule_month', monthStart)
        .single()

      setApproval(apData || null)

      // Load constraints
      const { data: cData } = await supabase
        .from('schedule_constraints')
        .select('*')
        .eq('location_id', user.location_id)

      if (cData) setConstraints(cData)

      // Load clock logs for this month
      const { data: clData } = await supabase
        .from('clock_logs')
        .select('*')
        .eq('location_id', user.location_id)
        .gte('clock_date', monthStart)
        .lte('clock_date', monthEnd)

      if (clData) setClockLogs(clData)

      // Load availabilities for this month
      const { data: avData } = await supabase
        .from('worker_availability')
        .select('*')
        .eq('location_id', user.location_id)
        .lte('date_from', monthEnd)
        .gte('date_to', monthStart)

      if (avData) setAvailabilities(avData)

      // Load swap requests for this month
      const { data: swData } = await supabase
        .from('swap_requests')
        .select('*')
        .eq('location_id', user.location_id)
        .in('status', ['pending', 'accepted_by_target'])
        .order('created_at', { ascending: false })

      if (swData) setSwapRequests(swData)
    } catch (e: any) {
      setError(e.message)
    }
    setLoadingData(false)
  }, [user, currentMonth])

  useEffect(() => { loadData() }, [loadData])

  // ─── Calendar days ────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start, end })
    const firstDayIdx = (getDay(start) + 6) % 7
    const padBefore = Array.from({ length: firstDayIdx }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() - (firstDayIdx - i))
      return d
    })
    return [...padBefore, ...days]
  }, [currentMonth])

  // ─── Shifts for a specific day ────────────────────────────
  const shiftsForDay = useCallback((day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    return shifts.filter(s => s.shift_date === dayStr)
  }, [shifts])

  // ─── Check if worker is unavailable on a date ─────────────
  const isWorkerUnavailable = useCallback((workerId: string, dateStr: string) => {
    const date = parseISO(dateStr)
    return availabilities.some(a =>
      a.worker_id === workerId &&
      (a.approved || a.availability_type === 'unavailable') &&
      isWithinInterval(date, { start: parseISO(a.date_from), end: parseISO(a.date_to) })
    )
  }, [availabilities])

  // ─── My clock log for today ───────────────────────────────
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const myClockToday = useMemo(() => {
    if (!user) return null
    return clockLogs.find(c => c.worker_id === user.id && c.clock_date === todayStr) || null
  }, [clockLogs, user, todayStr])

  // ─── My shifts this month (for swap) ──────────────────────
  const myShifts = useMemo(() => {
    if (!user) return []
    return shifts.filter(s => s.worker_id === user.id)
  }, [shifts, user])

  // ─── Month stats ──────────────────────────────────────────
  const monthStats: MonthStats[] = useMemo(() => {
    const statsMap = new Map<string, MonthStats>()
    workers.forEach(w => {
      statsMap.set(w.id, {
        worker_id: w.id,
        worker_name: w.full_name,
        department: w.role === 'kitchen' ? 'Kuchnia' : 'Sala',
        shifts_count: 0,
        total_hours: 0,
        clocked_hours: 0,
      })
    })
    shifts.forEach(sh => {
      const stat = statsMap.get(sh.worker_id)
      if (stat && sh.status === 'scheduled') {
        stat.shifts_count++
        stat.total_hours += hoursBetween(sh.start_time, sh.end_time)
      }
    })
    clockLogs.forEach(cl => {
      const stat = statsMap.get(cl.worker_id)
      if (stat && cl.hours_worked) {
        stat.clocked_hours += cl.hours_worked
      }
    })
    return Array.from(statsMap.values()).sort((a, b) => a.department.localeCompare(b.department))
  }, [workers, shifts, clockLogs])

  // ─── Pending swaps for me ─────────────────────────────────
  const pendingSwapsForMe = useMemo(() => {
    if (!user) return []
    return swapRequests.filter(sr =>
      sr.target_id === user.id && sr.status === 'pending'
    )
  }, [swapRequests, user])

  const pendingSwapsForAdmin = useMemo(() => {
    if (!isAdmin) return []
    return swapRequests.filter(sr => sr.status === 'accepted_by_target')
  }, [swapRequests, isAdmin])

  // ═════════════════════════════════════════════════════════
  // ACTIONS
  // ═════════════════════════════════════════════════════════

  // ─── Clock In/Out (self or admin for others) ──────────────
  async function handleClockIn(workerId?: string) {
    if (!user) return
    const targetId = workerId || user.id
    setSaving(true)
    const { error: err } = await supabase.from('clock_logs').upsert({
      worker_id: targetId,
      location_id: user.location_id,
      clock_date: todayStr,
      clock_in: new Date().toISOString(),
      source: 'manual',
      clocked_by: user.id,
    }, { onConflict: 'worker_id,clock_date' })

    if (err) setError(err.message)
    else {
      const name = workerId ? workers.find(w => w.id === workerId)?.full_name : 'Ty'
      setSuccess(`Clock IN: ${name}`)
      loadData()
    }
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function handleClockOut(workerId?: string) {
    if (!user) return
    const targetId = workerId || user.id
    const clockLog = clockLogs.find(c => c.worker_id === targetId && c.clock_date === todayStr)
    if (!clockLog || !clockLog.clock_in) return

    setSaving(true)
    const clockIn = new Date(clockLog.clock_in)
    const clockOut = new Date()
    const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)

    const { error: err } = await supabase.from('clock_logs').update({
      clock_out: clockOut.toISOString(),
      hours_worked: Math.round(hours * 100) / 100,
      clocked_by: user.id,
    }).eq('id', clockLog.id)

    if (err) setError(err.message)
    else {
      const name = workerId ? workers.find(w => w.id === workerId)?.full_name : 'Ty'
      setSuccess(`Clock OUT: ${name} \u2014 ${hours.toFixed(1)}h`)
      loadData()
    }
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  // ─── Auto-generate schedule (with availability check) ─────
  async function handleGenerate() {
    if (!user || !settings) return
    setSaving(true)
    setError('')

    try {
      const targetMonth = startOfMonth(new Date(generateMonth + '-01'))
      const days = eachDayOfInterval({
        start: targetMonth,
        end: endOfMonth(targetMonth)
      })

      const kitchenWorkers = workers.filter(w => normalizeRole(w.role) === 'kitchen')
      const hallWorkers = workers.filter(w => normalizeRole(w.role) === 'hall')

      if (kitchenWorkers.length === 0 || hallWorkers.length === 0) {
        setError('Brak pracownikow w jednym z dzialow!')
        setSaving(false)
        return
      }

      // Get ALL avoid constraints (works for ANY pair, not just cross-department)
      const avoidPairs = constraints
        .filter(c => c.constraint_type === 'avoid')
        .map(c => [c.worker_a_id, c.worker_b_id])

      // Load availabilities for the target month
      const mStart = format(targetMonth, 'yyyy-MM-dd')
      const mEnd = format(endOfMonth(targetMonth), 'yyyy-MM-dd')
      const { data: monthAvail } = await supabase
        .from('worker_availability')
        .select('*')
        .eq('location_id', user.location_id)
        .lte('date_from', mEnd)
        .gte('date_to', mStart)

      const isUnavailable = (workerId: string, dateStr: string) => {
        if (!monthAvail) return false
        const d = parseISO(dateStr)
        return monthAvail.some(a =>
          a.worker_id === workerId &&
          isWithinInterval(d, { start: parseISO(a.date_from), end: parseISO(a.date_to) })
        )
      }

      const newShifts: any[] = []
      const workerDayCount: Record<string, number> = {}
      workers.forEach(w => workerDayCount[w.id] = 0)

      const openDays = settings.open_days || [0, 1, 2, 3, 4, 5, 6]

      for (const day of days) {
        const dayOfWeek = getDay(day)
        if (!openDays.includes(dayOfWeek)) continue

        const dayStr = format(day, 'yyyy-MM-dd')

        // Available kitchen workers (not unavailable)
        const availKitchen = kitchenWorkers.filter(w => !isUnavailable(w.id, dayStr))
        const availHall = hallWorkers.filter(w => !isUnavailable(w.id, dayStr))

        // Sort by least shifts first (fair distribution)
        const sortedKitchen = [...availKitchen].sort(
          (a, b) => (workerDayCount[a.id] || 0) - (workerDayCount[b.id] || 0)
        )

        // Pick kitchen workers, check avoid constraints between them
        const assignedKitchen: Worker[] = []
        for (const w of sortedKitchen) {
          if (assignedKitchen.length >= settings.min_kitchen) break
          // Check avoid against already assigned kitchen workers
          const conflictsWithAssigned = avoidPairs.some(([a, b]) =>
            assignedKitchen.some(ak =>
              (ak.id === a && w.id === b) || (ak.id === b && w.id === a)
            )
          )
          if (!conflictsWithAssigned) {
            assignedKitchen.push(w)
          }
        }
        // Fallback: if not enough, add without constraint check
        if (assignedKitchen.length < settings.min_kitchen) {
          for (const w of sortedKitchen) {
            if (assignedKitchen.length >= settings.min_kitchen) break
            if (!assignedKitchen.find(ak => ak.id === w.id)) {
              assignedKitchen.push(w)
            }
          }
        }

        // Pick hall workers, check avoid against ALL assigned (kitchen + hall)
        const assignedIds = assignedKitchen.map(w => w.id)
        const sortedHall = [...availHall].sort(
          (a, b) => (workerDayCount[a.id] || 0) - (workerDayCount[b.id] || 0)
        )

        const assignedHall: Worker[] = []
        for (const w of sortedHall) {
          if (assignedHall.length >= settings.min_hall) break
          const allAssigned = [...assignedIds, ...assignedHall.map(h => h.id)]
          const conflictsWithAssigned = avoidPairs.some(([a, b]) =>
            allAssigned.some(aid =>
              (aid === a && w.id === b) || (aid === b && w.id === a)
            )
          )
          if (!conflictsWithAssigned) {
            assignedHall.push(w)
          }
        }
        // Fallback
        if (assignedHall.length < settings.min_hall) {
          for (const w of sortedHall) {
            if (assignedHall.length >= settings.min_hall) break
            if (!assignedHall.find(ah => ah.id === w.id)) {
              assignedHall.push(w)
            }
          }
        }

        // Create shift records
        for (const w of assignedKitchen) {
          newShifts.push({
            location_id: user.location_id,
            worker_id: w.id,
            shift_date: dayStr,
            department: 'kitchen',
            start_time: settings.worker_start,
            end_time: settings.worker_end,
            status: 'scheduled',
            schedule_month: format(targetMonth, 'yyyy-MM-01'),
          })
          workerDayCount[w.id] = (workerDayCount[w.id] || 0) + 1
        }

        for (const w of assignedHall) {
          newShifts.push({
            location_id: user.location_id,
            worker_id: w.id,
            shift_date: dayStr,
            department: 'hall',
            start_time: settings.worker_start,
            end_time: settings.worker_end,
            status: 'scheduled',
            schedule_month: format(targetMonth, 'yyyy-MM-01'),
          })
          workerDayCount[w.id] = (workerDayCount[w.id] || 0) + 1
        }
      }

      // Delete old shifts for this month
      await supabase.from('schedule_shifts')
        .delete()
        .eq('location_id', user.location_id)
        .eq('schedule_month', format(targetMonth, 'yyyy-MM-01'))

      // Insert new shifts in batches
      const batchSize = 50
      for (let i = 0; i < newShifts.length; i += batchSize) {
        const batch = newShifts.slice(i, i + batchSize)
        const { error: err } = await supabase.from('schedule_shifts').insert(batch)
        if (err) throw new Error(err.message)
      }

      // Create/update approval record
      const deadline = new Date(targetMonth)
      deadline.setDate(deadline.getDate() - 7)

      await supabase.from('schedule_approvals').upsert({
        location_id: user.location_id,
        schedule_month: format(targetMonth, 'yyyy-MM-01'),
        status: 'pending',
        generated_by: user.id,
        generated_at: new Date().toISOString(),
        manager_approved: false,
        headchef_approved: false,
        approval_deadline: format(deadline, 'yyyy-MM-dd'),
      }, { onConflict: 'location_id,schedule_month' })

      setSuccess(`Grafik na ${format(targetMonth, 'LLLL yyyy', { locale: pl })} wygenerowany! ${newShifts.length} zmian.`)
      setCurrentMonth(targetMonth)
      loadData()
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
    setTimeout(() => setSuccess(''), 5000)
  }

  // ─── Approve schedule ─────────────────────────────────────
  async function handleApprove() {
    if (!user || !approval) return
    setSaving(true)

    const isManager = normalizeRole(user.role) === 'manager' || normalizeRole(user.role) === 'owner'
    const isHeadChef = workers.find(w => w.id === user.id)?.is_head_chef

    const updates: any = {}
    if (isManager && !approval.manager_approved) {
      updates.manager_approved = true
      updates.manager_id = user.id
      updates.manager_approved_at = new Date().toISOString()
    }
    if (isHeadChef && !approval.headchef_approved) {
      updates.headchef_approved = true
      updates.headchef_id = user.id
      updates.headchef_approved_at = new Date().toISOString()
    }

    const willManagerApprove = updates.manager_approved || approval.manager_approved
    const willHeadChefApprove = updates.headchef_approved || approval.headchef_approved
    if (willManagerApprove && willHeadChefApprove) {
      updates.status = 'approved'
      updates.approved_at = new Date().toISOString()
    }

    const { error: err } = await supabase
      .from('schedule_approvals')
      .update(updates)
      .eq('id', approval.id)

    if (err) setError(err.message)
    else { setSuccess('Zatwierdzono!'); loadData() }
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  // ─── Add/remove shift manually ────────────────────────────
  async function addShift(workerId: string, date: Date, dept: string) {
    if (!user || !settings) return
    setSaving(true)
    const { error: err } = await supabase.from('schedule_shifts').insert({
      location_id: user.location_id,
      worker_id: workerId,
      shift_date: format(date, 'yyyy-MM-dd'),
      department: dept,
      start_time: settings.worker_start,
      end_time: settings.worker_end,
      status: 'scheduled',
      schedule_month: format(startOfMonth(date), 'yyyy-MM-01'),
    })
    if (err) setError(err.message)
    else loadData()
    setSaving(false)
  }

  async function removeShift(shiftId: string) {
    setSaving(true)
    const { error: err } = await supabase.from('schedule_shifts').delete().eq('id', shiftId)
    if (err) setError(err.message)
    else loadData()
    setSaving(false)
  }

  // ─── Add/remove constraint ────────────────────────────────
  async function addConstraint() {
    if (!user || !newConstraintA || !newConstraintB || newConstraintA === newConstraintB) return
    setSaving(true)
    const { error: err } = await supabase.from('schedule_constraints').insert({
      location_id: user.location_id,
      worker_a_id: newConstraintA,
      worker_b_id: newConstraintB,
      constraint_type: newConstraintType,
    })
    if (err) setError(err.message)
    else { loadData(); setNewConstraintA(''); setNewConstraintB('') }
    setSaving(false)
  }

  async function removeConstraint(id: string) {
    const { error: err } = await supabase.from('schedule_constraints').delete().eq('id', id)
    if (err) setError(err.message)
    else loadData()
  }

  // ─── Availability ─────────────────────────────────────────
  async function addAvailability() {
    if (!user || !availFrom || !availTo) return
    setSaving(true)
    const { error: err } = await supabase.from('worker_availability').insert({
      worker_id: user.id,
      location_id: user.location_id,
      date_from: availFrom,
      date_to: availTo,
      availability_type: availType,
      reason: availReason.trim() || null,
      approved: isAdmin, // auto-approve if admin submits
      approved_by: isAdmin ? user.id : null,
    })
    if (err) setError(err.message)
    else {
      setSuccess('Zgłoszenie zapisane!')
      setAvailFrom(''); setAvailTo(''); setAvailReason('')
      loadData()
    }
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function approveAvailability(id: string) {
    if (!user) return
    const { error: err } = await supabase.from('worker_availability').update({
      approved: true, approved_by: user.id
    }).eq('id', id)
    if (err) setError(err.message)
    else { setSuccess('Zaakceptowano!'); loadData() }
    setTimeout(() => setSuccess(''), 3000)
  }

  async function removeAvailability(id: string) {
    const { error: err } = await supabase.from('worker_availability').delete().eq('id', id)
    if (err) setError(err.message)
    else loadData()
  }

  // ─── Swap Requests ────────────────────────────────────────
  async function createSwapRequest() {
    if (!user || !swapMyShiftId || !swapTargetShiftId) return
    setSaving(true)
    const targetShift = shifts.find(s => s.id === swapTargetShiftId)
    if (!targetShift) { setSaving(false); return }

    const { error: err } = await supabase.from('swap_requests').insert({
      location_id: user.location_id,
      requester_id: user.id,
      target_id: targetShift.worker_id,
      requester_shift_id: swapMyShiftId,
      target_shift_id: swapTargetShiftId,
      status: 'pending',
      message: swapMessage.trim() || null,
    })
    if (err) setError(err.message)
    else {
      setSuccess('Prosba o zamiane wyslana!')
      setSwapMyShiftId(''); setSwapTargetShiftId(''); setSwapTargetWorker(''); setSwapMessage('')
      loadData()
    }
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  // Target accepts swap
  async function acceptSwap(swapId: string) {
    const { error: err } = await supabase.from('swap_requests').update({
      status: 'accepted_by_target',
      target_accepted_at: new Date().toISOString(),
    }).eq('id', swapId)
    if (err) setError(err.message)
    else { setSuccess('Zaakceptowano zamiane \u2014 czeka na Menagera'); loadData() }
    setTimeout(() => setSuccess(''), 3000)
  }

  // Manager approves swap and executes it
  async function approveSwap(swapId: string) {
    if (!user) return
    setSaving(true)
    const swap = swapRequests.find(sr => sr.id === swapId)
    if (!swap) { setSaving(false); return }

    // Swap the worker_ids on the two shifts
    const shiftA = shifts.find(s => s.id === swap.requester_shift_id)
    const shiftB = shifts.find(s => s.id === swap.target_shift_id)
    if (!shiftA || !shiftB) { setSaving(false); setError('Nie znaleziono zmian'); return }

    // Update shift A -> target worker
    await supabase.from('schedule_shifts').update({
      worker_id: swap.target_id
    }).eq('id', swap.requester_shift_id)

    // Update shift B -> requester worker
    await supabase.from('schedule_shifts').update({
      worker_id: swap.requester_id
    }).eq('id', swap.target_shift_id)

    // Mark swap as approved
    await supabase.from('swap_requests').update({
      status: 'approved',
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    }).eq('id', swapId)

    setSuccess('Zamiana zatwierdzona i wykonana!')
    loadData()
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function rejectSwap(swapId: string) {
    if (!user) return
    await supabase.from('swap_requests').update({
      status: 'rejected',
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    }).eq('id', swapId)
    setSuccess('Zamiana odrzucona')
    loadData()
    setTimeout(() => setSuccess(''), 3000)
  }

  // ─── Render ───────────────────────────────────────────────
  if (loading || !user) return null

  const deptColor = (dept: string) =>
    dept === 'kitchen'
      ? { bg: 'bg-orange-100', text: 'text-orange-700', badge: 'bg-orange-500' }
      : { bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-500' }

  // Tab config
  const allTabs: [TabType, string][] = [
    ['calendar' as TabType, 'Kalendarz'],
    ...(isAdmin ? [['generate' as TabType, 'Generuj'] as [TabType, string], ['constraints' as TabType, 'Zasady'] as [TabType, string]] : []),
    ['availability' as TabType, 'Dostepnosc'],
    ['clock' as TabType, 'Obecnosc'],
    ['swaps' as TabType, `Zamiany${pendingSwapsForMe.length + pendingSwapsForAdmin.length > 0 ? ` (${pendingSwapsForMe.length + pendingSwapsForAdmin.length})` : ''}`],
    ['stats' as TabType, 'Statystyki'],
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-brand-600 font-medium text-sm">&larr; Powrot</Link>
          <h1 className="text-xl font-bold">Grafik zmianowy</h1>
          <div className="w-16" />
        </div>

        {/* Today info bar */}
        {(() => {
          const todayDate = format(now, 'EEEE, d MMMM yyyy', { locale: pl })
          const endTime = settings ? settings.worker_end : '20:30'
          const [eh, em] = endTime.split(':').map(Number)
          const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em)
          const diffMs = endToday.getTime() - now.getTime()
          const isWorkday = diffMs > 0 && diffMs < 12 * 60 * 60 * 1000
          const diffH = Math.floor(diffMs / (1000 * 60 * 60))
          const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

          return (
            <div className="card bg-gray-900 text-white flex items-center justify-between">
              <div>
                <div className="text-sm font-bold capitalize">{todayDate}</div>
                <div className="text-xs text-gray-400">
                  Restauracja {settings?.restaurant_open?.slice(0,5) || '12:00'} &mdash; {settings?.restaurant_close?.slice(0,5) || '20:00'}
                </div>
              </div>
              {isWorkday ? (
                <div className="text-right">
                  <div className="text-xs text-gray-400">Do konca pracy</div>
                  <div className="text-lg font-bold text-brand-400">{diffH}h {diffM}m</div>
                </div>
              ) : diffMs <= 0 ? (
                <div className="text-right">
                  <div className="text-xs text-gray-400">Status</div>
                  <div className="text-sm font-bold text-green-400">Po pracy</div>
                </div>
              ) : (
                <div className="text-right">
                  <div className="text-xs text-gray-400">Status</div>
                  <div className="text-sm font-bold text-gray-400">Przed zmiana</div>
                </div>
              )}
            </div>
          )
        })()}

        {/* Approval notification banner */}
        {approval?.status === 'approved' && isSameMonth(currentMonth, new Date()) && (
          <div className="bg-green-50 border-2 border-green-300 p-3 rounded-xl flex items-center gap-3">
            <span className="text-2xl">&#9989;</span>
            <div>
              <div className="text-sm font-bold text-green-800">Grafik zatwierdzony</div>
              <div className="text-xs text-green-600">
                Menager i Head Chef zatwierdzili grafik na {format(currentMonth, 'LLLL yyyy', { locale: pl })}.
                Sprawdz swoje zmiany w kalendarzu.
              </div>
            </div>
          </div>
        )}

        {/* Pending swap notification */}
        {pendingSwapsForMe.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 p-3 rounded-xl flex items-center gap-3">
            <span className="text-2xl">&#128260;</span>
            <div>
              <div className="text-sm font-bold text-amber-800">
                {pendingSwapsForMe.length} {pendingSwapsForMe.length === 1 ? 'prosba' : 'prosby'} o zamiane zmian
              </div>
              <button onClick={() => setTab('swaps')} className="text-xs text-amber-600 font-medium underline">
                Przejdz do Zamiany
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {allTabs.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                tab === t ? 'bg-brand-500 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Messages */}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded-xl">{success}</div>}

        {/* Loading */}
        {loadingData && (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: CALENDAR                                       */}
        {/* ═══════════════════════════════════════════════════ */}
        {!loadingData && tab === 'calendar' && (
          <>
            {/* Month nav */}
            <div className="card flex items-center justify-between">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-xl hover:bg-gray-100">
                <span className="text-lg">&laquo;</span>
              </button>
              <div className="text-center">
                <div className="font-bold capitalize">
                  {format(currentMonth, 'LLLL yyyy', { locale: pl })}
                </div>
                {!isSameMonth(currentMonth, new Date()) && (
                  <button onClick={() => setCurrentMonth(startOfMonth(new Date()))} className="text-brand-600 text-xs font-medium">
                    Dzis
                  </button>
                )}
              </div>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-xl hover:bg-gray-100">
                <span className="text-lg">&raquo;</span>
              </button>
            </div>

            {/* Approval banner */}
            {approval && approval.status !== 'approved' && (
              <div className={`card border-2 ${
                approval.status === 'pending' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold">
                      {approval.status === 'pending' ? 'OCZEKUJE NA ZATWIERDZENIE' : 'DRAFT'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Menager: {approval.manager_approved ? 'TAK' : 'NIE'} | Head Chef: {approval.headchef_approved ? 'TAK' : 'NIE'}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Deadline: {approval.approval_deadline}
                    </div>
                  </div>
                  {approval.status === 'pending' && (
                    (isAdmin || workers.find(w => w.id === user.id)?.is_head_chef) ? (
                      <button
                        onClick={handleApprove}
                        disabled={saving}
                        className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50"
                      >
                        Zatwierdz
                      </button>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* Calendar grid */}
            <div className="card p-2">
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map((day, idx) => {
                  const inMonth = isSameMonth(day, currentMonth)
                  const today = isTodayFn(day)
                  const dayShifts = shiftsForDay(day)
                  const kitchenCount = dayShifts.filter(s => s.department === 'kitchen').length
                  const hallCount = dayShifts.filter(s => s.department === 'hall').length
                  const isSelected = selectedDay && isSameDay(day, selectedDay)
                  const hasMyShift = dayShifts.some(s => s.worker_id === user.id)

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDay(isSameDay(day, selectedDay || new Date(0)) ? null : day)}
                      className={`relative p-1 rounded-lg text-center min-h-[52px] transition-all ${
                        !inMonth ? 'opacity-30' :
                        isSelected ? 'bg-brand-100 ring-2 ring-brand-500' :
                        today ? 'bg-brand-50 ring-1 ring-brand-300' :
                        hasMyShift ? 'bg-green-50' :
                        'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`text-xs font-bold ${today ? 'text-brand-600' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                        {format(day, 'd')}
                      </div>
                      {inMonth && dayShifts.length > 0 && (
                        <div className="flex justify-center gap-0.5 mt-0.5">
                          {kitchenCount > 0 && (
                            <span className="text-[8px] bg-orange-400 text-white rounded px-0.5 font-bold">{kitchenCount}K</span>
                          )}
                          {hallCount > 0 && (
                            <span className="text-[8px] bg-blue-400 text-white rounded px-0.5 font-bold">{hallCount}S</span>
                          )}
                        </div>
                      )}
                      {hasMyShift && inMonth && (
                        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-3 justify-center text-xs text-gray-400">
              <span><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />Kuchnia</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />Sala</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Twoja zmiana</span>
            </div>

            {/* Selected day detail */}
            {selectedDay && (
              <div className="card border-2 border-brand-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold capitalize">
                    {format(selectedDay, 'EEEE, d MMMM', { locale: pl })}
                  </h3>
                  <button onClick={() => setSelectedDay(null)} className="text-gray-400 text-sm">Zamknij</button>
                </div>

                {shiftsForDay(selectedDay).length === 0 ? (
                  <p className="text-gray-300 text-sm text-center py-3">Brak zmian</p>
                ) : (
                  <div className="space-y-2">
                    {shiftsForDay(selectedDay).map(sh => {
                      const colors = deptColor(sh.department)
                      const isMe = sh.worker_id === user.id
                      return (
                        <div key={sh.id} className={`flex items-center justify-between p-2 rounded-lg ${colors.bg} ${isMe ? 'ring-2 ring-green-400' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] text-white px-1.5 py-0.5 rounded font-bold ${colors.badge}`}>
                              {sh.department === 'kitchen' ? 'KU' : 'SA'}
                            </span>
                            <span className={`text-sm font-medium ${isMe ? 'font-bold' : ''}`}>
                              {sh.worker_name} {isMe ? '(Ty)' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{sh.start_time?.slice(0,5)} - {sh.end_time?.slice(0,5)}</span>
                            {isAdmin && (
                              <button onClick={() => removeShift(sh.id)} className="text-red-400 hover:text-red-600 text-xs">&#10005;</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add shift (admin) */}
                {isAdmin && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-2">Dodaj zmiane:</p>
                    <div className="flex flex-wrap gap-1">
                      {workers
                        .filter(w => !shiftsForDay(selectedDay).some(s => s.worker_id === w.id))
                        .map(w => (
                          <button
                            key={w.id}
                            onClick={() => addShift(w.id, selectedDay, w.role === 'kitchen' ? 'kitchen' : 'hall')}
                            className={`text-xs px-2 py-1 rounded-lg font-medium ${
                              w.role === 'kitchen' ? 'bg-orange-50 text-orange-700 hover:bg-orange-100' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                          >
                            + {w.full_name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: GENERATE                                       */}
        {/* ═══════════════════════════════════════════════════ */}
        {!loadingData && tab === 'generate' && isAdmin && (
          <div className="card space-y-4">
            <h2 className="font-bold text-lg">Automatyczny grafik</h2>
            <p className="text-sm text-gray-500">
              System sprawiedliwie rozdzieli zmiany, uwzgledniajac: zasady (avoid/prefer), <b>dostepnosc pracownikow</b> i minimalne obsady.
              Min. {settings?.min_kitchen || 2} kuchnia + {settings?.min_hall || 1} sala per dzien.
            </p>

            <div>
              <label className="text-sm font-medium text-gray-700">Na jaki miesiac?</label>
              <input
                type="month"
                value={generateMonth}
                onChange={(e) => setGenerateMonth(e.target.value)}
                className="mt-1 w-full p-3 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            {/* Show unavailabilities for target month */}
            {availabilities.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl text-sm">
                <div className="font-medium text-purple-700 mb-1">Zgloszenia niedostepnosci:</div>
                {availabilities.map(a => (
                  <div key={a.id} className="text-purple-600 text-xs">
                    {workers.find(w => w.id === a.worker_id)?.full_name || '?'}: {a.date_from} \u2014 {a.date_to}
                    {a.reason ? ` (${a.reason})` : ''}
                    {a.approved ? ' \u2713' : ' \u23F3'}
                  </div>
                ))}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-sm text-amber-700">
              <b>Uwaga:</b> Generowanie usunie istniejacy grafik na wybrany miesiac i stworzy nowy.
              Pracownicy z zgloszeniami niedostepnosci zostana pominieci w podanych dniach.
            </div>

            <div className="bg-gray-50 p-3 rounded-xl text-sm space-y-1">
              <div className="font-medium">Pracownicy:</div>
              <div className="text-gray-600">
                Kuchnia ({workers.filter(w => w.role === 'kitchen').length}): {workers.filter(w => w.role === 'kitchen').map(w => w.full_name).join(', ')}
              </div>
              <div className="text-gray-600">
                Sala ({workers.filter(w => w.role === 'hall').length}): {workers.filter(w => w.role === 'hall').map(w => w.full_name).join(', ')}
              </div>
            </div>

            {constraints.filter(c => c.constraint_type === 'avoid').length > 0 && (
              <div className="bg-red-50 p-3 rounded-xl text-sm">
                <div className="font-medium text-red-700">Unikac razem:</div>
                {constraints.filter(c => c.constraint_type === 'avoid').map(c => (
                  <div key={c.id} className="text-red-600">
                    {workers.find(w => w.id === c.worker_a_id)?.full_name} + {workers.find(w => w.id === c.worker_b_id)?.full_name}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={saving}
              className="w-full py-3 bg-brand-500 text-white rounded-xl font-bold text-sm hover:bg-brand-600 disabled:opacity-50 transition-all"
            >
              {saving ? 'Generowanie...' : 'Wygeneruj grafik'}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: CONSTRAINTS                                    */}
        {/* ═══════════════════════════════════════════════════ */}
        {!loadingData && tab === 'constraints' && isAdmin && (
          <div className="space-y-4">
            <div className="card">
              <h2 className="font-bold text-lg mb-3">Zasady grafiku</h2>
              <p className="text-sm text-gray-500 mb-4">
                Ustaw kto z kim moze pracowac (prefer) lub kto z kim NIE powinien (avoid). Dziala miedzy WSZYSTKIMI pracownikami \u2014 kuchnia-kuchnia, kuchnia-sala, sala-sala.
              </p>

              <div className="space-y-3 bg-gray-50 p-3 rounded-xl">
                <div className="grid grid-cols-2 gap-2">
                  <select value={newConstraintA} onChange={e => setNewConstraintA(e.target.value)}
                    className="p-2 border rounded-lg text-sm">
                    <option value="">Pracownik A</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
                  </select>
                  <select value={newConstraintB} onChange={e => setNewConstraintB(e.target.value)}
                    className="p-2 border rounded-lg text-sm">
                    <option value="">Pracownik B</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewConstraintType('avoid')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${newConstraintType === 'avoid' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border'}`}
                  >
                    Unikac razem
                  </button>
                  <button
                    onClick={() => setNewConstraintType('prefer')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${newConstraintType === 'prefer' ? 'bg-green-500 text-white' : 'bg-white text-gray-600 border'}`}
                  >
                    Preferowac razem
                  </button>
                </div>
                <button
                  onClick={addConstraint}
                  disabled={!newConstraintA || !newConstraintB || newConstraintA === newConstraintB}
                  className="w-full py-2 bg-brand-500 text-white rounded-lg text-sm font-bold disabled:opacity-30"
                >
                  + Dodaj zasade
                </button>
              </div>
            </div>

            {constraints.length > 0 && (
              <div className="card">
                <h3 className="font-bold text-sm mb-2">Aktualne zasady ({constraints.length})</h3>
                <div className="space-y-2">
                  {constraints.map(c => (
                    <div key={c.id} className={`flex items-center justify-between p-2 rounded-lg ${
                      c.constraint_type === 'avoid' ? 'bg-red-50' : 'bg-green-50'
                    }`}>
                      <div className="text-sm">
                        <span className={`font-bold ${c.constraint_type === 'avoid' ? 'text-red-600' : 'text-green-600'}`}>
                          {c.constraint_type === 'avoid' ? 'UNIKAC' : 'PREFEROWAC'}
                        </span>
                        {' '}{workers.find(w => w.id === c.worker_a_id)?.full_name} + {workers.find(w => w.id === c.worker_b_id)?.full_name}
                      </div>
                      <button onClick={() => removeConstraint(c.id)} className="text-gray-400 hover:text-red-500 text-sm">&#10005;</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: AVAILABILITY                                   */}
        {/* ═══════════════════════════════════════════════════ */}
        {!loadingData && tab === 'availability' && (
          <div className="space-y-4">
            <div className="card">
              <h2 className="font-bold text-lg mb-1">Dostepnosc</h2>
              <p className="text-sm text-gray-500 mb-4">
                Zglos dni w ktorych nie mozesz pracowac. Menager uwzgledni to przy generowaniu grafiku.
              </p>

              <div className="space-y-3 bg-gray-50 p-3 rounded-xl">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Od</label>
                    <input type="date" value={availFrom} onChange={e => setAvailFrom(e.target.value)}
                      className="w-full p-2 border rounded-lg text-sm mt-0.5" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Do</label>
                    <input type="date" value={availTo} onChange={e => setAvailTo(e.target.value)}
                      className="w-full p-2 border rounded-lg text-sm mt-0.5" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAvailType('unavailable')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium ${availType === 'unavailable' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border'}`}>
                    Niedostepny
                  </button>
                  <button onClick={() => setAvailType('preferred_off')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium ${availType === 'preferred_off' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 border'}`}>
                    Prosze o wolne
                  </button>
                  <button onClick={() => setAvailType('vacation')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium ${availType === 'vacation' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border'}`}>
                    Urlop
                  </button>
                </div>
                <input type="text" value={availReason} onChange={e => setAvailReason(e.target.value)}
                  placeholder="Powod (opcjonalnie)" className="w-full p-2 border rounded-lg text-sm" />
                <button onClick={addAvailability} disabled={!availFrom || !availTo || saving}
                  className="w-full py-2 bg-brand-500 text-white rounded-lg text-sm font-bold disabled:opacity-30">
                  Wyslij zgloszenie
                </button>
              </div>
            </div>

            {/* List of availabilities */}
            <div className="card">
              <h3 className="font-bold text-sm mb-2">
                {isAdmin ? 'Zgloszenia wszystkich pracownikow' : 'Moje zgloszenia'}
              </h3>
              {availabilities.filter(a => isAdmin || a.worker_id === user.id).length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-3">Brak zgloszen</p>
              ) : (
                <div className="space-y-2">
                  {availabilities
                    .filter(a => isAdmin || a.worker_id === user.id)
                    .map(a => (
                      <div key={a.id} className={`flex items-center justify-between p-2 rounded-lg ${
                        a.approved ? 'bg-green-50' : 'bg-amber-50'
                      }`}>
                        <div>
                          {isAdmin && <div className="text-xs font-bold text-gray-700">{workers.find(w => w.id === a.worker_id)?.full_name}</div>}
                          <div className="text-sm">
                            {a.date_from} \u2014 {a.date_to}
                            <span className={`ml-2 text-xs font-bold ${
                              a.availability_type === 'unavailable' ? 'text-red-600' :
                              a.availability_type === 'vacation' ? 'text-blue-600' : 'text-amber-600'
                            }`}>
                              {a.availability_type === 'unavailable' ? 'NIEDOSTEPNY' :
                               a.availability_type === 'vacation' ? 'URLOP' : 'PROSZE O WOLNE'}
                            </span>
                          </div>
                          {a.reason && <div className="text-xs text-gray-400">{a.reason}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          {a.approved ? (
                            <span className="text-xs font-bold text-green-600">OK</span>
                          ) : isAdmin ? (
                            <button onClick={() => approveAvailability(a.id)}
                              className="text-xs px-2 py-1 bg-green-500 text-white rounded-lg font-bold">
                              Akceptuj
                            </button>
                          ) : (
                            <span className="text-xs text-amber-600">Czeka</span>
                          )}
                          {(isAdmin || a.worker_id === user.id) && (
                            <button onClick={() => removeAvailability(a.id)}
                              className="text-gray-400 hover:text-red-500 text-sm">&#10005;</button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: CLOCK IN/OUT                                   */}
        {/* ═══════════════════════════════════════════════════ */}
        {!loadingData && tab === 'clock' && (
          <div className="space-y-4">
            {/* My clock today (non-admin) */}
            {!isAdmin && (
              <div className="card border-2 border-brand-200">
                <h2 className="font-bold text-lg mb-3">Obecnosc \u2014 dzis</h2>
                {myClockToday ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-green-50 p-3 rounded-xl">
                      <div>
                        <div className="text-xs text-gray-400">Wejscie</div>
                        <div className="text-lg font-bold text-green-700">
                          {myClockToday.clock_in ? format(new Date(myClockToday.clock_in), 'HH:mm') : '\u2014'}
                        </div>
                      </div>
                      {myClockToday.clock_out ? (
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Wyjscie</div>
                          <div className="text-lg font-bold text-red-600">
                            {format(new Date(myClockToday.clock_out), 'HH:mm')}
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => handleClockOut()} disabled={saving}
                          className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                          Clock OUT
                        </button>
                      )}
                    </div>
                    {myClockToday.hours_worked && (
                      <div className="text-center text-sm text-gray-500">
                        Przepracowano: <b>{myClockToday.hours_worked.toFixed(1)}h</b>
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => handleClockIn()} disabled={saving}
                    className="w-full py-4 bg-green-500 text-white rounded-xl font-bold text-lg disabled:opacity-50">
                    Clock IN
                  </button>
                )}
              </div>
            )}

            {/* Admin: clock all workers */}
            {isAdmin && (
              <div className="card">
                <h2 className="font-bold text-lg mb-3">Obecnosc zespolu \u2014 dzis</h2>
                <div className="space-y-2">
                  {workers.map(w => {
                    const cl = clockLogs.find(c => c.worker_id === w.id && c.clock_date === todayStr)
                    const colors = deptColor(w.role)
                    return (
                      <div key={w.id} className={`flex items-center justify-between p-3 rounded-xl ${colors.bg}`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] text-white px-1.5 py-0.5 rounded font-bold ${colors.badge}`}>
                            {w.role === 'kitchen' ? 'KU' : 'SA'}
                          </span>
                          <div>
                            <div className="text-sm font-medium">{w.full_name}</div>
                            {cl && (
                              <div className="text-xs text-gray-500">
                                IN: {cl.clock_in ? format(new Date(cl.clock_in), 'HH:mm') : '\u2014'}
                                {cl.clock_out ? ` | OUT: ${format(new Date(cl.clock_out), 'HH:mm')} | ${cl.hours_worked?.toFixed(1)}h` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!cl ? (
                            <button onClick={() => handleClockIn(w.id)} disabled={saving}
                              className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                              IN
                            </button>
                          ) : !cl.clock_out ? (
                            <button onClick={() => handleClockOut(w.id)} disabled={saving}
                              className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                              OUT
                            </button>
                          ) : (
                            <span className="text-xs text-green-600 font-bold px-2">Done</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Today's clock log summary */}
            {clockLogs.filter(c => c.clock_date === todayStr).length > 0 && (
              <div className="card">
                <h3 className="font-bold text-sm mb-2">Dzisiejsze wpisy</h3>
                <div className="space-y-1">
                  {clockLogs.filter(c => c.clock_date === todayStr).map(cl => {
                    const w = workers.find(w => w.id === cl.worker_id)
                    return (
                      <div key={cl.id} className="flex justify-between text-sm text-gray-600">
                        <span>{w?.full_name || '?'}</span>
                        <span>
                          {cl.clock_in ? format(new Date(cl.clock_in), 'HH:mm') : '?'}
                          {cl.clock_out ? ` \u2014 ${format(new Date(cl.clock_out), 'HH:mm')}` : ' \u2014 ...'}
                          {cl.hours_worked ? ` (${cl.hours_worked.toFixed(1)}h)` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: SWAPS                                          */}
        {/* ═══════════════════════════════════════════════════ */}
        {!loadingData && tab === 'swaps' && (
          <div className="space-y-4">
            {/* Create swap request (non-admin workers) */}
            {!isAdmin && myShifts.length > 0 && (
              <div className="card">
                <h2 className="font-bold text-lg mb-1">Zaproponuj zamiane</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Wybierz swoja zmiane i zmiane kolegi. Kolega musi zaakceptowac, potem Menager zatwierdza.
                </p>

                <div className="space-y-3 bg-gray-50 p-3 rounded-xl">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Moja zmiana (oddaje):</label>
                    <select value={swapMyShiftId} onChange={e => setSwapMyShiftId(e.target.value)}
                      className="w-full p-2 border rounded-lg text-sm mt-0.5">
                      <option value="">Wybierz swoja zmiane...</option>
                      {myShifts.map(s => (
                        <option key={s.id} value={s.id}>
                          {format(parseISO(s.shift_date), 'EEEE d MMM', { locale: pl })} ({s.department === 'kitchen' ? 'Kuchnia' : 'Sala'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600">Zamieniam z:</label>
                    <select value={swapTargetWorker} onChange={e => { setSwapTargetWorker(e.target.value); setSwapTargetShiftId('') }}
                      className="w-full p-2 border rounded-lg text-sm mt-0.5">
                      <option value="">Wybierz kolege...</option>
                      {workers.filter(w => w.id !== user.id).map(w => (
                        <option key={w.id} value={w.id}>{w.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {swapTargetWorker && (
                    <div>
                      <label className="text-xs font-medium text-gray-600">Jego/jej zmiana (biore):</label>
                      <select value={swapTargetShiftId} onChange={e => setSwapTargetShiftId(e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm mt-0.5">
                        <option value="">Wybierz zmiane...</option>
                        {shifts.filter(s => s.worker_id === swapTargetWorker).map(s => (
                          <option key={s.id} value={s.id}>
                            {format(parseISO(s.shift_date), 'EEEE d MMM', { locale: pl })} ({s.department === 'kitchen' ? 'Kuchnia' : 'Sala'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <input type="text" value={swapMessage} onChange={e => setSwapMessage(e.target.value)}
                    placeholder="Wiadomosc (opcjonalnie)" className="w-full p-2 border rounded-lg text-sm" />

                  <button onClick={createSwapRequest}
                    disabled={!swapMyShiftId || !swapTargetShiftId || saving}
                    className="w-full py-2 bg-brand-500 text-white rounded-lg text-sm font-bold disabled:opacity-30">
                    Wyslij prosbe o zamiane
                  </button>
                </div>
              </div>
            )}

            {/* Pending swaps I need to accept */}
            {pendingSwapsForMe.length > 0 && (
              <div className="card border-2 border-amber-300">
                <h3 className="font-bold text-sm mb-2 text-amber-800">Prosby o zamiane do Ciebie</h3>
                <div className="space-y-2">
                  {pendingSwapsForMe.map(sr => {
                    const requester = workers.find(w => w.id === sr.requester_id)
                    const myShift = shifts.find(s => s.id === sr.target_shift_id)
                    const theirShift = shifts.find(s => s.id === sr.requester_shift_id)
                    return (
                      <div key={sr.id} className="bg-amber-50 p-3 rounded-xl">
                        <div className="text-sm font-medium">
                          <b>{requester?.full_name}</b> chce zamienic:
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Oddaje: {theirShift ? format(parseISO(theirShift.shift_date), 'EEEE d MMM', { locale: pl }) : '?'}
                          {' \u2194 '}
                          Twoja: {myShift ? format(parseISO(myShift.shift_date), 'EEEE d MMM', { locale: pl }) : '?'}
                        </div>
                        {sr.message && <div className="text-xs text-gray-400 mt-1 italic">{sr.message}</div>}
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => acceptSwap(sr.id)}
                            className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold">
                            Akceptuje
                          </button>
                          <button onClick={() => rejectSwap(sr.id)}
                            className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold">
                            Odrzucam
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Admin: pending swaps to approve */}
            {isAdmin && pendingSwapsForAdmin.length > 0 && (
              <div className="card border-2 border-blue-300">
                <h3 className="font-bold text-sm mb-2 text-blue-800">Zamiany do zatwierdzenia ({pendingSwapsForAdmin.length})</h3>
                <div className="space-y-2">
                  {pendingSwapsForAdmin.map(sr => {
                    const requester = workers.find(w => w.id === sr.requester_id)
                    const target = workers.find(w => w.id === sr.target_id)
                    const shiftA = shifts.find(s => s.id === sr.requester_shift_id)
                    const shiftB = shifts.find(s => s.id === sr.target_shift_id)
                    return (
                      <div key={sr.id} className="bg-blue-50 p-3 rounded-xl">
                        <div className="text-sm">
                          <b>{requester?.full_name}</b>
                          {' '}({shiftA ? format(parseISO(shiftA.shift_date), 'd MMM', { locale: pl }) : '?'})
                          {' \u2194 '}
                          <b>{target?.full_name}</b>
                          {' '}({shiftB ? format(parseISO(shiftB.shift_date), 'd MMM', { locale: pl }) : '?'})
                        </div>
                        <div className="text-xs text-green-600 font-bold mt-1">Obaj zaakceptowali</div>
                        {sr.message && <div className="text-xs text-gray-400 italic">{sr.message}</div>}
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => approveSwap(sr.id)} disabled={saving}
                            className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                            Zatwierdz zamiane
                          </button>
                          <button onClick={() => rejectSwap(sr.id)}
                            className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold">
                            Odrzuc
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* No swaps */}
            {pendingSwapsForMe.length === 0 && pendingSwapsForAdmin.length === 0 && (isAdmin || myShifts.length === 0) && (
              <div className="card text-center py-8">
                <p className="text-gray-300 text-sm">Brak aktywnych prosb o zamiane</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: STATS                                          */}
        {/* ═══════════════════════════════════════════════════ */}
        {!loadingData && tab === 'stats' && (
          <div className="space-y-4">
            {/* Month nav */}
            <div className="card flex items-center justify-between">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-xl hover:bg-gray-100">
                <span className="text-lg">&laquo;</span>
              </button>
              <div className="font-bold capitalize text-center">
                {format(currentMonth, 'LLLL yyyy', { locale: pl })}
              </div>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-xl hover:bg-gray-100">
                <span className="text-lg">&raquo;</span>
              </button>
            </div>

            {/* Stats table */}
            <div className="card">
              <h2 className="font-bold text-sm mb-3">Statystyki miesiaca</h2>
              {monthStats.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-3">Brak danych</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 text-xs text-gray-500">
                        <th className="text-left p-2 rounded-l-lg">Pracownik</th>
                        <th className="text-center p-2">Dzial</th>
                        <th className="text-center p-2">Zmiany</th>
                        <th className="text-center p-2">Plan h</th>
                        <th className="text-center p-2 rounded-r-lg">Clock h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthStats.map(st => (
                        <tr key={st.worker_id} className="border-b border-gray-50">
                          <td className="p-2 font-medium">{st.worker_name}</td>
                          <td className="p-2 text-center">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              st.department === 'Kuchnia' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                            }`}>{st.department}</span>
                          </td>
                          <td className="p-2 text-center font-bold">{st.shifts_count}</td>
                          <td className="p-2 text-center text-gray-500">{st.total_hours.toFixed(0)}h</td>
                          <td className="p-2 text-center font-bold text-brand-600">{st.clocked_hours > 0 ? st.clocked_hours.toFixed(1) + 'h' : '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Summary */}
            {monthStats.length > 0 && (
              <div className="card grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-2xl font-bold text-brand-500">
                    {monthStats.reduce((s, m) => s + m.shifts_count, 0)}
                  </div>
                  <div className="text-xs text-gray-400">Zmian razem</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-700">
                    {monthStats.reduce((s, m) => s + m.total_hours, 0).toFixed(0)}h
                  </div>
                  <div className="text-xs text-gray-400">Planowane godziny</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {monthStats.reduce((s, m) => s + m.clocked_hours, 0).toFixed(1)}h
                  </div>
                  <div className="text-xs text-gray-400">Zarejestrowane</div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
