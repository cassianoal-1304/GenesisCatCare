import { normalizeText } from '../format'

/** Gera um slug válido: "Ração Premium 1kg" → "racao-premium-1kg". */
export const slugify = (s: string) =>
  normalizeText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Aceita "12,50", "12.50", "1.234,56" e "R$ 10". Retorna null se vazio, NaN se inválido. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input == null) return null
  if (typeof input === 'number') return input
  let s = input.replace(/[R$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN
  return Number(s)
}

/** Inteiro >= 0. Retorna null se vazio, NaN se inválido. */
export function parseIntSafe(input: string | number | null | undefined): number | null {
  if (input == null) return null
  if (typeof input === 'number') return Number.isInteger(input) ? input : NaN
  const s = input.trim()
  if (!s) return null
  return /^\d+$/.test(s) ? Number(s) : NaN
}

export const emptyToNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

/** Número de WhatsApp: só dígitos; adiciona 55 a números brasileiros com DDD. */
export function normalizeWhatsApp(input: string): string {
  const d = input.replace(/\D/g, '')
  return d.length === 10 || d.length === 11 ? '55' + d : d
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
