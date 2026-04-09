// ============================================================
// Sanepid PDF — komponent raportu HACCP
// Używa @react-pdf/renderer (działa w API route po stronie serwera)
// ============================================================

import React from 'react'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { SanepidData, ComplianceSummary } from './compliance'
import { statusLabel } from './compliance'
import { robotoRegular, robotoBold } from './fonts-embedded'

// ─── FONT — Roboto via /tmp ──
// @react-pdf/renderer w trybie server traktuje `src` jako ścieżkę pliku.
// Na Vercel lambda public/ nie istnieje, ale /tmp jest writable.
// Rozwiązanie: base64 z fonts-embedded.ts → zapisujemy do /tmp raz → Font.register z tej ścieżki.
const tmpDir = path.join(os.tmpdir(), 'kitchen-ops-fonts')
const regularPath = path.join(tmpDir, 'Roboto-Regular.ttf')
const boldPath = path.join(tmpDir, 'Roboto-Bold.ttf')

try {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  if (!fs.existsSync(regularPath)) fs.writeFileSync(regularPath, Buffer.from(robotoRegular, 'base64'))
  if (!fs.existsSync(boldPath)) fs.writeFileSync(boldPath, Buffer.from(robotoBold, 'base64'))
} catch (err) {
  console.error('[SanepidPDF] Font write to /tmp failed:', err)
}

Font.register({
  family: 'Roboto',
  fonts: [
    { src: regularPath, fontWeight: 'normal' },
    { src: boldPath, fontWeight: 'bold' },
  ],
})

// ─── STYLES ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: 'Roboto',
    color: '#1f2937',
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
    paddingBottom: 10,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    fontSize: 8,
    color: '#64748b',
  },
  h1: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 3,
  },
  p: {
    marginBottom: 3,
    lineHeight: 1.4,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  statusOk: { backgroundColor: '#ecfdf5', borderLeftWidth: 4, borderLeftColor: '#10b981' },
  statusWarn: { backgroundColor: '#fef3c7', borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  statusFail: { backgroundColor: '#fee2e2', borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  statusText: { fontSize: 14, fontWeight: 'bold' },
  statusTextOk: { color: '#065f46' },
  statusTextWarn: { color: '#92400e' },
  statusTextFail: { color: '#991b1b' },
  table: { marginTop: 4, marginBottom: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 3 },
  th: { flexDirection: 'row', backgroundColor: '#0f172a', paddingVertical: 4, paddingHorizontal: 3 },
  thText: { color: '#ffffff', fontSize: 8, fontWeight: 'bold' },
  td: { fontSize: 8, paddingHorizontal: 3 },
  signatureSection: {
    marginTop: 22,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
  },
  signLine: {
    marginTop: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#64748b',
    width: 220,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#94a3b8',
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 5,
  },
  rowOutOfRange: { backgroundColor: '#fef2f2' },
})

// ─── HELPERS ─────────────────────────────────────────────────
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fmtMoney = (n: number) => `${n.toFixed(2)} PLN`

// ─── COMPONENT ───────────────────────────────────────────────
interface Props {
  data: SanepidData
  compliance: ComplianceSummary
  reportId: string
  generatedAt: string        // ISO
  generatedByName: string
}

export const SanepidPDF: React.FC<Props> = ({ data, compliance, reportId, generatedAt, generatedByName }) => {
  const statusStyle =
    compliance.overall === 'ok' ? styles.statusOk :
    compliance.overall === 'warn' ? styles.statusWarn :
    styles.statusFail
  const statusTextStyle =
    compliance.overall === 'ok' ? styles.statusTextOk :
    compliance.overall === 'warn' ? styles.statusTextWarn :
    styles.statusTextFail

  // Grupuj pomiary wg log_date + shift dla czytelności
  const readingsByLog = data.tempReadings.slice(0, 80)
  const cleaningByBlock = data.cleaningEntries.slice(0, 100)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.title}>RAPORT HACCP / SANEPID</Text>
          <Text style={styles.subtitle}>{data.locationName}</Text>
          <View style={styles.metaRow}>
            <Text>Nr raportu: {reportId}</Text>
            <Text>Okres: {fmtDate(data.fromDate)} — {fmtDate(data.toDate)}</Text>
            <Text>Wygenerowano: {fmtDateTime(generatedAt)}</Text>
          </View>
        </View>

        {/* STATUS OVERALL */}
        <View style={[styles.statusBox, statusStyle]}>
          <Text style={[styles.statusText, statusTextStyle]}>
            STATUS ZGODNOŚCI: {statusLabel(compliance.overall)}
          </Text>
        </View>

        {/* 1. PODSUMOWANIE */}
        <Text style={styles.h1}>1. Podsumowanie zgodności</Text>
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={[styles.thText, { flex: 2 }]}>Obszar</Text>
            <Text style={[styles.thText, { flex: 1 }]}>Status</Text>
            <Text style={[styles.thText, { flex: 4 }]}>Szczegóły</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, { flex: 2 }]}>Monitoring temperatur</Text>
            <Text style={[styles.td, { flex: 1, fontWeight: 'bold' }]}>{statusLabel(compliance.temp.status)}</Text>
            <Text style={[styles.td, { flex: 4 }]}>{compliance.temp.note}</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, { flex: 2 }]}>Czystość i sanitacja</Text>
            <Text style={[styles.td, { flex: 1, fontWeight: 'bold' }]}>{statusLabel(compliance.cleaning.status)}</Text>
            <Text style={[styles.td, { flex: 4 }]}>{compliance.cleaning.note}</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, { flex: 2 }]}>Straty produktowe</Text>
            <Text style={[styles.td, { flex: 1 }]}>informacyjnie</Text>
            <Text style={[styles.td, { flex: 4 }]}>
              {compliance.losses.totalCount} incydentów, wartość: {fmtMoney(compliance.losses.totalValue)}
            </Text>
          </View>
        </View>

        {/* 2. TEMPERATURY */}
        <Text style={styles.h1}>2. Monitoring temperatur urządzeń chłodniczych</Text>
        <Text style={styles.p}>Okres: {compliance.daysInRange} dni • Liczba zmian: {data.tempLogs.length} (Poranna: {compliance.temp.morningCount}, Wieczorna: {compliance.temp.eveningCount})</Text>
        <Text style={styles.p}>Liczba pomiarów: {compliance.temp.totalReadings} • Poza zakresem: {compliance.temp.outOfRange}{compliance.temp.outOfRangeWithoutAction > 0 ? ` (${compliance.temp.outOfRangeWithoutAction} bez akcji korygującej)` : ''}</Text>

        {readingsByLog.length > 0 && (
          <View style={styles.table}>
            <View style={styles.th}>
              <Text style={[styles.thText, { flex: 1.3 }]}>Data</Text>
              <Text style={[styles.thText, { flex: 1 }]}>Zmiana</Text>
              <Text style={[styles.thText, { flex: 2.3 }]}>Urządzenie</Text>
              <Text style={[styles.thText, { flex: 0.9 }]}>Temp.</Text>
              <Text style={[styles.thText, { flex: 1.1 }]}>Norma</Text>
              <Text style={[styles.thText, { flex: 2.4 }]}>Akcja korygująca</Text>
            </View>
            {readingsByLog.map((r, i) => {
              const norma = (r.temp_min != null && r.temp_max != null)
                ? `${r.temp_min}—${r.temp_max}°C`
                : '-'
              const shift = r.shift_type === 'morning' ? 'Poranna'
                          : r.shift_type === 'evening' ? 'Wieczorna'
                          : (r.shift_type || '-')
              const akcja = r.is_out_of_range
                ? (r.corrective_action && r.corrective_action.trim() ? r.corrective_action : 'BRAK AKCJI')
                : 'OK'
              return (
                <View key={i} style={[styles.tr, r.is_out_of_range ? styles.rowOutOfRange : {}]}>
                  <Text style={[styles.td, { flex: 1.3 }]}>{fmtDate(r.log_date)}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{shift}</Text>
                  <Text style={[styles.td, { flex: 2.3 }]}>{r.unit_name}</Text>
                  <Text style={[styles.td, { flex: 0.9 }]}>{r.temperature.toFixed(1)}°C</Text>
                  <Text style={[styles.td, { flex: 1.1 }]}>{norma}</Text>
                  <Text style={[styles.td, { flex: 2.4 }]}>{akcja}</Text>
                </View>
              )
            })}
          </View>
        )}
        {data.tempReadings.length > 80 && (
          <Text style={[styles.p, { color: '#64748b' }]}>
            ...pokazano 80 z {data.tempReadings.length} pomiarów. Pełne dane w systemie Kitchen Ops.
          </Text>
        )}

        {/* 3. CZYSTOŚĆ */}
        <Text style={styles.h1}>3. Czystość i sanitacja (HACCP)</Text>
        <Text style={styles.p}>Liczba checklistów: {compliance.cleaning.blocksCount} • Zadania wykonane: {compliance.cleaning.tasksDone}/{compliance.cleaning.tasksTotal} ({compliance.cleaning.pct}%)</Text>

        {cleaningByBlock.length > 0 && (
          <View style={styles.table}>
            <View style={styles.th}>
              <Text style={[styles.thText, { flex: 1.3 }]}>Data</Text>
              <Text style={[styles.thText, { flex: 4.5 }]}>Zadanie</Text>
              <Text style={[styles.thText, { flex: 1.5 }]}>Kategoria</Text>
              <Text style={[styles.thText, { flex: 1 }]}>Status</Text>
              <Text style={[styles.thText, { flex: 1.5 }]}>Wykonano</Text>
            </View>
            {cleaningByBlock.map((e, i) => (
              <View key={i} style={[styles.tr, !e.is_completed ? styles.rowOutOfRange : {}]}>
                <Text style={[styles.td, { flex: 1.3 }]}>{fmtDate(e.log_date)}</Text>
                <Text style={[styles.td, { flex: 4.5 }]}>{e.task_name}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{e.task_category || '-'}</Text>
                <Text style={[styles.td, { flex: 1, fontWeight: 'bold' }]}>{e.is_completed ? 'OK' : 'BRAK'}</Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{e.completed_at ? fmtDateTime(e.completed_at) : '-'}</Text>
              </View>
            ))}
          </View>
        )}
        {data.cleaningEntries.length > 100 && (
          <Text style={[styles.p, { color: '#64748b' }]}>
            ...pokazano 100 z {data.cleaningEntries.length} wpisów.
          </Text>
        )}

        {/* 4. STRATY */}
        {data.losses.length > 0 && (
          <>
            <Text style={styles.h1}>4. Rejestr strat produktowych</Text>
            <Text style={styles.p}>Liczba: {compliance.losses.totalCount} • Łączna wartość: {fmtMoney(compliance.losses.totalValue)}</Text>
            <View style={styles.table}>
              <View style={styles.th}>
                <Text style={[styles.thText, { flex: 1.3 }]}>Data</Text>
                <Text style={[styles.thText, { flex: 2.5 }]}>Produkt</Text>
                <Text style={[styles.thText, { flex: 1 }]}>Ilość</Text>
                <Text style={[styles.thText, { flex: 2 }]}>Powód</Text>
                <Text style={[styles.thText, { flex: 1.5 }]}>Winowajca</Text>
                <Text style={[styles.thText, { flex: 1 }]}>Wartość</Text>
              </View>
              {data.losses.slice(0, 50).map((l, i) => (
                <View key={i} style={styles.tr}>
                  <Text style={[styles.td, { flex: 1.3 }]}>{fmtDate(l.created_at)}</Text>
                  <Text style={[styles.td, { flex: 2.5 }]}>{l.product_name}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{l.quantity} {l.unit || ''}</Text>
                  <Text style={[styles.td, { flex: 2 }]}>{l.reason || '-'}</Text>
                  <Text style={[styles.td, { flex: 1.5 }]}>{l.fault_person_name || '-'}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{fmtMoney(l.estimated_value || 0)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 5. OŚWIADCZENIE */}
        <View style={styles.signatureSection}>
          <Text style={styles.h1}>5. Oświadczenie</Text>
          <Text style={styles.p}>
            Niniejszym oświadczam, że dane zawarte w raporcie odzwierciedlają rzeczywisty stan
            monitoringu HACCP prowadzonego w lokalu w okresie {fmtDate(data.fromDate)} — {fmtDate(data.toDate)}.
            Wszystkie wpisy zostały zarejestrowane przez uprawnionych pracowników w systemie Kitchen Ops.
          </Text>
          <Text style={[styles.p, { marginTop: 8 }]}>Data wygenerowania: {fmtDate(generatedAt)}</Text>
          <Text style={styles.p}>Wygenerował: {generatedByName}</Text>
          <View style={styles.signLine} />
          <Text style={{ fontSize: 7, color: '#64748b', marginTop: 3 }}>
            Podpis osoby odpowiedzialnej
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          Kitchen Ops • Raport {reportId} • {data.locationName} • Wygenerowano automatycznie
        </Text>
      </Page>
    </Document>
  )
}
