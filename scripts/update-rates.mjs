// Baixa as séries mensais de IPCA (SGS 433) e CDI (SGS 4391) do Banco Central
// e grava um snapshot usado como fallback quando a API não estiver acessível.
// Uso: npm run update-rates
import { writeFileSync } from 'node:fs'

const SERIES = { ipca: 433, cdi: 4391 }
const today = new Date()
const pad = (n) => String(n).padStart(2, '0')
const end = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`
const currentKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`

const out = { fetchedAt: today.toISOString() }
for (const [name, code] of Object.entries(SERIES)) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=01/01/1995&dataFinal=${end}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const rows = await res.json()
  const map = {}
  for (const { data, valor } of rows) {
    const [, mm, yyyy] = data.split('/')
    const key = `${yyyy}-${mm}`
    // O mês corrente do CDI é parcial (acumulado até hoje): descartamos.
    if (key >= currentKey) continue
    map[key] = Number(valor)
  }
  out[name] = map
  console.log(`${name}: ${Object.keys(map).length} meses`)
}
writeFileSync(new URL('../src/data/rates-snapshot.json', import.meta.url), JSON.stringify(out))
