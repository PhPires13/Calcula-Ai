import { describe, expect, it } from 'vitest'
import { computeCalculation, FactorCurve, makeRateFn, recentAverage } from './calc'
import { shiftWith } from './dates'
import type { RateConfig, RatesData } from './types'

const rates: RatesData = {
  fetchedAt: '2026-01-01',
  ipca: { '2025-01': 0.5, '2025-02': 1, '2025-03': 0.2 },
  cdi: { '2025-01': 1, '2025-02': 1, '2025-03': 1 },
}

const base: RateConfig = {
  index: 'CUSTOM',
  cdiPercent: 100,
  ipcaSpread: 0,
  customRate: 1,
  customPeriod: 'month',
  projectionRate: null,
}

describe('FactorCurve', () => {
  it('compõe meses cheios', () => {
    const c = new FactorCurve('2025-01-01', makeRateFn(base, rates))
    expect(c.between('2025-01-01', '2025-04-01')).toBeCloseTo(1.01 ** 3, 12)
  })

  it('aplica pro rata die dentro do mês', () => {
    const c = new FactorCurve('2025-01-01', makeRateFn(base, rates))
    // 15 dias de janeiro (31 dias)
    expect(c.between('2025-01-01', '2025-01-16')).toBeCloseTo(1.01 ** (15 / 31), 12)
  })

  it('converte taxa anual em mensal equivalente', () => {
    const c = new FactorCurve('2025-01-01', makeRateFn({ ...base, customRate: 12, customPeriod: 'year' }, rates))
    expect(c.between('2025-01-01', '2026-01-01')).toBeCloseTo(1.12, 12)
  })
})

describe('índices', () => {
  it('IPCA + spread', () => {
    const fn = makeRateFn({ ...base, index: 'IPCA', ipcaSpread: 6 }, rates)
    expect(fn('2025-02').rate).toBeCloseTo(1.01 * Math.pow(1.06, 1 / 12) - 1, 12)
    expect(fn('2025-02').estimated).toBe(false)
  })

  it('% do CDI e estimativa para meses sem dado', () => {
    const fn = makeRateFn({ ...base, index: 'CDI', cdiPercent: 110 }, rates)
    expect(fn('2025-01').rate).toBeCloseTo(0.011, 12)
    const future = fn('2030-01')
    expect(future.estimated).toBe(true)
    expect(future.rate).toBeCloseTo(0.011, 12)
  })

  it('média geométrica recente', () => {
    expect(recentAverage({ a: 1, b: 1 })).toBeCloseTo(1, 12)
  })
})

describe('computeCalculation', () => {
  it('corrige vários aportes até a mesma data', () => {
    const r = computeCalculation(
      {
        targetDate: '2025-04-01',
        projectionMonths: 12,
        rate: base,
        contributions: [
          { id: '1', date: '2025-01-01', amount: 1000 },
          { id: '2', date: '2025-03-01', amount: 500 },
          { id: '3', date: '2025-06-01', amount: 999 }, // após a data-alvo
        ],
      },
      rates,
    )
    expect(r.invested).toBe(1500)
    expect(r.total).toBeCloseTo(1000 * 1.01 ** 3 + 500 * 1.01, 8)
    expect(r.rows[2].value).toBeNull()
    expect(r.series.at(-1)!.projected).toBe(true)
    expect(r.series.at(-1)!.date).toBe('2026-04-01')
    // aporte posterior entra na projeção
    expect(r.series.at(-1)!.invested).toBe(2499)
  })

  it('marca meses estimados até a data-alvo', () => {
    const r = computeCalculation(
      {
        targetDate: '2025-05-10',
        projectionMonths: 0,
        rate: { ...base, index: 'IPCA' },
        contributions: [{ id: '1', date: '2025-02-01', amount: 100 }],
      },
      rates,
    )
    expect(r.estimatedMonths).toEqual(['2025-04', '2025-05'])
  })
})

describe('retiradas', () => {
  const rate = { ...base }
  it('o dinheiro rende até cada retirada', () => {
    const r = computeCalculation(
      {
        targetDate: '2025-01-01',
        projectionMonths: 0,
        rate,
        contributions: [{ id: 'a', date: '2025-01-01', amount: 1000 }],
        withdrawals: [1, 2, 3].map((i) => ({ id: `w${i}`, date: `2025-0${i + 1}-01`, amount: 100 })),
      },
      rates,
    )
    expect(r.total).toBe(1000)
    expect(r.plannedWithdrawals).toBe(300)
    expect(r.finalDate).toBe('2025-04-01')
    expect(r.finalBalance).toBeCloseTo(1000 * 1.01 ** 3 - 100 * (1.01 ** 2 + 1.01 + 1), 8)
    expect(r.withdrawalRows[0].balanceAfter).toBeCloseTo(1010 - 100, 8)
    // projeção estendida até a última retirada
    expect(r.series.at(-1)!.date).toBe('2025-04-01')
  })

  it('retiradas passadas reduzem o saldo na data-alvo', () => {
    const r = computeCalculation(
      {
        targetDate: '2025-03-01',
        projectionMonths: 0,
        rate,
        contributions: [{ id: 'a', date: '2025-01-01', amount: 1000 }],
        withdrawals: [{ id: 'w', date: '2025-02-01', amount: 500 }],
      },
      rates,
    )
    expect(r.withdrawn).toBe(500)
    expect(r.total).toBeCloseTo(1000 * 1.01 ** 2 - 500 * 1.01, 8)
    expect(r.interest).toBeCloseTo(r.total - 1000 + 500, 8)
    expect(r.finalBalance).toBeNull()
  })
})

describe('valueOn', () => {
  it('saldo em qualquer data, inclusive entre retiradas', () => {
    const r = computeCalculation(
      {
        targetDate: '2025-01-01',
        projectionMonths: 0,
        rate: base,
        contributions: [{ id: 'a', date: '2025-01-01', amount: 1000 }],
        withdrawals: [{ id: 'w', date: '2025-03-01', amount: 100 }],
      },
      rates,
    )
    const v = r.valueOn('2025-02-01')
    expect(v.total).toBeCloseTo(1010, 8)
    expect(v.projected).toBe(true)
    const after = r.valueOn('2025-03-01')
    expect(after.total).toBeCloseTo(1000 * 1.01 ** 2 - 100, 8)
    expect(after.net).toBe(900)
    expect(r.valueOn('2024-01-01').total).toBe(0)
  })
})

describe('shiftWith (retiradas acompanham a data de início)', () => {
  it('desloca meses e acompanha o dia quando era o mesmo', () => {
    expect(shiftWith('2027-01-17', '2026-12-17', '2027-03-05')).toBe('2027-04-05')
  })
  it('mantém o dia quando era diferente', () => {
    expect(shiftWith('2027-01-10', '2026-12-17', '2027-03-05')).toBe('2027-04-10')
  })
})
