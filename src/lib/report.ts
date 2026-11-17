import { Chart } from 'chart.js'
import type { Calculation, RatesData } from './types'
import { defaultProjection, type CalculationResult } from './calc'
import { formatBR, formatMonthKey, todayISO } from './dates'
import { formatBRL, formatNum, formatPct } from './format'

const INK = [17, 20, 24] as const
const MUTED = [110, 116, 128] as const
const ACCENT = [42, 120, 214] as const
const RED = [196, 60, 60] as const
const TILE = [241, 243, 245] as const

export function rateDescription(c: Calculation): string {
  const r = c.rate
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
  if (r.index === 'IPCA') return r.ipcaSpread ? `IPCA + ${n(r.ipcaSpread)}% a.a.` : 'IPCA'
  if (r.index === 'CDI') return `${n(r.cdiPercent)}% do CDI`
  return `Taxa fixa de ${n(r.customRate)}% ${r.customPeriod === 'year' ? 'ao ano' : 'ao mês'}`
}

/** A fonte padrão do PDF (WinAnsi) não tem alguns símbolos: troca pelos equivalentes. */
const pdfText = (t: string) => t.replace(/\u2212/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')

interface LegendItem {
  label: string
  kind: 'bar' | 'line' | 'dash'
  color: string
}

/** Itens de legenda a partir das séries visíveis no gráfico (mesmas cores e nomes da tela). */
function legendItems(chart: Chart | undefined, canvas: HTMLCanvasElement, hasProjection: boolean): LegendItem[] {
  const css = getComputedStyle(canvas)
  const cssVar = (n: string) => css.getPropertyValue(n).trim() || '#888888'
  const items: LegendItem[] = []
  chart?.data.datasets.forEach((ds, i) => {
    if (!chart.isDatasetVisible(i)) return
    const isBar = (ds as { type?: string }).type === 'bar'
    const color = isBar ? cssVar('--series-1') : typeof ds.borderColor === 'string' ? ds.borderColor : '#888888'
    items.push({ label: ds.label ?? '', kind: isBar ? 'bar' : 'line', color })
  })
  // Barras antes das linhas, como na tela.
  items.sort((a, b) => (a.kind === 'bar' ? -1 : 0) - (b.kind === 'bar' ? -1 : 0))
  if (hasProjection) items.push({ label: 'Projeção (taxa estimada)', kind: 'dash', color: cssVar('--projection') })
  return items
}

function drawLegend(doc: import('jspdf').jsPDF, items: LegendItem[], x0: number, y: number, maxW: number) {
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK)
  let x = x0
  for (const it of items) {
    const w = 6 + doc.getTextWidth(pdfText(it.label)) + 7
    if (x + w > x0 + maxW) {
      x = x0
      y += 5
    }
    doc.setFillColor(it.color).setDrawColor(it.color)
    if (it.kind === 'bar') {
      doc.roundedRect(x, y - 2.6, 3, 3, 0.5, 0.5, 'F')
    } else {
      doc.setLineWidth(0.6)
      if (it.kind === 'dash') doc.setLineDashPattern([0.9, 0.7], 0)
      doc.line(x, y - 1.1, x + 4, y - 1.1)
      doc.setLineDashPattern([], 0)
    }
    doc.text(pdfText(it.label), x + 6, y)
    x += w
  }
}

function fileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `${slug || 'calculo'}.pdf`
}

/** Gera e baixa um relatório PDF do cálculo atual (parâmetros, resumo, gráfico e tabelas). */
export async function exportPdf(
  calc: Calculation,
  result: CalculationResult,
  rates: RatesData,
  chartCanvas: HTMLCanvasElement | null,
) {
  const doc = await buildPdf(calc, result, rates, chartCanvas)
  doc.save(fileName(calc.name))
}

export async function buildPdf(
  calc: Calculation,
  result: CalculationResult,
  rates: RatesData,
  chartCanvas: HTMLCanvasElement | null,
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 16
  const contentW = W - 2 * M
  let y = M + 4

  const ensureSpace = (h: number) => {
    if (y + h > H - 18) {
      doc.addPage()
      y = M
    }
  }
  const sectionTitle = (text: string) => {
    ensureSpace(14)
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK)
    doc.text(text, M, y)
    y += 4
  }

  // ---- Cabeçalho
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK)
  doc.text(pdfText(calc.name || 'Cálculo'), M, y)
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  doc.text(`Relatório gerado em ${formatBR(todayISO())} · Calcula Aí`, M, y)
  y += 8

  // ---- Parâmetros
  const params: [string, string][] = [
    ['Correção', rateDescription(calc)],
    ['Corrigido até', `${formatBR(result.targetDate)}${calc.targetDate === null ? ' (hoje)' : ''}`],
  ]
  if (calc.rate.index !== 'CUSTOM') {
    const est = calc.rate.projectionRate ?? defaultProjection(calc.rate, rates)
    params.push([
      'Meses sem índice',
      `${formatNum(Math.round(est * 1000) / 1000)}% a.m. ${calc.rate.projectionRate === null ? '(média dos últimos 12 meses)' : '(informado)'}`,
    ])
  }
  doc.setFontSize(10)
  for (const [k, v] of params) {
    doc.setFont('helvetica', 'normal').setTextColor(...MUTED)
    doc.text(k, M, y)
    doc.setTextColor(...INK)
    doc.text(v, M + 38, y)
    y += 5.5
  }
  y += 3

  // ---- Resumo (blocos)
  const tiles: { label: string; value: string; color?: readonly [number, number, number] }[] = [
    { label: `Saldo em ${formatBR(result.targetDate)}`, value: formatBRL(result.total), color: ACCENT },
    { label: 'Aportado', value: formatBRL(result.invested) },
  ]
  if (result.withdrawn > 0) tiles.push({ label: 'Retirado', value: formatBRL(result.withdrawn) })
  tiles.push({ label: `Juros (${formatPct(result.returnPct)})`, value: formatBRL(result.interest) })
  if (result.finalBalance !== null && result.plannedWithdrawals > 0) {
    const short = result.finalBalance < -0.005
    tiles.push({
      label: `${short ? 'Falta' : 'Sobra'} após retiradas (${formatBR(result.finalDate!)})`,
      value: formatBRL(Math.abs(result.finalBalance)),
      color: short ? RED : undefined,
    })
  }
  const perRow = Math.min(tiles.length, 3)
  const gap = 4
  const tileW = (contentW - gap * (perRow - 1)) / perRow
  const tileH = 17
  tiles.forEach((t, i) => {
    const col = i % perRow
    if (col === 0 && i > 0) y += tileH + gap
    const x = M + col * (tileW + gap)
    doc.setFillColor(...TILE)
    doc.roundedRect(x, y, tileW, tileH, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    doc.text(t.label, x + 4, y + 6, { maxWidth: tileW - 8 })
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...(t.color ?? INK))
    doc.text(t.value, x + 4, y + 13.5)
  })
  y += tileH + 6

  if (result.estimatedMonths.length > 0) {
    const est = result.estimatedMonths
    const months = est.length <= 3 ? est.map(formatMonthKey).join(', ') : `${formatMonthKey(est[0])} a ${formatMonthKey(est[est.length - 1])}`
    doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...MUTED)
    doc.text(`* Meses sem índice publicado (${months}) foram calculados com a taxa estimada.`, M, y)
    y += 7
  }

  // ---- Gráfico
  if (chartCanvas && result.series.length > 1) {
    // Desenha o estado final sem animação (uma animação em andamento deixaria o gráfico incompleto).
    const chart = Chart.getChart(chartCanvas)
    chart?.stop()
    chart?.update('none')
    // JPEG sobre fundo branco: o PNG transparente em alta resolução deixaria o PDF com vários MB.
    const flat = document.createElement('canvas')
    flat.width = chartCanvas.width
    flat.height = chartCanvas.height
    const ctx = flat.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, flat.width, flat.height)
    ctx.drawImage(chartCanvas, 0, 0)
    const img = flat.toDataURL('image/jpeg', 0.9)
    const h = Math.min(85, (contentW * chartCanvas.height) / chartCanvas.width)
    sectionTitle('Evolução')
    ensureSpace(h + 12)
    y += 1
    drawLegend(doc, legendItems(chart, chartCanvas, result.series.some((p) => p.projected)), M, y, contentW)
    y += 5
    doc.addImage(img, 'JPEG', M, y, contentW, h)
    y += h + 8
  }

  const tableStyle = {
    theme: 'plain' as const,
    margin: { left: M, right: M, bottom: 20 },
    styles: { font: 'helvetica', fontSize: 9, textColor: [...INK] as [number, number, number], cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
    headStyles: { textColor: [...MUTED] as [number, number, number], fontStyle: 'normal' as const, fontSize: 8 },
    footStyles: { fontStyle: 'bold' as const },
    showFoot: 'lastPage' as const,
    alternateRowStyles: { fillColor: [248, 249, 250] as [number, number, number] },
  }
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  // ---- Aportes
  const aportes = result.rows.filter((r) => r.contribution.amount !== null).sort((a, b) => a.contribution.date.localeCompare(b.contribution.date))
  if (aportes.length > 0) {
    sectionTitle('Aportes')
    autoTable(doc, {
      ...tableStyle,
      startY: y,
      head: [['Data', 'Valor aportado', 'Valor corrigido', 'Juros']],
      body: aportes.map((r) => [
        formatBR(r.contribution.date),
        formatBRL(r.contribution.amount!),
        r.value !== null ? formatBRL(r.value) : 'após a data',
        r.interest !== null ? formatBRL(r.interest) : '—',
      ]),
      foot: [['Total', formatBRL(result.invested), formatBRL(aportes.reduce((s, r) => s + (r.value ?? 0), 0)), formatBRL(aportes.reduce((s, r) => s + (r.interest ?? 0), 0))]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (d) => {
        if (d.column.index > 0 && d.section !== 'body') d.cell.styles.halign = 'right'
      },
    })
    y = lastY() + 10
  }

  // ---- Retiradas
  const retiradas = result.withdrawalRows
    .filter((r) => r.contribution.amount !== null)
    .sort((a, b) => a.contribution.date.localeCompare(b.contribution.date))
  if (retiradas.length > 0) {
    sectionTitle('Retiradas')
    autoTable(doc, {
      ...tableStyle,
      startY: y,
      head: [['Data', 'Valor retirado', 'Saldo após a retirada']],
      body: retiradas.map((r) => [
        formatBR(r.contribution.date) + (r.planned ? '  (planejada)' : ''),
        formatBRL(r.contribution.amount!),
        r.balanceAfter !== null ? formatBRL(r.balanceAfter) : '—',
      ]),
      foot: [['Total', formatBRL(retiradas.reduce((s, r) => s + r.contribution.amount!, 0)), '']],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: (d) => {
        if (d.column.index > 0 && d.section !== 'body') d.cell.styles.halign = 'right'
        if (d.section === 'body' && d.column.index === 2) {
          const r = retiradas[d.row.index]
          if (r.balanceAfter !== null && r.balanceAfter < -0.005) d.cell.styles.textColor = [...RED]
        }
      },
    })
  }

  // ---- Rodapé em todas as páginas
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
    doc.text(
      'Índices: Banco Central do Brasil (SGS 433 — IPCA, SGS 4391 — CDI). Capitalização mensal com pro rata die. Estimativas não são garantia de rentabilidade.',
      M,
      H - 10,
      { maxWidth: contentW - 20 },
    )
    doc.text(`${p}/${pages}`, W - M, H - 10, { align: 'right' })
  }

  return doc
}
