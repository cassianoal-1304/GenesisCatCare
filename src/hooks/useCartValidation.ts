import { useCallback, useEffect, useRef, useState } from 'react'
import { useCart } from '../context/CartContext'
import { quoteCart } from '../lib/checkout'

/** Confere o carrinho com o banco ao abrir a página (preços e estoque atuais). */
export function useCartValidation() {
  const { items, applyQuotes } = useCart()
  const [checking, setChecking] = useState(true)
  const [notices, setNotices] = useState<string[]>([])
  const [error, setError] = useState('')
  const itemsRef = useRef(items)
  itemsRef.current = items

  const validate = useCallback(async () => {
    setChecking(true)
    setError('')
    try {
      const quotes = await quoteCart(itemsRef.current)
      const n = applyQuotes(quotes)
      // Acumula: uma nova conferência sem mudanças não apaga avisos anteriores
      if (n.length) setNotices((prev) => [...new Set([...prev, ...n])])
      return n
    } catch {
      setError('Não foi possível conferir os preços e o estoque. Verifique sua conexão.')
      return null
    } finally {
      setChecking(false)
    }
  }, [applyQuotes])

  useEffect(() => { validate() }, [validate])
  return { checking, notices, error, validate, setNotices }
}
