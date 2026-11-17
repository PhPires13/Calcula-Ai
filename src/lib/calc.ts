import type { Calculation, Contribution, MonthlySeries, RateConfig, RatesData } from './types'
import {
  addMonths,
  daysInMonth,
  formatISO,
  fromMonthIndex,
  monthIndex,
  monthKey,
  parseDate,
  todayISO,
} from './dates'

/** Média geométrica mensal (em %) dos últimos `n` meses disponíveis da série. */
export function recentAverage(series: MonthlySeries, n = 12): number {
  const keys = Object.keys(series).sort().slice(-n)
  if (keys.length === 0) return 0
  const prod = keys.reduce((acc, k) => acc * (1 + series[k] / 100), 1)
  return (Math.pow(prod, 1 / keys.length) - 1) * 100
}

export function lastAvailableMonth(series: MonthlySeries): string | null {
  const keys = Object.keys(series).sort()
  return keys.length ? keys[keys.length - 1] : null
}

export function defaultProjection(cfg: RateConfig, rates: RatesData): number {
  if (cfg.index === 'IPCA') return recentAverage(rates.ipca)
  if (cfg.index === 'CDI') return recentAverage(rates.cdi)
  return 0
}

export interface MonthRate {
  /** Taxa decimal do mês (0.01 = 1%). */
  rate: number
  /** true se o índice do mês não foi publicado e usamos a estimativa. */
  estimated: boolean
}

/** Constrói a função de taxa mensal efetiva para a configuração. */
export function makeRateFn(cfg: RateConfig, rates: RatesData): (key: string) => MonthRate {
  if (cfg.index === 'CUSTOM') {
    const r = cfg.customRate / 100
    const monthly = cfg.customPeriod === 'year' ? Math.pow(1 + r, 1 / 12) - 1 : r
    return () => ({ rate: monthly, estimated: false })
  }

  const series = cfg.index === 'IPCA' ? rates.ipca : rates.cdi
  const projection = (cfg.projectionRate ?? defaultProjection(cfg, rates)) / 100

  if (cfg.index === 'IPCA') {
    const spread = Math.pow(1 + cfg.ipcaSpread / 100, 1 / 12) - 1
    return (key) => {
      const v = series[key]
      const base = v === undefined ? projection : v / 100
      return { rate: (1 + base) * (1 + spread) - 1, estimated: v === undefined }
    }
  }

  const pct = cfg.cdiPercent / 100
  return (key) => {
    const v = series[key]
    const base = v === undefined ? projection : v / 100
    return { rate: base * pct, estimated: v === undefined }
  }
}

/**
 * Curva de fator acumulado. F(data) = produto das taxas mensais desde o início da curva,
 * com pro rata die dentro do mês: (1 + r)^(dias decorridos / dias do mês).
 * O valor corrigido de um aporte A feito em `d` até `t` é A · F(t) / F(d).
 */
export class FactorCurve {
  private startIdx: number
  private monthStart: number[] = [1]
  private monthRates: MonthRate[] = []
  private rateFn: (key: string) => MonthRate

  constructor(startDate: string, rateFn: (key: string) => MonthRate) {
    const { y, m } = parseDate(startDate)
    this.startIdx = monthIndex(y, m)
    this.rateFn = rateFn
  }

  private ensure(idx: number) {
    while (this.monthRates.length <= idx - this.startIdx) {
      const i = this.startIdx + this.monthRates.length
      const { y, m } = fromMonthIndex(i)
      const mr = this.rateFn(monthKey(y, m))
      this.monthRates.push(mr)
      this.monthStart.push(this.monthStart[this.monthStart.length - 1] * (1 + mr.rate))
    }
  }

  at(date: string): number {
    const { y, m, d } = parseDate(date)
    const idx = monthIndex(y, m)
    if (idx < this.startIdx) throw new Error(`Data ${date} antes do início da curva`)
    this.ensure(idx)
    const k = idx - this.startIdx
    const frac = (d - 1) / daysInMonth(y, m)
    return this.monthStart[k] * Math.pow(1 + this.monthRates[k].rate, frac)
  }

  /** Fator entre duas datas (from <= to). */
  between(from: string, to: string): number {
    return this.at(to) / this.at(from)
  }

  /** Meses estimados que contribuem para o intervalo [from, to). */
  estimatedMonths(from: string, to: string): string[] {
    const a = parseDate(from)
    const b = parseDate(to)
    const out: string[] = []
    for (let i = monthIndex(a.y, a.m); i <= monthIndex(b.y, b.m); i++) {
      const { y, m } = fromMonthIndex(i)
      // O mês final só conta se houver dias decorridos nele.
      if (i === monthIndex(b.y, b.m) && b.d === 1) continue
      if (this.rateFn(monthKey(y, m)).estimated) out.push(monthKey(y, m))
    }
    return out
  }
}

export interface ContributionResult {
  contribution: Contribution
  /** Fator de correção até a data-alvo (null se o aporte é posterior à data-alvo). */
  factor: number | null
  value: number | null
  interest: number | null
}

export interface SeriesPoint {
  date: string
  /** Aportes menos retiradas acumulados (valores nominais). */
  invested: number
  /** Saldo corrigido. */
  total: number
  /** Juros acumulados: saldo − aportes + retiradas. */
  interest: number
  /** Ponto após a data-alvo (projeção). */
  projected: boolean
  /** Ponto que usa ao menos um mês com índice estimado. */
  estimated: boolean
}

export interface WithdrawalResult {
  contribution: Contribution
  /** Saldo logo após a retirada. */
  balanceAfter: number | null
  /** Retirada posterior à data-alvo (planejada). */
  planned: boolean
}

export interface PointValue {
  date: string
  /** Saldo corrigido na data. */
  total: number
  /** Aportes menos retiradas até a data (nominal). */
  net: number
  /** Juros acumulados até a data. */
  interest: number
  /** Data posterior à data-alvo. */
  projected: boolean
  /** Usa algum mês sem índice publicado. */
  estimated: boolean
}

export interface CalculationResult {
  targetDate: string
  /** Valores em qualquer data (antes do primeiro aporte, tudo zero). */
  valueOn: (date: string) => PointValue
  rows: ContributionResult[]
  withdrawalRows: WithdrawalResult[]
  /** Aportes até a data-alvo. */
  invested: number
  /** Retiradas até a data-alvo. */
  withdrawn: number
  /** Saldo na data-alvo. */
  total: number
  interest: number
  /** Juros / total aportado. */
  returnPct: number
  /** Variação acumulada do índice desde o primeiro aporte até a data-alvo. */
  periodIndexPct: number
  /** Retiradas planejadas após a data-alvo. */
  plannedWithdrawals: number
  /** Saldo após a última movimentação futura (aporte ou retirada); null se não houver. */
  finalBalance: number | null
  finalDate: string | null
  /** Meses (YYYY-MM) até a data-alvo calculados com estimativa. */
  estimatedMonths: string[]
  series: SeriesPoint[]
}

function pickStep(months: number): number {
  if (months <= 96) return 1
  if (months <= 240) return 3
  if (months <= 480) return 6
  return 12
}

type Flow = Contribution & { amount: number; sign: 1 | -1 }

const isValid = (c: Contribution): c is Contribution & { amount: number } =>
  !!c.date && c.amount !== null && Number.isFinite(c.amount)

/** Meses inteiros (arredondando para cima) entre duas datas. */
function monthsUntil(from: string, to: string): number {
  const a = parseDate(from)
  const b = parseDate(to)
  return monthIndex(b.y, b.m) - monthIndex(a.y, a.m) + (b.d > a.d ? 1 : 0)
}

export function computeCalculation(
  calc: Pick<Calculation, 'targetDate' | 'projectionMonths' | 'rate' | 'contributions' | 'withdrawals'>,
  rates: RatesData,
  today = todayISO(),
): CalculationResult {
  const targetDate = calc.targetDate ?? today
  const withdrawals = calc.withdrawals ?? []
  const flows: Flow[] = [
    ...calc.contributions.filter(isValid).map((c) => ({ ...c, sign: 1 as const })),
    ...withdrawals.filter(isValid).map((c) => ({ ...c, sign: -1 as const })),
  ].sort((a, b) => a.date.localeCompare(b.date) || b.sign - a.sign)

  const empty: CalculationResult = {
    targetDate,
    valueOn: (date) => ({ date, total: 0, net: 0, interest: 0, projected: date > targetDate, estimated: false }),
    rows: calc.contributions.map((c) => ({ contribution: c, factor: null, value: null, interest: null })),
    withdrawalRows: withdrawals.map((c) => ({ contribution: c, balanceAfter: null, planned: c.date > targetDate })),
    invested: 0,
    withdrawn: 0,
    total: 0,
    interest: 0,
    returnPct: 0,
    periodIndexPct: 0,
    plannedWithdrawals: 0,
    finalBalance: null,
    finalDate: null,
    estimatedMonths: [],
    series: [],
  }
  if (flows.length === 0) return empty

  const first = flows[0].date
  const lastFlow = flows[flows.length - 1].date
  const curveStart = first < targetDate ? first : targetDate
  const curve = new FactorCurve(curveStart, makeRateFn(calc.rate, rates))

  const valueAt = (t: string) => {
    let invested = 0
    let withdrawn = 0
    let total = 0
    for (const f of flows) {
      if (f.date > t) break
      if (f.sign > 0) invested += f.amount
      else withdrawn += f.amount
      total += f.sign * f.amount * curve.between(f.date, t)
    }
    return { invested, withdrawn, total }
  }

  const rows: ContributionResult[] = calc.contributions.map((c) => {
    if (!isValid(c) || c.date > targetDate) return { contribution: c, factor: null, value: null, interest: null }
    const factor = curve.between(c.date, targetDate)
    const value = c.amount * factor
    return { contribution: c, factor, value, interest: value - c.amount }
  })

  const withdrawalRows: WithdrawalResult[] = withdrawals.map((c) => ({
    contribution: c,
    balanceAfter: isValid(c) ? valueAt(c.date).total : null,
    planned: c.date > targetDate,
  }))

  const atTarget = valueAt(targetDate)
  const { invested, withdrawn, total } = atTarget
  const interest = total - invested + withdrawn
  const estimatedMonths = first < targetDate ? curve.estimatedMonths(first, targetDate) : []
  const estimatedSet = new Set(estimatedMonths)
  const hasFuture = lastFlow > targetDate

  // ---- Série temporal: dia 1 de cada mês entre o primeiro aporte e a data-alvo, + projeção.
  // A projeção vai, no mínimo, até a última movimentação planejada.
  const projectionMonths = Math.max(calc.projectionMonths, hasFuture ? monthsUntil(targetDate, lastFlow) : 0)
  const f = parseDate(first)
  const t = parseDate(targetDate)
  const historyMonths = Math.max(0, monthIndex(t.y, t.m) - monthIndex(f.y, f.m))
  const step = pickStep(historyMonths + projectionMonths)

  const dates: { date: string; projected: boolean }[] = []
  if (first <= targetDate) dates.push({ date: first, projected: false })
  const historyDates: string[] = []
  for (let i = monthIndex(f.y, f.m) + 1; i <= monthIndex(t.y, t.m); i++) {
    const d = formatISO({ ...fromMonthIndex(i), d: 1 })
    if (d > first && d < targetDate) historyDates.push(d)
  }
  // Mantém pontos alinhados ao passo, contando a partir do fim (próximo da data-alvo).
  historyDates.forEach((d, i) => {
    if ((historyDates.length - 1 - i) % step === 0) dates.push({ date: d, projected: false })
  })
  if (targetDate > first || dates.length === 0) dates.push({ date: targetDate, projected: false })
  for (let k = step; k <= projectionMonths; k += step) {
    dates.push({ date: addMonths(targetDate, k), projected: true })
  }

  const series: SeriesPoint[] = dates.map(({ date, projected }) => {
    const v = valueAt(date)
    let estimated = false
    if (!projected) {
      // O ponto usa estimativa se o mês corrente (com dias decorridos) ou o anterior foi estimado.
      const { y, m, d } = parseDate(date)
      const p = fromMonthIndex(monthIndex(y, m) - 1)
      estimated = (d > 1 && estimatedSet.has(monthKey(y, m))) || estimatedSet.has(monthKey(p.y, p.m))
    }
    return {
      date,
      invested: v.invested - v.withdrawn,
      total: v.total,
      interest: v.total - v.invested + v.withdrawn,
      projected,
      estimated,
    }
  })

  const valueOn = (date: string): PointValue => {
    if (date < curveStart) return { date, total: 0, net: 0, interest: 0, projected: date > targetDate, estimated: false }
    const v = valueAt(date)
    return {
      date,
      total: v.total,
      net: v.invested - v.withdrawn,
      interest: v.total - v.invested + v.withdrawn,
      projected: date > targetDate,
      estimated: date > first && curve.estimatedMonths(first, date).length > 0,
    }
  }

  return {
    targetDate,
    valueOn,
    rows,
    withdrawalRows,
    invested,
    withdrawn,
    total,
    interest,
    returnPct: invested !== 0 ? interest / invested : 0,
    periodIndexPct: first < targetDate ? curve.between(first, targetDate) - 1 : 0,
    plannedWithdrawals: flows.filter((x) => x.sign < 0 && x.date > targetDate).reduce((s, x) => s + x.amount, 0),
    finalBalance: hasFuture ? valueAt(lastFlow).total : null,
    finalDate: hasFuture ? lastFlow : null,
    estimatedMonths,
    series,
  }
}
