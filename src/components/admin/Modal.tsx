import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CloseIcon } from '../ui/Icons'

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-ink-900/40" onClick={onClose} />
      <div className={`relative flex max-h-[92dvh] w-full animate-fade-in flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="-mr-2 grid size-9 place-items-center rounded-full hover:bg-ink-100"><CloseIcon /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Confirmação: const confirm = useConfirm(); if (await confirm({...})) */
/* ------------------------------------------------------------------ */
interface ConfirmOptions { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => {})
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    return new Promise<boolean>((res) => { resolver.current = res })
  }, [])
  const close = useCallback((v: boolean) => { resolver.current(v); setOpts(null) }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <Modal title={opts.title} onClose={() => close(false)} footer={
          <>
            <button className="btn-secondary" onClick={() => close(false)}>Cancelar</button>
            <button autoFocus onClick={() => close(true)}
              className={`btn-primary h-11 ${opts.danger ? '!bg-red-600' : ''}`}>{opts.confirmLabel ?? 'Confirmar'}</button>
          </>
        }>
          {opts.message && <div className="text-sm leading-relaxed text-ink-700">{opts.message}</div>}
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm deve ser usado dentro de <ConfirmProvider>')
  return ctx
}
