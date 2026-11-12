const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatPrice = (value: number | string) => brl.format(Number(value))

/** Remove acentos e converte para minúsculas (igual ao search_text do banco). */
export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Escapa caracteres especiais de padrões ILIKE e da sintaxe do PostgREST. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c).replace(/[,()]/g, ' ')

/** Divide um texto em itens (um por linha), ignorando linhas vazias e marcadores. */
export const toList = (text: string | null | undefined) =>
  (text ?? '').split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)

export const hasText = (text: string | null | undefined) => Boolean(text && text.trim())

export const discountPercent = (price: number, promo: number) =>
  price > 0 ? Math.round((1 - promo / price) * 100) : 0
