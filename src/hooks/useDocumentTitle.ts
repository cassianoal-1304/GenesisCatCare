import { useEffect } from 'react'
import { useStore } from '../context/StoreContext'

/** Define o título da aba: "Página | Nome da loja". */
export function useDocumentTitle(title?: string) {
  const { settings } = useStore()
  useEffect(() => {
    const store = settings?.store_name ?? ''
    document.title = title ? `${title} | ${store}` : store
  }, [title, settings?.store_name])
}
