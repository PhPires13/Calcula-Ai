import { useEffect, useRef } from 'react'
import type { Calculation, IndexKind, RateConfig, RatesData } from '../lib/types'
import { defaultProjection } from '../lib/calc'
import { todayISO } from '../lib/dates'
import { formatNum } from '../lib/format'
import { DateInput, DecimalInput } from './inputs'

interface Props {
  calc: Calculation
  rates: RatesData
  onChange: (patch: Partial<Calculation>) => void
  /** Rótulo do campo de data ("Até" para aportes, "Início" para parcelas). */
  dateLabel?: string
  /** Campos extras exibidos ao fim da barra. */
  children?: React.ReactNode
}

const INDEXES: [IndexKind, string][] = [
  ['IPCA', 'IPCA'],
  ['CDI', 'CDI'],
  ['CUSTOM', 'Taxa fixa'],
]

export function RateSettings({ calc, rates, onChange, dateLabel = 'Até', children }: Props) {
  const rate = calc.rate
  const setRate = (patch: Partial<RateConfig>) => onChange({ rate: { ...rate, ...patch } })
  const auto = Math.round(defaultProjection(rate, rates) * 100) / 100
  const moreRef = useRef<HTMLDetailsElement>(null)

  // Fecha o popover ao clicar fora ou pressionar Esc.
  useEffect(() => {
    const close = (e: Event) => {
      const el = moreRef.current
      if (!el?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) el.open = false
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  return (
    <section className="card toolbar">
      <div className="segmented" role="radiogroup" aria-label="Índice">
        {INDEXES.map(([key, label]) => (
          <button
            key={key}
            role="radio"
            aria-checked={rate.index === key}
            className={rate.index === key ? 'active' : ''}
            onClick={() => setRate({ index: key })}
          >
            {label}
          </button>
        ))}
      </div>

      {rate.index === 'IPCA' && (
        <label className="inline-field">
          <span>+</span>
          <DecimalInput value={rate.ipcaSpread} onChange={(v) => setRate({ ipcaSpread: v ?? 0 })} suffix="% a.a." ariaLabel="Spread sobre o IPCA" />
        </label>
      )}
      {rate.index === 'CDI' && (
        <DecimalInput value={rate.cdiPercent} onChange={(v) => setRate({ cdiPercent: v ?? 0 })} suffix="% do CDI" ariaLabel="Percentual do CDI" />
      )}
      {rate.index === 'CUSTOM' && (
        <span className="inline-field">
          <DecimalInput value={rate.customRate} onChange={(v) => setRate({ customRate: v ?? 0 })} suffix="%" ariaLabel="Taxa" />
          <select value={rate.customPeriod} onChange={(e) => setRate({ customPeriod: e.target.value as 'month' | 'year' })} aria-label="Período da taxa">
            <option value="month">ao mês</option>
            <option value="year">ao ano</option>
          </select>
        </span>
      )}

      {rate.index !== 'CUSTOM' && (
        <details className="more" ref={moreRef}>
          <summary title="Taxa estimada para meses sem índice" aria-label="Taxa estimada">⚙</summary>
          <div className="popover">
            <label className="inline-field">
              <span>{rate.index} futuro</span>
              <DecimalInput
                value={rate.projectionRate}
                onChange={(v) => setRate({ projectionRate: v })}
                suffix="% a.m."
                placeholder={formatNum(auto)}
                ariaLabel="Taxa estimada para meses sem índice"
              />
            </label>
            <small>Vazio = média dos últimos 12 meses</small>
          </div>
        </details>
      )}
      <span className="inline-field target">
        <span>{dateLabel}</span>
        <DateInput
          ariaLabel={dateLabel === 'Até' ? 'Corrigir até' : dateLabel}
          value={calc.targetDate ?? todayISO()}
          onChange={(d) => onChange({ targetDate: d !== todayISO() ? d : null })}
        />
        <button className="chip" aria-pressed={calc.targetDate === null} onClick={() => onChange({ targetDate: null })}>
          Hoje
        </button>
      </span>

      {children}
    </section>
  )
}
