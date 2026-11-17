import { useEffect, useMemo, useState } from 'react'
import type { Calculation } from './lib/types'
import { computeCalculation, lastAvailableMonth } from './lib/calc'
import { formatMonthKey, shiftWith, todayISO } from './lib/dates'
import { useRates } from './lib/rates'
import { blankCalculation, loadDraft, loadSaved, newId, normalize, storeDraft, storeSaved } from './lib/storage'
import { RateSettings } from './components/RateSettings'
import { ContributionsEditor } from './components/ContributionsEditor'
import { Summary } from './components/Summary'
import { GrowthChart } from './components/GrowthChart'
import { SavedList } from './components/SavedList'
import { NameInput } from './components/NameInput'
import { exportPdf } from './lib/report'

/** Compara ignorando metadados de data. */
const sameContent = (a: Calculation, b: Calculation) =>
  JSON.stringify({ ...a, updatedAt: '', createdAt: '' }) === JSON.stringify({ ...b, updatedAt: '', createdAt: '' })

export default function App() {
  const { rates, status, refresh } = useRates()
  const [saved, setSaved] = useState<Calculation[]>(loadSaved)
  const [calc, setCalc] = useState<Calculation>(() => loadDraft() ?? blankCalculation())
  const [exporting, setExporting] = useState(false)
  const [queryDate, setQueryDate] = useState<string | null>(null)
  useEffect(() => setQueryDate(null), [calc.id])

  useEffect(() => storeDraft(calc), [calc])
  useEffect(() => storeSaved(saved), [saved])

  const result = useMemo(() => computeCalculation(calc, rates), [calc, rates])
  const savedVersion = saved.find((s) => s.id === calc.id)
  const dirty = !savedVersion || !sameContent(savedVersion, calc)

  const patch = (p: Partial<Calculation>) =>
    setCalc((c) => {
      // Retiradas acompanham a data de início: ao mudar a data, as retiradas a partir dela se deslocam junto.
      if ('targetDate' in p && (c.anchorWithdrawals ?? true) && c.withdrawals?.length) {
        const from = c.targetDate ?? todayISO()
        const to = p.targetDate ?? todayISO()
        if (from !== to) {
          const withdrawals = c.withdrawals.map((w) => (w.date >= from ? { ...w, date: shiftWith(w.date, from, to) } : w))
          return { ...c, ...p, withdrawals }
        }
      }
      return { ...c, ...p }
    })
  const withdrawals = calc.withdrawals ?? []

  const confirmDiscard = () =>
    !dirty ||
    (calc.contributions.length === 0 && withdrawals.length === 0 && !savedVersion) ||
    confirm('Descartar as alterações não salvas deste cálculo?')

  const save = () => {
    const next = { ...calc, updatedAt: new Date().toISOString() }
    setCalc(next)
    setSaved((list) => (list.some((s) => s.id === next.id) ? list.map((s) => (s.id === next.id ? next : s)) : [...list, next]))
  }

  const pdf = async () => {
    setExporting(true)
    try {
      await exportPdf(calc, result, rates, document.querySelector<HTMLCanvasElement>('.chart-box canvas'))
    } finally {
      setExporting(false)
    }
  }

  const ipcaLast = lastAvailableMonth(rates.ipca)

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          <h1>Calcula Aí</h1>
        </div>
        <button
          className="link small"
          onClick={refresh}
          disabled={status === 'loading'}
          title={status === 'error' ? 'Sem conexão com o Banco Central' : 'Atualizar índices do Banco Central'}
        >
          {status === 'loading' ? 'Atualizando…' : `Índices até ${ipcaLast ? formatMonthKey(ipcaLast) : '—'} ↻`}
          {status === 'error' && ' ⚠'}
        </button>
      </header>

      <div className="layout">
        <SavedList
          saved={saved}
          exportList={saved}
          summarize={(c) => computeCalculation(c, rates).total}
          currentId={calc.id}
          onNew={() => confirmDiscard() && setCalc(blankCalculation())}
          onOpen={(c) => c.id !== calc.id && confirmDiscard() && setCalc(c)}
          onDuplicate={(c) => {
            const now = new Date().toISOString()
            const copy = { ...c, id: newId(), name: `${c.name} (cópia)`, createdAt: now, updatedAt: now }
            setSaved((list) => [...list, copy])
          }}
          onDelete={(c) => {
            if (!confirm(`Excluir "${c.name}"?`)) return
            setSaved((list) => list.filter((s) => s.id !== c.id))
          }}
          onImport={(items) => {
            setSaved((list) => {
              const ids = new Set(list.map((s) => s.id))
              return [...list, ...items.map(normalize).map((i) => (ids.has(i.id) ? { ...i, id: newId() } : i))]
            })
          }}
        />

        <main>
          <div className="title-bar">
            <NameInput value={calc.name} onChange={(name) => patch({ name })} />
            <div className="actions">
              <button className="ghost" onClick={pdf} disabled={exporting} title="Baixar relatório em PDF">
                {exporting ? 'Gerando…' : 'PDF'}
              </button>
              <button className="primary" onClick={save} disabled={!dirty}>
                {dirty ? 'Salvar' : 'Salvo'}
              </button>
            </div>
          </div>

          <RateSettings
            calc={calc}
            rates={rates}
            onChange={patch}
            dateLabel={withdrawals.length > 0 ? 'Início das retiradas' : 'Até'}
          />
          <Summary result={result} />
          <ContributionsEditor
            contributions={calc.contributions}
            rows={result.rows.map((r) => ({ id: r.contribution.id, value: r.value, interest: r.interest }))}
            onChange={(contributions) => patch({ contributions })}
          />
          <ContributionsEditor
            variant="retiradas"
            referenceDate={result.targetDate}
            anchored={calc.anchorWithdrawals ?? true}
            onAnchoredChange={(anchorWithdrawals) => patch({ anchorWithdrawals })}
            contributions={withdrawals}
            rows={result.withdrawalRows.map((r) => ({ id: r.contribution.id, value: r.balanceAfter }))}
            onChange={(withdrawals) => patch({ withdrawals })}
          />
          <GrowthChart
            series={result.series}
            targetDate={result.targetDate}
            valueOn={result.valueOn}
            selectedDate={queryDate ?? result.targetDate}
            onSelectDate={setQueryDate}
            projectionMonths={calc.projectionMonths}
            onProjectionChange={(projectionMonths) => patch({ projectionMonths })}
            labels={withdrawals.length > 0 ? { invested: 'Aportes − retiradas', total: 'Saldo' } : undefined}
          />
        </main>
      </div>

      <footer>Fonte dos índices: Banco Central do Brasil</footer>
    </div>
  )
}
