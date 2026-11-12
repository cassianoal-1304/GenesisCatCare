import type { ReactNode } from 'react'
import { BoxIcon } from './Icons'

export function Spinner({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-ink-500">
      <span className="size-5 animate-spin rounded-full border-2 border-ink-200 border-t-brand" />
      {label}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: {
  icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center animate-fade-in">
      <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-brand/8 text-brand">
        {icon ?? <BoxIcon width={28} height={28} />}
      </div>
      <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
      {children && <div className="mt-2 text-sm leading-relaxed text-ink-500">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="font-medium text-ink-900">Algo deu errado</p>
      <p className="mt-1 text-sm text-ink-500">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-5">Tentar novamente</button>
      )}
    </div>
  )
}
