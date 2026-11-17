import type { CalculationResult } from '../lib/calc'
import { formatBR } from '../lib/dates'
import { formatBRL, formatPct } from '../lib/format'

/** Amostra de cor ligando o cartão à série do gráfico. */
const Swatch = ({ kind, color }: { kind: 'bar' | 'line'; color: string }) => (
  <span className={`swatch ${kind}`} style={{ '--c': `var(${color})` } as React.CSSProperties} aria-hidden />
)

export function Summary({ result }: { result: CalculationResult }) {
  const estimated = result.estimatedMonths.length > 0
  const final = result.finalBalance
  const short = final !== null && final < -0.005
  const tiles = 3 + (result.withdrawn > 0 ? 1 : 0) + (final !== null && result.plannedWithdrawals > 0 ? 1 : 0)

  return (
    <section className="summary" style={{ '--tiles': tiles - 1 } as React.CSSProperties}>
      <div className="tile hero">
        <span className="label">
          <Swatch kind="bar" color="--series-1" />
          {result.withdrawalRows.length > 0 ? 'Saldo no início das retiradas' : 'Saldo em'} {formatBR(result.targetDate)}
        </span>
        <span className="value">
          {formatBRL(result.total)}
          {estimated && (
            <span className="est" title="Inclui meses sem índice publicado, calculados com taxa estimada">
              *
            </span>
          )}
        </span>
      </div>
      <div className="tile">
        <span className="label">
          <Swatch kind="line" color="--series-3" />
          Aportado
        </span>
        <span className="value">{formatBRL(result.invested)}</span>
      </div>
      {result.withdrawn > 0 && (
        <div className="tile">
          <span className="label">Retirado</span>
          <span className="value">{formatBRL(result.withdrawn)}</span>
        </div>
      )}
      <div className="tile">
        <span className="label">
          <Swatch kind="line" color="--series-2" />
          Juros
        </span>
        <span className="value">
          {formatBRL(result.interest)} <small className="pct">{formatPct(result.returnPct)}</small>
        </span>
      </div>
      {final !== null && result.plannedWithdrawals > 0 && (
        <div className="tile">
          <span className="label">
            {short ? 'Falta' : 'Sobra'} após retiradas ({formatBR(result.finalDate!)})
          </span>
          <span className={`value ${short ? 'negative' : ''}`}>{formatBRL(Math.abs(final))}</span>
        </div>
      )}
    </section>
  )
}
