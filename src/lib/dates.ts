export interface YMD {
  y: number
  m: number // 1-12
  d: number
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parseDate(s: string): YMD {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

export function formatISO({ y, m, d }: YMD): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

export function todayISO(now = new Date()): string {
  return formatISO({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

export function monthKey(y: number, m: number): string {
  return `${y}-${pad(m)}`
}

/** Índice absoluto do mês (para aritmética). */
export function monthIndex(y: number, m: number): number {
  return y * 12 + (m - 1)
}

export function fromMonthIndex(i: number): { y: number; m: number } {
  return { y: Math.floor(i / 12), m: (i % 12) + 1 }
}

/** Soma meses mantendo o dia (limitado ao último dia do mês). */
export function addMonths(date: string, n: number): string {
  const { y, m, d } = parseDate(date)
  const t = fromMonthIndex(monthIndex(y, m) + n)
  return formatISO({ ...t, d: Math.min(d, daysInMonth(t.y, t.m)) })
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function formatBR(date: string): string {
  const { y, m, d } = parseDate(date)
  return `${pad(d)}/${pad(m)}/${y}`
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`
}

export function formatShort(date: string): string {
  const { y, m, d } = parseDate(date)
  return d === 1 ? `${MONTHS[m - 1]}/${String(y).slice(2)}` : `${d} ${MONTHS[m - 1]}/${String(y).slice(2)}`
}

/**
 * Desloca uma data acompanhando a mudança de `from` para `to`: soma a diferença de meses e,
 * se a data caía no mesmo dia do mês que `from`, passa para o dia de `to`.
 */
export function shiftWith(date: string, from: string, to: string): string {
  const a = parseDate(from)
  const b = parseDate(to)
  const moved = parseDate(addMonths(date, monthIndex(b.y, b.m) - monthIndex(a.y, a.m)))
  if (parseDate(date).d === a.d) moved.d = Math.min(b.d, daysInMonth(moved.y, moved.m))
  return formatISO(moved)
}
