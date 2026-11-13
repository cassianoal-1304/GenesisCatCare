import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchCategories, fetchSettings } from '../lib/api'
import type { Category, StoreSettings } from '../types/db'

interface StoreState {
  settings: StoreSettings | null
  categories: Category[]
  loading: boolean
  error: string | null
  reload: () => void
}

const StoreContext = createContext<StoreState | null>(null)

/** Aplica as cores configuradas no painel como variáveis CSS. */
function applyTheme(s: StoreSettings) {
  const root = document.documentElement
  root.style.setProperty('--brand', s.primary_color)
  root.style.setProperty('--accent', s.accent_color)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.primary_color)
  document.querySelector('meta[name="description"]')?.setAttribute('content', s.meta_description || s.tagline || s.store_name)
  if (s.logo_url) document.querySelector('link[rel="icon"]')?.setAttribute('href', s.logo_url)
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([fetchSettings(), fetchCategories()])
      .then(([s, c]) => {
        setSettings(s)
        setCategories(c)
        applyTheme(s)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  return (
    <StoreContext.Provider value={{ settings, categories, loading, error, reload: load }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore deve ser usado dentro de <StoreProvider>')
  return ctx
}
