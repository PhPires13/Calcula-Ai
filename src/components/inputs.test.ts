import { describe, expect, it } from 'vitest'
import { brToISO, editDate, formatMoneyInput, parseMoneyInput } from './inputs'

describe('MoneyInput', () => {
  it('preenche a partir dos centavos', () => {
    expect(parseMoneyInput('1')).toBe(0.01)
    expect(parseMoneyInput('0,012')).toBe(0.12)
    expect(parseMoneyInput('1,234')).toBe(12.34)
    expect(parseMoneyInput('1.234,567')).toBe(12345.67)
  })
  it('backspace remove o último dígito', () => {
    expect(parseMoneyInput('12,3')).toBe(1.23)
  })
  it('vazio vira null e zeros viram 0', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('0,0')).toBe(0)
  })
  it('sinal negativo', () => {
    expect(parseMoneyInput('12,34-')).toBe(-12.34)
    expect(parseMoneyInput('-12,34-')).toBe(12.34)
  })
  it('sempre exibe duas casas', () => {
    expect(formatMoneyInput(1000)).toBe('1.000,00')
    expect(formatMoneyInput(null)).toBe('')
  })
})

describe('DateInput', () => {
  it('converte DD/MM/AAAA', () => {
    expect(brToISO('15/03/2025')).toBe('2025-03-15')
    expect(brToISO('31/02/2025')).toBeNull()
    expect(brToISO('1/3/2025')).toBeNull()
  })
})

describe('editDate (cursor)', () => {
  it('digitação sequencial insere barras e mantém o cursor no fim', () => {
    expect(editDate('150', 3, '15', 'insertText')).toEqual({ text: '15/0', caret: 4 })
  })
  it('digitar no meio sobrescreve e mantém o cursor no lugar', () => {
    // "15/0|3/2025" -> digita 4 -> "15/04/2025", cursor após o 4 (pula a barra)
    expect(editDate('15/043/2025', 5, '15/03/2025', 'insertText')).toEqual({ text: '15/04/2025', caret: 6 })
  })
  it('apagar no meio mantém o cursor no lugar', () => {
    // "15/03|/2025" backspace -> "15/0/2025"
    expect(editDate('15/0/2025', 4, '15/03/2025', 'deleteContentBackward')).toEqual({ text: '15/02/025', caret: 4 })
  })
  it('backspace logo após a barra apaga o dígito anterior', () => {
    // "15/|03/2025" backspace remove a barra -> apaga o 5
    expect(editDate('1503/2025', 2, '15/03/2025', 'deleteContentBackward')).toEqual({ text: '10/32/025', caret: 1 })
  })
  it('delete antes da barra apaga o dígito seguinte', () => {
    expect(editDate('1503/2025', 2, '15/03/2025', 'deleteContentForward')).toEqual({ text: '15/32/025', caret: 2 })
  })
})
