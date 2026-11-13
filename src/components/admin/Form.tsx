import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export const inputClass =
  'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-ink-50 aria-[invalid=true]:border-red-500'

export function Field({ label, hint, error, children, required, className = '' }: {
  label: string; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean; className?: string
}) {
  // Ajuda e erro ficam fora do <label> para não fazerem parte do nome acessível do campo
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-900">
          {label}{required && <span className="text-red-600" aria-hidden> *</span>}
        </span>
        {children}
      </label>
      {error ? <span role="alert" className="mt-1 block text-xs font-medium text-red-600">{error}</span>
        : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </div>
  )
}

export const TextInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputClass} ${p.className ?? ''}`} />
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={4} {...p} className={`${inputClass} resize-y ${p.className ?? ''}`} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputClass} ${p.className ?? ''}`} />

export function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {description && <span className="block text-xs text-ink-500">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-ink-200 transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
    </label>
  )
}

export function Card({ title, description, children, actions }: {
  title?: string; description?: string; children: ReactNode; actions?: ReactNode
}) {
  return (
    <section className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:p-6">
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-semibold text-ink-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          {actions && <div className="shrink-0 whitespace-nowrap">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'accent' }) {
  const tones = {
    gray: 'bg-ink-100 text-ink-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-800', blue: 'bg-sky-50 text-sky-700', accent: 'bg-accent/12 text-accent',
  }
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
