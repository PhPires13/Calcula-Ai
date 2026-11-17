import { useMemo, useState } from 'react'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { PointValue, SeriesPoint } from '../lib/calc'
import { DateInput } from './inputs'
import { formatBR, formatShort } from '../lib/dates'
import { formatBRL, formatCompactBRL } from '../lib/format'

ChartJS.register(BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip)

type SeriesKey = 'total' | 'interest' | 'invested'
type Visible = Record<SeriesKey, boolean>

interface Palette {
  total: string
  interest: string
  invested: string
  projection: string
  grid: string
  gridSoft: string
  accent: string
  text: string
  muted: string
  surface: string
  shade: string
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return {
    total: v('--series-1'),
    interest: v('--series-2'),
    invested: v('--series-3'),
    projection: v('--projection'),
    grid: v('--grid'),
    gridSoft: v('--grid-soft'),
    accent: v('--accent'),
    text: v('--text-secondary'),
    muted: v('--text-muted'),
    surface: v('--surface-1'),
    shade: v('--projection-shade'),
  }
}

function usePalette(): Palette {
  return useMemo(readPalette, [])
}

function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

interface MarkerOpts {
  index: number
  line: string
  shade: string
  text: string
  label: string
  /** Ponto selecionado na consulta por data (-1 = nenhum). */
  selected: number
  accent: string
}

/** Passo "redondo" (1, 2, 2,5 ou 5 × 10^n) para ter cerca de `lines` linhas de grade. */
export function niceStep(range: number, lines = 8): number {
  if (!(range > 0)) return 1
  const raw = range / lines
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  // Arredonda para o passo redondo mais próximo (e não sempre para cima), para não ficar com poucas linhas.
  const nice = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10
  return nice * mag
}

/** Sombreia a região de projeção e marca a data-alvo com uma linha vertical. */
const targetMarker: Plugin<'bar'> = {
  id: 'targetMarker',
  beforeDatasetsDraw(chart, _args, opts) {
    const o = opts as unknown as MarkerOpts
    if (o.index < 0) return
    const { ctx, chartArea, scales } = chart
    const x = scales.x.getPixelForValue(o.index)
    if (x >= chartArea.right) return
    ctx.save()
    ctx.fillStyle = o.shade
    ctx.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top)
    ctx.restore()
  },
  afterDatasetsDraw(chart, _args, opts) {
    const o = opts as unknown as MarkerOpts
    const { ctx, chartArea, scales } = chart
    if (o.selected >= 0) {
      const sx = Math.round(scales.x.getPixelForValue(o.selected)) + 0.5
      ctx.save()
      ctx.strokeStyle = o.accent
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(sx, chartArea.top)
      ctx.lineTo(sx, chartArea.bottom)
      ctx.stroke()
      ctx.restore()
    }
    if (o.index < 0) return
    const x = Math.round(scales.x.getPixelForValue(o.index)) + 0.5
    ctx.save()
    ctx.strokeStyle = o.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, chartArea.top)
    ctx.lineTo(x, chartArea.bottom)
    ctx.stroke()
    ctx.fillStyle = o.text
    ctx.font = '500 11px system-ui, sans-serif'
    const w = ctx.measureText(o.label).width
    const right = x + 6 + w < chartArea.right
    ctx.textAlign = right ? 'left' : 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(o.label, right ? x + 6 : x - 6, chartArea.top + 4)
    ctx.restore()
  },
}

const DEFAULT_LABELS: Record<SeriesKey, string> = {
  total: 'Total',
  interest: 'Juros',
  invested: 'Aportes',
}

const PROJECTION_OPTIONS: [number, string][] = [
  [0, 'Nenhuma'],
  [6, '6 meses'],
  [12, '1 ano'],
  [24, '2 anos'],
  [60, '5 anos'],
  [120, '10 anos'],
]

interface Props {
  series: SeriesPoint[]
  targetDate: string
  /** Consulta de valores em uma data qualquer. */
  valueOn: (date: string) => PointValue
  selectedDate: string
  onSelectDate: (date: string) => void
  /** Ausente = sem seletor de projeção. */
  projectionMonths?: number
  onProjectionChange?: (months: number) => void
  /** Nomes das séries (padrão: Total / Juros / Aportes). */
  labels?: Partial<Record<SeriesKey, string>>
}

export function GrowthChart({
  series,
  targetDate,
  valueOn,
  selectedDate,
  onSelectDate,
  projectionMonths,
  onProjectionChange,
  labels,
}: Props) {
  const palette = usePalette()
  const LABELS = { ...DEFAULT_LABELS, ...labels }
  const [visible, setVisible] = useState<Visible>({ total: true, interest: true, invested: true })
  const toggle = (k: keyof Visible) => setVisible((v) => ({ ...v, [k]: !v[k] }))

  const points = series
  const hasProjection = series.some((p) => p.projected)
  const targetIndex = points.findIndex((p) => p.date === targetDate)
  // Ponto do gráfico mais próximo da data consultada (o último que não passa dela).
  const selectedIndex = useMemo(() => {
    let idx = -1
    points.forEach((p, i) => {
      if (p.date <= selectedDate) idx = i
    })
    return idx
  }, [points, selectedDate])

  // Passo da grade calculado a partir dos valores visíveis: ~8 linhas em vez de 3 ou 4.
  const yStep = useMemo(() => {
    const vals = points.flatMap((p) => [
      ...(visible.total ? [p.total] : []),
      ...(visible.interest ? [p.interest] : []),
      ...(visible.invested ? [p.invested] : []),
      0,
    ])
    return niceStep(Math.max(...vals) - Math.min(...vals))
  }, [points, visible])

  const data = useMemo<ChartData<'bar' | 'line', number[], string>>(() => {
    const isProj = (i: number) => points[i]?.projected
    const lineSegment = (color: string) => ({
      borderColor: (ctx: { p1DataIndex: number }) => (isProj(ctx.p1DataIndex) ? palette.projection : color),
      borderDash: (ctx: { p1DataIndex: number }) => (isProj(ctx.p1DataIndex) ? [5, 4] : undefined),
    })
    const lineDataset = (key: 'interest' | 'invested', color: string, order: number) => ({
      type: 'line' as const,
      label: LABELS[key],
      data: points.map((p) => p[key]),
      hidden: !visible[key],
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      borderCapStyle: 'round' as const,
      borderJoinStyle: 'round' as const,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: palette.surface,
      pointHoverBackgroundColor: points.map((p) => (p.projected ? palette.projection : color)),
      tension: 0.15,
      segment: lineSegment(color),
      order,
    })
    return {
      labels: points.map((p) => formatShort(p.date)),
      datasets: [
        lineDataset('interest', palette.interest, 1),
        lineDataset('invested', palette.invested, 2),
        {
          type: 'bar' as const,
          label: LABELS.total,
          data: points.map((p) => p.total),
          hidden: !visible.total,
          backgroundColor: points.map((p) =>
            p.projected ? withAlpha(palette.projection, 0.55) : p.estimated ? withAlpha(palette.total, 0.5) : palette.total,
          ),
          hoverBackgroundColor: points.map((p) => (p.projected ? palette.projection : palette.total)),
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: 'start' as const,
          maxBarThickness: 24,
          categoryPercentage: 0.9,
          barPercentage: 0.85,
          order: 3,
        },
      ],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, palette, visible, labels])

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      onClick: (e, _els, chart) => {
        // Usa a posição horizontal do clique: funciona em qualquer altura, mesmo fora das barras.
        if (e.x == null) return
        const idx = Math.round(chart.scales.x.getValueForPixel(e.x) ?? -1)
        const p = points[Math.max(0, Math.min(points.length - 1, idx))]
        if (p) onSelectDate(p.date)
      },
      onHover: (e, els) => {
        const el = e.native?.target as HTMLElement | undefined
        if (el) el.style.cursor = els.length ? 'pointer' : 'default'
      },
      layout: { padding: { top: 8 } },
      scales: {
        x: {
          grid: { color: palette.gridSoft, drawTicks: false },
          border: { color: palette.grid },
          ticks: { color: palette.text, maxRotation: 0, autoSkip: true, autoSkipPadding: 16, font: { size: 11 } },
        },
        y: {
          grid: { color: palette.grid },
          border: { display: false },
          ticks: {
            color: palette.text,
            font: { size: 11 },
            callback: (v) => formatCompactBRL(Number(v)),
            stepSize: yStep,
            maxTicksLimit: 14,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: palette.surface,
          titleColor: palette.text,
          bodyColor: palette.text,
          borderColor: palette.grid,
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            title: (items) => {
              const p = points[items[0]?.dataIndex ?? 0]
              if (!p) return ''
              const tag = p.projected ? ' · projeção' : p.estimated ? ' · estimado' : p.date === targetDate ? ' · data-alvo' : ''
              return formatBR(p.date) + tag
            },
            label: (item) => ` ${item.dataset.label}: ${formatBRL(Number(item.raw))}`,
          },
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
        },
        targetMarker: {
          index: hasProjection ? targetIndex : -1,
          line: palette.muted,
          shade: palette.shade,
          text: palette.muted,
          label: 'Projeção',
          selected: selectedIndex,
          accent: palette.accent,
        } satisfies MarkerOpts,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [palette, points, targetDate, targetIndex, hasProjection, selectedIndex, yStep],
  )

  if (series.length < 2) {
    return (
      <section className="card chart-card">
        <h2>Evolução</h2>
        <p className="empty">Adicione aportes para ver o gráfico.</p>
      </section>
    )
  }

  const chip = (key: keyof Visible, swatch: 'bar' | 'line', color: string) => (
    <button key={key} className="chip" aria-pressed={visible[key]} onClick={() => toggle(key)}>
      <span className={`swatch ${swatch}`} style={{ '--c': color } as React.CSSProperties} aria-hidden />
      {LABELS[key]}
    </button>
  )

  return (
    <section className="card chart-card">
      <div className="card-head">
        <div className="chips" role="group" aria-label="Séries do gráfico">
          {chip('total', 'bar', palette.total)}
          {chip('interest', 'line', palette.interest)}
          {chip('invested', 'line', palette.invested)}
        </div>
        {projectionMonths !== undefined && onProjectionChange && (
          <label className="inline-select">
            Projeção
            <select value={projectionMonths} onChange={(e) => onProjectionChange(Number(e.target.value))}>
              {PROJECTION_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ValueQuery value={valueOn(selectedDate)} labels={LABELS} onDate={onSelectDate} palette={palette} />
      <div className="chart-box">
        <Chart type="bar" data={data as ChartData<'bar'>} options={options} plugins={[targetMarker]} />
      </div>
    </section>
  )
}

interface QueryProps {
  value: PointValue
  labels: Record<SeriesKey, string>
  onDate: (d: string) => void
  palette: Palette
}

/** Mostra saldo, aportes líquidos e juros em uma data escolhida (digitada ou clicada no gráfico). */
function ValueQuery({ value, labels, onDate, palette }: QueryProps) {
  const tag = value.projected ? 'projeção' : value.estimated ? 'estimado' : null
  const item = (label: string, v: number, color: string, kind: 'bar' | 'line', strong = false) => (
    <span className={`q-item ${strong ? 'strong' : ''}`}>
      <span className={`swatch ${kind}`} style={{ '--c': color } as React.CSSProperties} aria-hidden />
      <span className="q-label">{label}</span>
      <span className={`q-value ${v < -0.005 ? 'negative' : ''}`}>{formatBRL(v)}</span>
    </span>
  )
  return (
    <div className="value-query" aria-live="polite">
      <span className="inline-field">
        <span>Valores em</span>
        <DateInput value={value.date} onChange={onDate} ariaLabel="Data para consultar valores" />
      </span>
      {item(labels.total, value.total, palette.total, 'bar', true)}
      {item(labels.invested, value.net, palette.invested, 'line')}
      {item(labels.interest, value.interest, palette.interest, 'line')}
      {tag && <span className="q-tag">{tag}</span>}
      <span className="q-hint">ou clique no gráfico</span>
    </div>
  )
}
