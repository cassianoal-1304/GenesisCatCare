import { MinusIcon, PlusIcon } from './Icons'

interface Props {
  value: number
  max: number
  onChange: (n: number) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function QuantityInput({ value, max, onChange, size = 'md', disabled }: Props) {
  const h = size === 'sm' ? 'h-9' : 'h-12'
  const w = size === 'sm' ? 'w-9' : 'w-11'
  const limit = Math.max(1, Math.min(max, 999))
  return (
    <div className={`inline-flex ${h} items-center rounded-full border border-ink-200 bg-white`}>
      <button type="button" aria-label="Diminuir quantidade" disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        className={`grid ${h} ${w} place-items-center rounded-l-full text-ink-700 hover:bg-ink-50 disabled:opacity-35`}>
        <MinusIcon width={16} height={16} />
      </button>
      <input
        type="number" inputMode="numeric" min={1} max={limit} value={value} disabled={disabled}
        aria-label="Quantidade"
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          if (!Number.isNaN(n)) onChange(Math.max(1, Math.min(n, limit)))
        }}
        className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums text-ink-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" aria-label="Aumentar quantidade" disabled={disabled || value >= limit}
        onClick={() => onChange(value + 1)}
        className={`grid ${h} ${w} place-items-center rounded-r-full text-ink-700 hover:bg-ink-50 disabled:opacity-35`}>
        <PlusIcon width={16} height={16} />
      </button>
    </div>
  )
}
