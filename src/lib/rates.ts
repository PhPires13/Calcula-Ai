import { useCallback, useEffect, useState } from 'react'
import snapshot from '../data/rates-snapshot.json'
import type { MonthlySeries, RatesData } from './types'

const CACHE_KEY = 'calcula-ai:rates'
const MAX_AGE_MS = 12 * 60 * 60 * 1000
const SERIES = { ipca: 433, cdi: 4391 } as const

const pad = (n: number) => String(n).padStart(2, '0')

async function fetchSeries(code: number, now: Date): Promise<MonthlySeries> {
  const end = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=01/01/1995&dataFinal=${end}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const rows: { data: string; valor: string }[] = await res.json()
  const currentKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const map: MonthlySeries = {}
  for (const { data, valor } of rows) {
    const [, mm, yyyy] = data.split('/')
    const key = `${yyyy}-${mm}`
    // O valor do mês corrente (CDI) é parcial: tratamos o mês como ainda não publicado.
    if (key >= currentKey) continue
    map[key] = Number(valor)
  }
  if (Object.keys(map).length === 0) throw new Error('Série vazia')
  return map
}

function readCache(): RatesData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as RatesData) : null
  } catch {
    return null
  }
}

function newest(a: RatesData, b: RatesData | null): RatesData {
  if (!b) return a
  return b.fetchedAt > a.fetchedAt ? b : a
}

export type RatesStatus = 'idle' | 'loading' | 'ok' | 'error'

export function useRates() {
  const [rates, setRates] = useState<RatesData>(() => newest(snapshot as RatesData, readCache()))
  const [status, setStatus] = useState<RatesStatus>('idle')

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const now = new Date()
      const [ipca, cdi] = await Promise.all([fetchSeries(SERIES.ipca, now), fetchSeries(SERIES.cdi, now)])
      const data: RatesData = { fetchedAt: now.toISOString(), ipca, cdi }
      setRates(data)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
      } catch {
        /* armazenamento indisponível: segue só em memória */
      }
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (Date.now() - new Date(rates.fetchedAt).getTime() > MAX_AGE_MS) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { rates, status, refresh }
}
