import type { Calculation } from './types'
import { todayISO } from './dates'

const LIST_KEY = 'calcula-ai:calculations'
const DRAFT_KEY = 'calcula-ai:draft'

/**
 * Converte cálculos antigos do modo "Parcelamento" (kind: 'parcelas') no formato atual:
 * o valor investido vira um aporte na data de início e as parcelas viram retiradas.
 */
export function normalize(raw: Calculation): Calculation {
  const c = raw as Calculation & { kind?: string; available?: number | null }
  if (c.kind !== 'parcelas') {
    const { kind: _k, available: _a, ...rest } = c
    return { ...rest, withdrawals: rest.withdrawals ?? [] }
  }
  const { kind: _k, available, ...rest } = c
  const start = c.targetDate ?? todayISO()
  return {
    ...rest,
    targetDate: null,
    projectionMonths: 12,
    contributions: available != null ? [{ id: newId(), date: start, amount: available }] : [],
    withdrawals: c.contributions,
  }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function blankCalculation(): Calculation {
  const now = new Date().toISOString()
  return {
    id: newId(),
    name: 'Novo cálculo',
    createdAt: now,
    updatedAt: now,
    targetDate: null,
    projectionMonths: 12,
    rate: {
      index: 'IPCA',
      cdiPercent: 100,
      ipcaSpread: 0,
      customRate: 1,
      customPeriod: 'month',
      projectionRate: null,
    },
    contributions: [],
    withdrawals: [],
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sem armazenamento disponível */
  }
}

export function loadSaved(): Calculation[] {
  return read<Calculation[]>(LIST_KEY, []).map(normalize)
}

export function storeSaved(list: Calculation[]) {
  write(LIST_KEY, list)
}

export function loadDraft(): Calculation | null {
  const c = read<Calculation | null>(DRAFT_KEY, null)
  return c ? normalize(c) : null
}

export function storeDraft(calc: Calculation) {
  write(DRAFT_KEY, calc)
}

/** Valida minimamente um objeto importado de arquivo. */
export function isCalculation(x: unknown): x is Calculation {
  const c = x as Calculation
  return (
    !!c &&
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    Array.isArray(c.contributions) &&
    !!c.rate &&
    typeof c.rate.index === 'string'
  )
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
