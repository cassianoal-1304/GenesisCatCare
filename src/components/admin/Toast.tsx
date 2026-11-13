import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckIcon, CloseIcon } from '../ui/Icons'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; message: string }

const ToastContext = createContext<((message: string, kind?: Kind) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id))
  const notify = useCallback((message: string, kind: Kind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, kind, message }])
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl ${t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-ink-900 text-white'}`}>
            {t.kind === 'success' && <CheckIcon width={18} height={18} className="mt-0.5 shrink-0 text-emerald-300" />}
            <span className="flex-1 whitespace-pre-line">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso" className="-mr-1 shrink-0 opacity-70 hover:opacity-100"><CloseIcon width={16} height={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}
