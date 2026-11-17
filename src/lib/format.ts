const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

export const formatBRL = (v: number) => brl.format(v)
export const formatPct = (v: number) => pct.format(v)
export const formatCompactBRL = (v: number) => (Math.abs(v) < 10000 ? brl.format(v).replace(/,00$/, '') : `R$ ${compact.format(v)}`)
export const formatNum = (v: number) => num.format(v)
