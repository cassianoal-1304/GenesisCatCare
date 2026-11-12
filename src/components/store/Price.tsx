import { discountPercent, formatPrice } from '../../lib/format'

interface Props {
  current: number
  original?: number | null
  fromLabel?: boolean
  size?: 'sm' | 'lg'
}

/** Exibe preço atual, preço "de" riscado e % de desconto. */
export function Price({ current, original, fromLabel, size = 'sm' }: Props) {
  const showOriginal = original != null && Number(original) > Number(current)
  const big = size === 'lg'
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {fromLabel && <span className="text-xs text-ink-500">a partir de</span>}
      <span className={`${big ? 'text-3xl' : 'text-base'} font-bold tabular-nums tracking-tight text-ink-900`}>
        {formatPrice(current)}
      </span>
      {showOriginal && (
        <>
          <span className={`${big ? 'text-base' : 'text-xs'} tabular-nums text-ink-400 line-through`}>
            {formatPrice(original!)}
          </span>
          {big && (
            <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-semibold text-accent">
              -{discountPercent(Number(original), Number(current))}%
            </span>
          )}
        </>
      )}
    </div>
  )
}
