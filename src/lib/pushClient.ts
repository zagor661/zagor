// ============================================================
// Push notification client-side helpers
// Wywoływane z komponentów po akcjach (nowe zadanie, usterka itp.)
// ============================================================

async function sendPush(data: {
  locationId: string
  title: string
  body: string
  url: string
  tag: string
  profileIds?: string[]
}) {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (err) {
    console.log('[Push] Send error:', err)
  }
}

// ─── Zadania ────────────────────────────────────────────────

export async function notifyNewTask(
  locationId: string,
  assignedToId: string,
  taskTitle: string
) {
  await sendPush({
    locationId,
    profileIds: [assignedToId],
    title: '📋 Nowe zadanie',
    body: taskTitle,
    url: '/tasks',
    tag: 'new-task',
  })
}

export async function notifyTaskCompleted(
  locationId: string,
  workerName: string,
  taskTitle: string
) {
  await sendPush({
    locationId,
    title: '✅ Zadanie wykonane',
    body: `${workerName} zakończył: ${taskTitle}`,
    url: '/tasks',
    tag: 'task-done',
  })
}

// ─── Usterki / Awarie ──────────────────────────────────────

export async function notifyNewIssue(
  locationId: string,
  issueTitle: string
) {
  await sendPush({
    locationId,
    title: '🔧 Nowa usterka',
    body: issueTitle,
    url: '/awarie',
    tag: 'new-issue',
  })
}

export async function notifyIssueResolved(
  locationId: string,
  issueTitle: string
) {
  await sendPush({
    locationId,
    title: '✅ Usterka naprawiona',
    body: issueTitle,
    url: '/awarie',
    tag: 'issue-resolved',
  })
}

// ─── Zmiany / Grafik ───────────────────────────────────────

export async function notifyShiftReminder(
  locationId: string,
  profileId: string,
  startTime: string,
  minutesBefore: number
) {
  await sendPush({
    locationId,
    profileIds: [profileId],
    title: '⏰ Zmiana za ' + minutesBefore + ' min',
    body: `Twoja zmiana zaczyna się o ${startTime}. Do zobaczenia!`,
    url: '/',
    tag: 'shift-reminder',
  })
}

export async function notifyShiftEndingSoon(
  locationId: string,
  profileId: string,
  endTime: string
) {
  await sendPush({
    locationId,
    profileIds: [profileId],
    title: '🏁 Zmiana kończy się niedługo',
    body: `Twoja zmiana kończy się o ${endTime}. Pamiętaj o zamknięciu.`,
    url: '/',
    tag: 'shift-ending',
  })
}

export async function notifySwapRequest(
  locationId: string,
  targetId: string,
  fromName: string,
  shiftDate: string
) {
  await sendPush({
    locationId,
    profileIds: [targetId],
    title: '🔄 Prośba o zamianę zmiany',
    body: `${fromName} chce zamienić się zmianą (${shiftDate})`,
    url: '/schedule',
    tag: 'swap-request',
  })
}

export async function notifySwapAccepted(
  locationId: string,
  requesterId: string,
  accepterName: string,
  shiftDate: string
) {
  await sendPush({
    locationId,
    profileIds: [requesterId],
    title: '✅ Zamiana zaakceptowana',
    body: `${accepterName} zaakceptował zamianę (${shiftDate})`,
    url: '/schedule',
    tag: 'swap-accepted',
  })
}

export async function notifySchedulePublished(
  locationId: string,
  month: string
) {
  await sendPush({
    locationId,
    title: '📅 Nowy grafik!',
    body: `Grafik na ${month} jest już dostępny. Sprawdź swoje zmiany.`,
    url: '/schedule',
    tag: 'schedule-published',
  })
}

// ─── Dostawy ────────────────────────────────────────────────

export async function notifyDeliveryReceived(
  locationId: string,
  supplierName: string,
  receivedBy: string
) {
  await sendPush({
    locationId,
    title: '📦 Nowa dostawa',
    body: `${receivedBy} przyjął dostawę od ${supplierName}`,
    url: '/sanepid/dostawy',
    tag: 'delivery',
  })
}

export async function notifyDeliveryIssue(
  locationId: string,
  supplierName: string,
  issue: string
) {
  await sendPush({
    locationId,
    title: '⚠️ Problem z dostawą',
    body: `${supplierName}: ${issue}`,
    url: '/sanepid/dostawy',
    tag: 'delivery-issue',
  })
}

// ─── Faktury ────────────────────────────────────────────────

export async function notifyInvoiceScanned(
  locationId: string,
  supplierName: string,
  total: string
) {
  await sendPush({
    locationId,
    title: '🧾 Faktura zeskanowana',
    body: `${supplierName} — ${total} PLN`,
    url: '/faktury',
    tag: 'invoice',
  })
}

// ─── Checklist / Sanepid ────────────────────────────────────

export async function notifyChecklistReminder(
  locationId: string,
  shift: 'open' | 'close'
) {
  await sendPush({
    locationId,
    title: shift === 'open' ? '📝 Checklist otwarcia' : '📝 Checklist zamknięcia',
    body: shift === 'open'
      ? 'Nie zapomnij wypełnić checklisty otwarcia!'
      : 'Czas na checklistę zamknięcia lokalu.',
    url: '/checklist',
    tag: 'checklist-reminder',
  })
}

export async function notifyTemperatureReminder(
  locationId: string,
  shift: 'morning' | 'evening'
) {
  await sendPush({
    locationId,
    title: '🌡️ Pomiary temperatur',
    body: shift === 'morning'
      ? 'Pora na pomiary poranne!'
      : 'Pora na pomiary wieczorne!',
    url: '/temperature',
    tag: 'temp-reminder',
  })
}

// ─── WOKI TALKIE ────────────────────────────────────────────

export async function notifyWokiTalkie(
  locationId: string,
  senderName: string,
  message: string,
  profileIds?: string[]
) {
  await sendPush({
    locationId,
    profileIds,
    title: `📻 ${senderName}`,
    body: message.length > 100 ? message.slice(0, 100) + '...' : message,
    url: '/woki-talkie',
    tag: 'woki-talkie',
  })
}

// ─── Clock / Przerwy ────────────────────────────────────────

export async function notifyBreakOverLimit(
  locationId: string,
  profileId: string,
  workerName: string,
  minutes: number
) {
  await sendPush({
    locationId,
    title: '⚠️ Przerwa przekroczona',
    body: `${workerName} — przerwa trwa już ${minutes} min`,
    url: '/',
    tag: 'break-over',
  })
}

export async function notifyClockInMissing(
  locationId: string,
  profileId: string,
  startTime: string
) {
  await sendPush({
    locationId,
    profileIds: [profileId],
    title: '🔴 Nie odbito zmiany!',
    body: `Twoja zmiana zaczęła się o ${startTime}, ale nie rozpocząłeś zmiany w apce.`,
    url: '/',
    tag: 'clock-missing',
  })
}
