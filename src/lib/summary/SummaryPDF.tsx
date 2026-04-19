// ============================================================
// Monthly Summary PDF — Podsumowanie miesiąca
// Używa @react-pdf/renderer (server-side w API route)
// ============================================================

import React from 'react'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import { robotoRegular, robotoBold } from '../sanepid/fonts-embedded'

// ─── FONT — Roboto via /tmp ──
const tmpDir = path.join(os.tmpdir(), 'kitchen-ops-fonts')
const regularPath = path.join(tmpDir, 'Roboto-Regular.ttf')
const boldPath = path.join(tmpDir, 'Roboto-Bold.ttf')

try {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  if (!fs.existsSync(regularPath)) fs.writeFileSync(regularPath, Buffer.from(robotoRegular, 'base64'))
  if (!fs.existsSync(boldPath)) fs.writeFileSync(boldPath, Buffer.from(robotoBold, 'base64'))
} catch (err) {
  console.error('[SummaryPDF] Font write to /tmp failed:', err)
}

Font.register({
  family: 'Roboto',
  fonts: [
    { src: regularPath, fontWeight: 'normal' },
    { src: boldPath, fontWeight: 'bold' },
  ],
})

// ─── Types ──────────────────────────────────────────────────
export interface WorkerHoursRow {
  name: string
  hours: number
  rate: number
  cost: number
  contract: string
}

export interface IssueRow {
  title: string
  status: string
  created_at: string
}

export interface LossRow {
  item_name: string
  quantity: number
  estimated_value?: number
  created_at: string
}

export interface SummaryData {
  locationName: string
  monthLabel: string       // e.g. "Kwiecien 2026"
  generatedBy: string
  generatedAt: string
  workerHours: WorkerHoursRow[]
  issues: IssueRow[]
  losses: LossRow[]
  stats: {
    totalMeals: number
    totalShifts: number
    totalIssues: number
    totalLosses: number
  }
}

// ─── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    fontFamily: 'Roboto',
    color: '#1f2937',
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
    paddingBottom: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
    marginTop: 16,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: '#1f2937',
    marginTop: 2,
  },
  totalText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 9,
  },
  colName: { width: '35%', fontSize: 9 },
  colHours: { width: '15%', fontSize: 9, textAlign: 'right' },
  colRate: { width: '15%', fontSize: 9, textAlign: 'right' },
  colContract: { width: '15%', fontSize: 9, textAlign: 'center' },
  colCost: { width: '20%', fontSize: 9, textAlign: 'right', fontWeight: 'bold' },

  issueCol1: { width: '50%', fontSize: 9 },
  issueCol2: { width: '25%', fontSize: 9, textAlign: 'center' },
  issueCol3: { width: '25%', fontSize: 9, textAlign: 'right' },

  lossCol1: { width: '35%', fontSize: 9 },
  lossCol2: { width: '20%', fontSize: 9, textAlign: 'center' },
  lossCol3: { width: '20%', fontSize: 9, textAlign: 'right' },
  lossCol4: { width: '25%', fontSize: 9, textAlign: 'right' },

  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#9ca3af',
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  bold: { fontWeight: 'bold' },
})

// ─── Helpers ────────────────────────────────────────────────
function statusLabel(status: string): string {
  if (status === 'resolved') return 'Rozwiazana'
  if (status === 'in_progress') return 'W toku'
  return 'Nowa'
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
  } catch { return iso }
}

// ─── Component ──────────────────────────────────────────────
export function SummaryPDF({ data }: { data: SummaryData }) {
  const totalHours = data.workerHours.reduce((s, w) => s + w.hours, 0)
  const totalCost = data.workerHours.reduce((s, w) => s + w.cost, 0)
  const totalLossValue = data.losses.reduce((s, l) => s + (l.estimated_value || 0), 0)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Podsumowanie miesiaca</Text>
          <Text style={s.subtitle}>
            {data.locationName} · {data.monthLabel}
          </Text>
        </View>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <View style={s.statBox}>
            <Text style={s.statValue}>{data.stats.totalShifts}</Text>
            <Text style={s.statLabel}>Zmian</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{data.stats.totalMeals}</Text>
            <Text style={s.statLabel}>Posilkow</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{data.stats.totalIssues}</Text>
            <Text style={s.statLabel}>Usterek</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{data.stats.totalLosses}</Text>
            <Text style={s.statLabel}>Strat</Text>
          </View>
        </View>

        {/* ── Worker Hours ── */}
        <Text style={s.sectionTitle}>Godziny i koszty pracownikow</Text>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.colName, s.bold]}>Pracownik</Text>
            <Text style={[s.colHours, s.bold]}>Godziny</Text>
            <Text style={[s.colRate, s.bold]}>Stawka</Text>
            <Text style={[s.colContract, s.bold]}>Umowa</Text>
            <Text style={[s.colCost, s.bold]}>Koszt</Text>
          </View>
          {data.workerHours.map((w, i) => (
            <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={s.colName}>{w.name}</Text>
              <Text style={s.colHours}>{w.hours.toFixed(1)}h</Text>
              <Text style={s.colRate}>{w.rate} zl/h</Text>
              <Text style={s.colContract}>{w.contract}</Text>
              <Text style={s.colCost}>{w.cost} zl</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.colName, s.totalText]}>RAZEM</Text>
            <Text style={[s.colHours, s.totalText]}>{totalHours.toFixed(1)}h</Text>
            <Text style={[s.colRate, s.totalText]}></Text>
            <Text style={[s.colContract, s.totalText]}></Text>
            <Text style={[s.colCost, s.totalText]}>{totalCost} zl</Text>
          </View>
        </View>

        {/* ── Issues ── */}
        {data.issues.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Usterki ({data.issues.length})</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.issueCol1, s.bold]}>Opis</Text>
                <Text style={[s.issueCol2, s.bold]}>Status</Text>
                <Text style={[s.issueCol3, s.bold]}>Data</Text>
              </View>
              {data.issues.map((issue, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={s.issueCol1}>{issue.title}</Text>
                  <Text style={s.issueCol2}>{statusLabel(issue.status)}</Text>
                  <Text style={s.issueCol3}>{fmtDate(issue.created_at)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Losses ── */}
        {data.losses.length > 0 && (
          <>
            <Text style={s.sectionTitle}>
              Straty ({data.losses.length}){totalLossValue > 0 ? ` — lacznie ${totalLossValue.toFixed(0)} zl` : ''}
            </Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.lossCol1, s.bold]}>Produkt</Text>
                <Text style={[s.lossCol2, s.bold]}>Ilosc</Text>
                <Text style={[s.lossCol3, s.bold]}>Wartosc</Text>
                <Text style={[s.lossCol4, s.bold]}>Data</Text>
              </View>
              {data.losses.map((loss, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={s.lossCol1}>{loss.item_name}</Text>
                  <Text style={s.lossCol2}>{loss.quantity > 0 ? `${loss.quantity} szt` : '-'}</Text>
                  <Text style={s.lossCol3}>{loss.estimated_value ? `${loss.estimated_value.toFixed(2)} zl` : '-'}</Text>
                  <Text style={s.lossCol4}>{fmtDate(loss.created_at)}</Text>
                </View>
              ))}
              {totalLossValue > 0 && (
                <View style={s.totalRow}>
                  <Text style={[s.lossCol1, s.totalText]}>RAZEM</Text>
                  <Text style={[s.lossCol2, s.totalText]}></Text>
                  <Text style={[s.lossCol3, s.totalText]}>{totalLossValue.toFixed(0)} zl</Text>
                  <Text style={[s.lossCol4, s.totalText]}></Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>KitchenOps · {data.locationName}</Text>
          <Text>Wygenerowano: {data.generatedAt} · {data.generatedBy}</Text>
        </View>
      </Page>
    </Document>
  )
}
