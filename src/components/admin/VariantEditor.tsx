import { useState } from 'react'
import { inputClass } from './Form'
import { CloseIcon, PlusIcon, TrashIcon } from '../ui/Icons'

export interface VariantItem {
  key: string
  id?: string
  options: Record<string, string>
  name: string
  sku: string
  price: string
  promo_price: string
  stock: string
  originalStock: number
  is_active: boolean
}

const PRESETS = ['Tamanho', 'Cor', 'Modelo', 'Voltagem', 'Sabor', 'Peso']

export const variantName = (v: VariantItem, attrs: string[]) =>
  attrs.length ? attrs.map((a) => v.options[a]?.trim()).filter(Boolean).join(' / ') : v.name

export const emptyVariant = (attrs: string[], options: Record<string, string> = {}): VariantItem => ({
  key: crypto.randomUUID(), options: Object.fromEntries(attrs.map((a) => [a, options[a] ?? ''])),
  name: '', sku: '', price: '', promo_price: '', stock: '0', originalStock: 0, is_active: true,
})

interface Props {
  attributes: string[]
  variants: VariantItem[]
  errors: Record<string, string>
  onAttributesChange: (attrs: string[]) => void
  onChange: (variants: VariantItem[]) => void
  onRemove: (v: VariantItem) => void
}

export function VariantEditor({ attributes, variants, errors, onAttributesChange, onChange, onRemove }: Props) {
  const [newAttr, setNewAttr] = useState('')
  const [bulk, setBulk] = useState<Record<string, string>>({})

  const addAttr = (name: string) => {
    const n = name.trim().slice(0, 30)
    if (!n || attributes.some((a) => a.toLowerCase() === n.toLowerCase())) return
    onAttributesChange([...attributes, n])
    onChange(variants.map((v) => ({ ...v, options: { ...v.options, [n]: '' } })))
    setNewAttr('')
  }
  const removeAttr = (name: string) => {
    onAttributesChange(attributes.filter((a) => a !== name))
    onChange(variants.map((v) => { const o = { ...v.options }; delete o[name]; return { ...v, options: o } }))
  }

  const set = (key: string, patch: Partial<VariantItem>) =>
    onChange(variants.map((v) => (v.key === key ? { ...v, ...patch } : v)))

  /** Gera todas as combinações dos valores informados (ex.: P,M,G × Azul,Rosa). */
  const generate = () => {
    const lists = attributes.map((a) => (bulk[a] ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    if (lists.some((l) => l.length === 0)) return
    let combos: Record<string, string>[] = [{}]
    attributes.forEach((a, i) => { combos = combos.flatMap((c) => lists[i].map((val) => ({ ...c, [a]: val }))) })
    const exists = (c: Record<string, string>) => variants.some((v) => attributes.every((a) => (v.options[a] ?? '').toLowerCase() === c[a].toLowerCase()))
    const fresh = combos.filter((c) => !exists(c)).slice(0, 100 - variants.length).map((c) => emptyVariant(attributes, c))
    onChange([...variants, ...fresh])
    setBulk({})
  }
  const canGenerate = attributes.length > 0 && attributes.every((a) => (bulk[a] ?? '').trim())

  const small = `${inputClass} !px-2.5 !py-2 text-sm`

  return (
    <div className="space-y-5">
      {/* Atributos */}
      <div>
        <p className="mb-2 text-sm font-medium">Tipos de variação</p>
        <div className="flex flex-wrap items-center gap-2">
          {attributes.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-1 pl-3 pr-1 text-sm font-medium text-brand">
              {a}
              <button type="button" onClick={() => removeAttr(a)} aria-label={`Remover ${a}`} className="grid size-6 place-items-center rounded-full hover:bg-brand/15"><CloseIcon width={13} height={13} /></button>
            </span>
          ))}
          {PRESETS.filter((p) => !attributes.includes(p)).map((p) => (
            <button key={p} type="button" onClick={() => addAttr(p)} className="chip h-8 border-dashed text-xs">+ {p}</button>
          ))}
          <div className="flex">
            <input value={newAttr} onChange={(e) => setNewAttr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttr(newAttr) } }} placeholder="Outro (ex.: Material)" aria-label="Novo tipo de variação"
              className="h-8 w-40 rounded-l-full border border-ink-200 px-3 text-xs outline-none focus:border-brand" />
            <button type="button" onClick={() => addAttr(newAttr)} className="h-8 rounded-r-full border border-l-0 border-ink-200 px-3 text-xs font-medium hover:bg-ink-50">Adicionar</button>
          </div>
        </div>
      </div>

      {/* Gerador de combinações */}
      {attributes.length > 0 && (
        <div className="rounded-xl bg-ink-50 p-3">
          <p className="mb-2 text-xs font-medium text-ink-700">Gerar combinações automaticamente (separe os valores por vírgula)</p>
          <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))_auto]">
            {attributes.map((a) => (
              <input key={a} value={bulk[a] ?? ''} onChange={(e) => setBulk({ ...bulk, [a]: e.target.value })}
                placeholder={`${a}: ex. ${a === 'Tamanho' ? 'P, M, G' : a === 'Cor' ? 'Azul, Preto' : a === 'Voltagem' ? '110V, 220V' : 'valor 1, valor 2'}`}
                aria-label={`Valores de ${a}`} className={small} />
            ))}
            <button type="button" onClick={generate} disabled={!canGenerate} className="btn-secondary h-10 text-sm">Gerar</button>
          </div>
        </div>
      )}

      {/* Lista de variações */}
      {variants.length > 0 && (
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_96px_96px_84px_110px_40px_36px] gap-2 px-1 text-xs font-medium text-ink-500 lg:grid">
            <span>{attributes.length ? attributes.join(' / ') : 'Nome da opção'}</span><span>Preço próprio</span><span>Promocional</span><span>Estoque</span><span>SKU</span><span>Ativa</span><span />
          </div>
          {variants.map((v) => {
            const err = errors[v.key]
            return (
              <div key={v.key} className={`rounded-xl border p-2.5 lg:grid lg:grid-cols-[1fr_96px_96px_84px_110px_40px_36px] lg:items-center lg:gap-2 lg:border-0 lg:p-1 ${err ? 'border-red-300 bg-red-50/40' : 'border-ink-200'} ${v.is_active ? '' : 'opacity-60'}`}>
                <div className="mb-2 flex gap-2 lg:mb-0">
                  {attributes.length ? attributes.map((a) => (
                    <input key={a} value={v.options[a] ?? ''} placeholder={a} aria-label={`${a} da variação`}
                      onChange={(e) => set(v.key, { options: { ...v.options, [a]: e.target.value } })} className={`${small} min-w-0`} />
                  )) : (
                    <input value={v.name} placeholder="Ex.: Kit com 3" aria-label="Nome da variação"
                      onChange={(e) => set(v.key, { name: e.target.value })} className={small} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:contents">
                  <label className="lg:contents"><span className="mb-0.5 block text-[11px] text-ink-500 lg:hidden">Preço próprio</span>
                    <input inputMode="decimal" value={v.price} placeholder="Do produto" onChange={(e) => set(v.key, { price: e.target.value })} className={small} /></label>
                  <label className="lg:contents"><span className="mb-0.5 block text-[11px] text-ink-500 lg:hidden">Promocional</span>
                    <input inputMode="decimal" value={v.promo_price} placeholder="—" onChange={(e) => set(v.key, { promo_price: e.target.value })} className={small} /></label>
                  <label className="lg:contents"><span className="mb-0.5 block text-[11px] text-ink-500 lg:hidden">Estoque</span>
                    <input inputMode="numeric" value={v.stock} onChange={(e) => set(v.key, { stock: e.target.value })} className={small} aria-label="Estoque da variação" /></label>
                  <label className="lg:contents"><span className="mb-0.5 block text-[11px] text-ink-500 lg:hidden">SKU</span>
                    <input value={v.sku} placeholder="Opcional" onChange={(e) => set(v.key, { sku: e.target.value })} className={small} /></label>
                </div>
                <div className="mt-2 flex items-center justify-between lg:contents">
                  <label className="flex items-center gap-2 text-xs lg:justify-center">
                    <input type="checkbox" checked={v.is_active} onChange={(e) => set(v.key, { is_active: e.target.checked })} className="size-4 accent-[var(--brand)]" />
                    <span className="lg:sr-only">Ativa</span>
                  </label>
                  <button type="button" onClick={() => onRemove(v)} aria-label="Remover variação"
                    className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-red-50 hover:text-red-600"><TrashIcon width={16} height={16} /></button>
                </div>
                {err && <p role="alert" className="mt-1 text-xs font-medium text-red-600 lg:col-span-7">{err}</p>}
              </div>
            )
          })}
        </div>
      )}

      <button type="button" onClick={() => onChange([...variants, emptyVariant(attributes)])} className="btn-secondary h-10 text-sm">
        <PlusIcon width={16} height={16} /> Adicionar variação
      </button>
      {variants.length > 0 && (
        <p className="text-xs text-ink-500">
          Cada variação tem estoque próprio. Deixe o preço em branco para usar o preço do produto.
          Variações inativas não aparecem na loja.
        </p>
      )}
    </div>
  )
}
