// ============================================================
// Sanepid Compliance — logika liczenia świateł 🟢🟡🔴
// ============================================================

export type ComplianceStatus = 'ok' | 'warn' | 'fail'

export interface SanepidData {
  fromDate: string              // ISO YYYY-MM-DD
  toDate: string                // ISO YYYY-MM-DD
  locationName: string
  tempLogs: Array<{
    log_date: string
    record_time: string | null
    shift_type: string | null
    recorded_by_name?: string | null
  }>
  tempReadings: Array<{
    log_id: string
    unit_name: string
    unit_type: string | null
    temperature: number
    temp_min: number | null
    temp_max: number | null
    is_ok: boolean
    is_out_of_range: boolean
    corrective_action: string | null
    log_date: string
    shift_type: string | null
  }>
  cleaningLogs: Array<{
    log_date: string
    week_number: number
    author_name?: string | null
    status: string | null
  }>
  cleaningEntries: Array<{
    log_id: string
    task_name: string
    task_category: string | null
    is_completed: boolean
    completed_at: string | null
    log_date: string
  }>
  losses: Array<{
    created_at: string
    reporter_name: string | null
    product_name: string
    product_category: string | null
    quantity: number
    unit: string | null
    reason: string | null
    estimated_value: number | null
    fault_person_name: string | null
  }>
}

export interface ComplianceSummary {
  daysInRange: number
  temp: {
    status: ComplianceStatus
    totalReadings: number
    expectedReadings: number
    outOfRange: number
    outOfRangeWithoutAction: number
    morningCount: number
    eveningCount: number
    note: string
  }
  cleaning: {
    status: ComplianceStatus
    blocksCount: number
    tasksDone: number
    tasksTotal: number
    pct: number
    note: string
  }
  losses: {
    totalCount: number
    totalValue: number
    byPerson: Record<string, { count: number; value: number }>
  }
  overall: ComplianceStatus
}

const dayMs = 24 * 60 * 60 * 1000

export function analyzeCompliance(d: SanepidData): ComplianceSummary {
  const from = new Date(d.fromDate)
  const to = new Date(d.toDate)
  const daysInRange = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs) + 1)

  // ---------- TEMPERATURY ----------
  const outOfRange = d.tempReadings.filter(r => r.is_out_of_range).length
  const outOfRangeWithoutAction = d.tempReadings.filter(
    r => r.is_out_of_range && (!r.corrective_action || r.corrective_action.trim() === '')
  ).length

  const morningCount = d.tempLogs.filter(l =>
    (l.shift_type || '').toLowerCase().includes('morning') ||
    (l.shift_type || '').toLowerCase().includes('poran')
  ).length
  const eveningCount = d.tempLogs.filter(l =>
    (l.shift_type || '').toLowerCase().includes('evening') ||
    (l.shift_type || '').toLowerCase().includes('wiecz')
  ).length

  // Oczekiwane: 2 zmiany/dzień × dni
  const expectedLogs = daysInRange * 2
  const logCoverage = expectedLogs > 0 ? (d.tempLogs.length / expectedLogs) : 0

  let tempStatus: ComplianceStatus = 'ok'
  if (outOfRangeWithoutAction > 0 || logCoverage < 0.7) tempStatus = 'fail'
  else if (outOfRange > 0 || logCoverage < 0.9) tempStatus = 'warn'

  const tempNote =
    `${d.tempLogs.length}/${expectedLogs} zmian, ` +
    `${d.tempReadings.length} pomiarów, ` +
    `${outOfRange} poza zakresem` +
    (outOfRangeWithoutAction > 0 ? ` (${outOfRangeWithoutAction} bez akcji korygującej!)` : '')

  // ---------- CZYSTOŚĆ ----------
  const tasksDone = d.cleaningEntries.filter(e => e.is_completed).length
  const tasksTotal = d.cleaningEntries.length
  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0
  const expectedBlocks = Math.ceil(daysInRange / 7)

  let cleaningStatus: ComplianceStatus = 'ok'
  if (pct < 80 || d.cleaningLogs.length < expectedBlocks * 0.5) cleaningStatus = 'fail'
  else if (pct < 95 || d.cleaningLogs.length < expectedBlocks) cleaningStatus = 'warn'

  const cleaningNote = `${d.cleaningLogs.length}/${expectedBlocks} checklistów, ${pct}% wykonania (${tasksDone}/${tasksTotal})`

  // ---------- STRATY ----------
  const totalValue = d.losses.reduce((sum, l) => sum + (l.estimated_value || 0), 0)
  const byPerson: Record<string, { count: number; value: number }> = {}
  d.losses.forEach(l => {
    const key = l.fault_person_name || l.reporter_name || 'Nieznany'
    if (!byPerson[key]) byPerson[key] = { count: 0, value: 0 }
    byPerson[key].count += 1
    byPerson[key].value += l.estimated_value || 0
  })

  // ---------- OVERALL ----------
  let overall: ComplianceStatus = 'ok'
  if (tempStatus === 'fail' || cleaningStatus === 'fail') overall = 'fail'
  else if (tempStatus === 'warn' || cleaningStatus === 'warn') overall = 'warn'

  return {
    daysInRange,
    temp: {
      status: tempStatus,
      totalReadings: d.tempReadings.length,
      expectedReadings: expectedLogs,
      outOfRange,
      outOfRangeWithoutAction,
      morningCount,
      eveningCount,
      note: tempNote,
    },
    cleaning: {
      status: cleaningStatus,
      blocksCount: d.cleaningLogs.length,
      tasksDone,
      tasksTotal,
      pct,
      note: cleaningNote,
    },
    losses: {
      totalCount: d.losses.length,
      totalValue,
      byPerson,
    },
    overall,
  }
}

export function statusEmoji(s: ComplianceStatus): string {
  return s === 'ok' ? '🟢 OK' : s === 'warn' ? '🟡 Uwaga' : '🔴 Braki'
}

export function statusLabel(s: ComplianceStatus): string {
  return s === 'ok' ? 'ZGODNY' : s === 'warn' ? 'UWAGI' : 'NIEZGODNY'
}
