import { useRef } from 'react'

/** Título editável: cresce com o texto e mostra um lápis para indicar que pode ser editado. */
export function NameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="name-edit">
      <span className="name-sizer" data-value={value || 'Sem nome'}>
        <input
          ref={ref}
          type="text"
          value={value}
          placeholder="Sem nome"
          aria-label="Nome do cálculo"
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </span>
      <button type="button" className="icon pencil" title="Renomear" aria-label="Renomear" onClick={() => ref.current?.focus()}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M11.2 2.3a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L5.5 13 2.5 13.5 3 10.5z" strokeLinejoin="round" />
          <path d="M9.8 3.7l2.5 2.5" />
        </svg>
      </button>
    </div>
  )
}
