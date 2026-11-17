export type IndexKind = 'IPCA' | 'CDI' | 'CUSTOM'

export interface RateConfig {
  index: IndexKind
  /** Percentual do CDI (100 = 100% do CDI). */
  cdiPercent: number
  /** Spread anual somado ao IPCA, em % a.a. (IPCA + X%). */
  ipcaSpread: number
  /** Taxa customizada, em %. */
  customRate: number
  customPeriod: 'month' | 'year'
  /**
   * Taxa usada nos meses sem dado publicado (futuro / mês corrente), em % a.m. do índice base.
   * null = automático (média geométrica dos últimos 12 meses).
   */
  projectionRate: number | null
}

export interface Contribution {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** Valor em R$ (positivo, tanto em aportes quanto em retiradas). null = ainda não preenchido. */
  amount: number | null
  note?: string
}

export interface Calculation {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** YYYY-MM-DD até a qual tudo é corrigido, ou null para "hoje". */
  targetDate: string | null
  /** Meses de projeção mostrados após a data-alvo. */
  projectionMonths: number
  rate: RateConfig
  contributions: Contribution[]
  /** Retiradas (ex.: parcelas pagas com o próprio saldo). O dinheiro rende até cada retirada. */
  withdrawals?: Contribution[]
  /** Retiradas acompanham a data-alvo (início das retiradas) quando ela muda. Padrão: true. */
  anchorWithdrawals?: boolean
}

/** Taxas mensais em %, indexadas por "YYYY-MM". */
export type MonthlySeries = Record<string, number>

export interface RatesData {
  fetchedAt: string
  ipca: MonthlySeries
  cdi: MonthlySeries
}
