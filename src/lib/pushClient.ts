// ============================================================
// Push notification client-side helpers
// Wywoływane z komponentów po akcjach (nowe zadanie, usterka itp.)
// ============================================================

export async function notifyNewTask(
  locationId: string,
  assignedToId: string,
  taskTitle: string
) {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        profileIds: [assignedToId],
        title: '📋 Nowe zadanie',
        body: taskTitle,
        url: '/tasks',
        tag: 'new-task',
      }),
    })
  } catch (err) {
    console.log('[Push] Send error:', err)
  }
}

export async function notifyNewIssue(
  locationId: string,
  issueTitle: string
) {
  try {
    // Send to all managers/owners in the location
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        title: '🔧 Nowa usterka',
        body: issueTitle,
        url: '/awarie',
        tag: 'new-issue',
      }),
    })
  } catch (err) {
    console.log('[Push] Send error:', err)
  }
}

export async function notifyTemperatureReminder(
  locationId: string,
  shift: 'morning' | 'evening'
) {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        title: '🌡️ Pomiary temperatur',
        body: shift === 'morning'
          ? 'Pora na pomiary poranne!'
          : 'Pora na pomiary wieczorne!',
        url: '/temperature',
        tag: 'temp-reminder',
      }),
    })
  } catch (err) {
    console.log('[Push] Send error:', err)
  }
}

export async function notifyWokiTalkie(
  locationId: string,
  senderName: string,
  message: string,
  profileIds?: string[]
) {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        profileIds,
        title: `📻 ${senderName}`,
        body: message.length > 100 ? message.slice(0, 100) + '...' : message,
        url: '/woki-talkie',
        tag: 'woki-talkie',
      }),
    })
  } catch (err) {
    console.log('[Push] Send error:', err)
  }
}
