import { useRef } from 'react'
import type { Calculation } from '../lib/types'
import { formatBRL } from '../lib/format'
import { downloadJSON, isCalculation } from '../lib/storage'

interface Props {
  saved: Calculation[]
  /** Todos os cálculos (de todos os tipos), usados no Exportar. */
  exportList: Calculation[]
  /** Valor principal mostrado em cada item. */
  summarize: (c: Calculation) => number
  currentId: string
  onOpen: (c: Calculation) => void
  onDuplicate: (c: Calculation) => void
  onDelete: (c: Calculation) => void
  onNew: () => void
  onImport: (list: Calculation[]) => void
}

export function indexLabel(c: Calculation): string {
  const r = c.rate
  if (r.index === 'IPCA') return r.ipcaSpread ? `IPCA + ${r.ipcaSpread.toLocaleString('pt-BR')}%` : 'IPCA'
  if (r.index === 'CDI') return `${r.cdiPercent.toLocaleString('pt-BR')}% CDI`
  return `${r.customRate.toLocaleString('pt-BR')}% ${r.customPeriod === 'year' ? 'a.a.' : 'a.m.'}`
}

export function SavedList({ saved, exportList, summarize, currentId, onOpen, onDuplicate, onDelete, onNew, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const sorted = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <aside className="saved">
      <div className="card-head">
        <h2>Salvos</h2>
        <button className="ghost small" onClick={onNew}>
          + Novo
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="empty small">Nenhum cálculo salvo.</p>
      ) : (
        <ul>
          {sorted.map((c) => (
            <li key={c.id} className={c.id === currentId ? 'current' : ''}>
              <button className="open" onClick={() => onOpen(c)}>
                <span className="name">{c.name}</span>
                <span className="meta">
                  {indexLabel(c)} · {formatBRL(summarize(c))}
                </span>
              </button>
              <span className="item-actions">
                <button className="icon" title="Duplicar" aria-label={`Duplicar ${c.name}`} onClick={() => onDuplicate(c)}>
                  ⧉
                </button>
                <button className="icon" title="Excluir" aria-label={`Excluir ${c.name}`} onClick={() => onDelete(c)}>
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="io">
        <button className="link" disabled={exportList.length === 0} onClick={() => downloadJSON('calcula-ai.json', exportList)}>
          Exportar
        </button>
        <button className="link" onClick={() => fileRef.current?.click()}>
          Importar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const data = JSON.parse(await file.text())
              const list = (Array.isArray(data) ? data : [data]).filter(isCalculation)
              if (list.length === 0) throw new Error()
              onImport(list)
            } catch {
              alert('Arquivo inválido.')
            }
          }}
        />
      </div>
    </aside>
  )
}
