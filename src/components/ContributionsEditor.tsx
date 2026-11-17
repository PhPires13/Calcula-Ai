import { useRef, useState } from 'react'
import type { Contribution } from '../lib/types'
import { addMonths, formatBR, todayISO } from '../lib/dates'
import { formatBRL } from '../lib/format'
import { newId } from '../lib/storage'
import { DateInput, DecimalInput, MoneyInput } from './inputs'

type Variant = 'aportes' | 'retiradas'

export interface RowResult {
  id: string
  value: number | null
  interest?: number | null
}

interface Props {
  contributions: Contribution[]
  rows: RowResult[]
  onChange: (list: Contribution[]) => void
  /** aportes: datas passadas, colunas Corrigido/Juros. retiradas: datas futuras, coluna Saldo após. */
  variant?: Variant
  /** Retiradas: data de início, usada para sugerir a primeira retirada. */
  referenceDate?: string
  /** Retiradas: se acompanham a data de início quando ela muda. */
  anchored?: boolean
  onAnchoredChange?: (v: boolean) => void
}

const TEXT: Record<Variant, { title: string; value: string; interest?: string; item: string; recurring: string }> = {
  aportes: { title: 'Aportes', value: 'Corrigido', interest: 'Juros', item: 'aporte', recurring: 'Primeiro aporte' },
  retiradas: { title: 'Retiradas', value: 'Saldo após', item: 'retirada', recurring: 'Primeira retirada' },
}

/** Sugere a data da próxima linha: um mês após a última (aportes não passam de hoje). */
function nextDate(variant: Variant, last?: string, reference?: string): string {
  const today = todayISO()
  if (variant === 'retiradas') return last ? addMonths(last, 1) : reference ?? today
  if (!last) return today
  const next = addMonths(last, 1)
  return next > today ? today : next
}

const byDate = (list: Contribution[]) => [...list].sort((a, b) => a.date.localeCompare(b.date))

export function ContributionsEditor({
  contributions,
  rows,
  onChange,
  variant = 'aportes',
  referenceDate,
  anchored,
  onAnchoredChange,
}: Props) {
  const text = TEXT[variant]
  const [showRecurring, setShowRecurring] = useState(false)
  // Linha vazia sempre presente no fim; vira um aporte real assim que é editada.
  const [ghostId, setGhostId] = useState(newId)
  const tbodyRef = useRef<HTMLTableSectionElement>(null)

  const last = contributions[contributions.length - 1]
  const ghost: Contribution = { id: ghostId, date: nextDate(variant, last?.date, referenceDate), amount: null }
  const isGhost = (id: string) => id === ghostId

  const update = (id: string, patch: Partial<Contribution>) => {
    if (isGhost(id)) {
      // Mantém o mesmo id: o React preserva a linha e o foco continua no campo.
      onChange([...contributions, { ...ghost, ...patch }])
      setGhostId(newId())
    } else {
      onChange(contributions.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    }
  }
  const remove = (id: string) => onChange(contributions.filter((c) => c.id !== id))
  const focusGhost = () =>
    tbodyRef.current?.querySelector<HTMLInputElement>('tr.ghost-row input[aria-label="Valor"]')?.focus()

  const byId = new Map(rows.map((r) => [r.id, r]))

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          {text.title} {contributions.length > 0 && <span className="count">{contributions.length}</span>}
        </h2>
        {variant === 'retiradas' && referenceDate && (
          <span className="head-note">
            a partir de <strong>{formatBR(referenceDate)}</strong>
            {onAnchoredChange && (
              <label className="check small" title="Ao mudar a data de início, as retiradas se deslocam junto">
                <input type="checkbox" checked={anchored ?? true} onChange={(e) => onAnchoredChange(e.target.checked)} />
                acompanhar a data
              </label>
            )}
          </span>
        )}
        <div className="actions">
          <button className="ghost" onClick={() => setShowRecurring((s) => !s)} aria-expanded={showRecurring}>
            Mensais…
          </button>
        </div>
      </div>

      {showRecurring && (
        <RecurringForm
          defaultStart={variant === 'retiradas' ? referenceDate ?? todayISO() : addMonths(todayISO(), -12)}
          defaultCount={variant === 'retiradas' ? 10 : 12}
          startLabel={text.recurring}
          onAdd={(items) => {
            onChange(byDate([...contributions, ...items]))
            setShowRecurring(false)
          }}
        />
      )}

      <div className="table-wrap">
          <table className="contrib">
            <thead>
              <tr>
                <th>Data</th>
                <th className="num">Valor</th>
                <th className="num">{text.value}</th>
                {text.interest && <th className="num">{text.interest}</th>}
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {[...contributions, ghost].map((c) => {
                const r = byId.get(c.id)
                const pending = isGhost(c.id)
                return (
                  <tr key={c.id} className={pending ? 'ghost-row' : ''}>
                    <td>
                      <DateInput
                        value={c.date}
                        ariaLabel={`Data do ${text.item}`}
                        onChange={(date) => update(c.id, { date })}
                        onBlur={() => onChange(byDate(contributions))}
                      />
                    </td>
                    <td className="num">
                      <MoneyInput
                        value={c.amount}
                        ariaLabel="Valor"
                        onChange={(v) => update(c.id, { amount: v })}
                        onKeyDown={(e) => {
                          // Enter leva para a linha vazia, pronta para o próximo aporte.
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            focusGhost()
                          }
                        }}
                      />
                    </td>
                    <td className={`num strong ${r?.value != null && r.value < -0.005 ? 'negative' : ''}`}>
                      {pending ? '' : r?.value != null ? formatBRL(r.value) : '—'}
                    </td>
                    {text.interest && <td className="num muted">{pending ? '' : r?.interest != null ? formatBRL(r.interest) : '—'}</td>}
                    <td className="row-actions">
                      {!pending && (
                        <button className="icon" aria-label={`Remover ${text.item}`} title="Remover" onClick={() => remove(c.id)}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </div>
    </section>
  )
}

interface RecurringProps {
  onAdd: (items: Contribution[]) => void
  defaultStart: string
  defaultCount: number
  startLabel: string
}

function RecurringForm({ onAdd, defaultStart, defaultCount, startLabel }: RecurringProps) {
  const [amount, setAmount] = useState<number | null>(null)
  const [start, setStart] = useState(defaultStart)
  const [count, setCount] = useState<number | null>(defaultCount)
  const valid = amount !== null && !!start && count !== null && count >= 1 && count <= 600

  return (
    <div className="recurring">
      <MoneyInput value={amount} onChange={setAmount} ariaLabel="Valor mensal" autoFocus />
      <span>por</span>
      <DecimalInput value={count} onChange={(v) => setCount(v === null ? null : Math.round(v))} decimals={0} suffix="meses" ariaLabel="Quantidade de meses" />
      <span>desde</span>
      <DateInput value={start} ariaLabel={startLabel} onChange={setStart} />
      <button
        disabled={!valid}
        onClick={() => valid && onAdd(Array.from({ length: count }, (_, i) => ({ id: newId(), date: addMonths(start, i), amount })))}
      >
        Adicionar
      </button>
    </div>
  )
}
