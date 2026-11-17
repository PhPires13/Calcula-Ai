import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { daysInMonth } from '../lib/dates'

/** Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234". */
export function parseDecimal(raw: string): number | null {
  let s = raw.replace(/[R$\s%]/g, '')
  if (s === '' || s === '-') return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function display(v: number | null, decimals: number): string {
  if (v === null || !Number.isFinite(v)) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 6) })
}

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  decimals?: number
  prefix?: string
  suffix?: string
  placeholder?: string
  ariaLabel?: string
  id?: string
  className?: string
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/** Campo numérico em formato brasileiro, que só reformata ao sair do campo. */
export function DecimalInput({
  value,
  onChange,
  decimals = 2,
  prefix,
  suffix,
  placeholder,
  ariaLabel,
  id,
  className,
  autoFocus,
  onKeyDown,
}: Props) {
  const [text, setText] = useState(display(value, decimals))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(display(value, decimals))
  }, [value, decimals, focused])

  return (
    <span className={`affix-input ${className ?? ''}`}>
      {prefix && <span className="affix">{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          setFocused(true)
          // Seleciona o conteúdo para que basta digitar o novo valor.
          e.currentTarget.select()
        }}
        onBlur={() => {
          setFocused(false)
          setText(display(value, decimals))
        }}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseDecimal(e.target.value))
        }}
      />
      {suffix && <span className="affix">{suffix}</span>}
    </span>
  )
}

/** "YYYY-MM-DD" -> "DD/MM/AAAA" */
function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

/** "DD/MM/AAAA" completo e válido -> "YYYY-MM-DD"; caso contrário null. */
export function brToISO(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Aplica a máscara DD/MM/AAAA aos dígitos digitados. */
function formatDateDigits(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/')
}

/** Posição no texto mascarado logo após o n-ésimo dígito. */
function caretAfterDigits(text: string, n: number): number {
  if (n <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i]) && ++seen === n) return i + 1
  }
  return text.length
}

/**
 * Aplica uma edição ao campo DD/MM/AAAA preservando a posição do cursor.
 * - Digitar no meio de uma data completa sobrescreve o dígito seguinte.
 * - Apagar uma barra apaga o dígito vizinho (a barra é fixa).
 */
export function editDate(
  raw: string,
  caret: number,
  prev: string,
  inputType = '',
): { text: string; caret: number } {
  let digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length
  let digits = raw.replace(/\D/g, '')
  const prevDigits = prev.replace(/\D/g, '')

  if (inputType.startsWith('delete') && digits === prevDigits && digits.length > 0) {
    // Só uma barra foi removida: apaga o dígito ao lado dela.
    if (inputType === 'deleteContentForward') {
      digits = digits.slice(0, digitsBefore) + digits.slice(digitsBefore + 1)
    } else if (digitsBefore > 0) {
      digits = digits.slice(0, digitsBefore - 1) + digits.slice(digitsBefore)
      digitsBefore--
    }
  }

  if (digits.length > 8) {
    // Modo sobrescrever: descarta os dígitos logo após o cursor.
    const extra = digits.length - 8
    digits = digits.slice(0, digitsBefore) + digits.slice(digitsBefore + extra)
    digitsBefore = Math.min(digitsBefore, 8)
  }

  const text = formatDateDigits(digits)
  let pos = caretAfterDigits(text, digitsBefore)
  // Ao digitar, pula a barra para continuar no próximo campo.
  if (!inputType.startsWith('delete') && text[pos] === '/') pos++
  return { text, caret: pos }
}

interface DateProps {
  /** YYYY-MM-DD */
  value: string
  onChange: (iso: string) => void
  onBlur?: () => void
  ariaLabel?: string
  autoFocus?: boolean
}

/** Campo de data sempre em DD/MM/AAAA (o input nativo segue o idioma do navegador). */
export function DateInput({ value, onChange, onBlur, ariaLabel, autoFocus }: DateProps) {
  const [text, setText] = useState(isoToBR(value))
  const [focused, setFocused] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const mouseDown = useRef(false)

  // Reaplica a posição do cursor depois que a máscara reescreve o texto.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (el && pendingCaret.current !== null && document.activeElement === el) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  })

  useEffect(() => {
    if (!focused) setText(isoToBR(value))
  }, [value, focused])

  const invalid = text.length === 10 && brToISO(text) === null

  return (
    <span className={`affix-input date-input ${invalid ? 'invalid' : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        ref={inputRef}
        placeholder="DD/MM/AAAA"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        autoFocus={autoFocus}
        value={text}
        onMouseDown={() => (mouseDown.current = true)}
        onMouseUp={() => (mouseDown.current = false)}
        onFocus={(e) => {
          setFocused(true)
          // Pelo teclado (Tab) seleciona tudo; com o mouse respeita a posição clicada.
          if (!mouseDown.current) e.currentTarget.select()
        }}
        onBlur={() => {
          setFocused(false)
          setText(isoToBR(value))
          onBlur?.()
        }}
        onChange={(e) => {
          const el = e.currentTarget
          const inputType = (e.nativeEvent as InputEvent).inputType ?? ''
          const next = editDate(el.value, el.selectionStart ?? el.value.length, text, inputType)
          pendingCaret.current = next.caret
          setText(next.text)
          const iso = brToISO(next.text)
          if (iso) onChange(iso)
        }}
      />
      <button
        type="button"
        className="icon cal"
        tabIndex={-1}
        aria-label="Abrir calendário"
        onClick={() => {
          const el = pickerRef.current
          if (!el) return
          try {
            el.showPicker()
          } catch {
            el.focus()
          }
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="native-picker"
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(e) => {
          if (!e.target.value) return
          onChange(e.target.value)
          onBlur?.()
        }}
      />
    </span>
  )
}

const money = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Formata um valor em reais com a vírgula decimal fixa: 1234.5 -> "1.234,50". */
export function formatMoneyInput(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '' : money.format(v)
}

/**
 * Lê o texto digitado como centavos: os dígitos preenchem da direita para a esquerda
 * ("1" -> 0,01; "1234" -> 12,34). Um número ímpar de "-" torna o valor negativo.
 */
export function parseMoneyInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13)
  if (!digits) return raw.replace(/[^\d]/g, '') ? 0 : null
  const negative = (raw.match(/-/g)?.length ?? 0) % 2 === 1
  const v = Number(digits) / 100
  return negative ? -v : v
}

interface MoneyProps {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/** Campo de dinheiro estilo caixa eletrônico: vírgula fixa, digitação começa pelos centavos. */
export function MoneyInput({ value, onChange, placeholder = '0,00', ariaLabel, autoFocus, onKeyDown }: MoneyProps) {
  const ref = useRef<HTMLInputElement>(null)
  const typed = useRef(false)
  const text = formatMoneyInput(value)

  // Após digitar, mantém o cursor no fim (onde entram os novos centavos).
  useLayoutEffect(() => {
    const el = ref.current
    if (typed.current && el && document.activeElement === el) {
      el.setSelectionRange(el.value.length, el.value.length)
    }
    typed.current = false
  }, [text])

  return (
    <span className="affix-input">
      <span className="affix">R$</span>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        value={text}
        onKeyDown={(e) => {
          // Backspace em "0,00" limpa o campo.
          if (e.key === 'Backspace' && value === 0) {
            e.preventDefault()
            onChange(null)
          }
          onKeyDown?.(e)
        }}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          typed.current = true
          onChange(parseMoneyInput(e.target.value))
        }}
      />
    </span>
  )
}
