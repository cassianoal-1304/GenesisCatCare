import { useState } from 'react'
import { ImageIcon } from '../ui/Icons'

interface Props {
  src?: string | null
  alt: string
  className?: string
  eager?: boolean
}

/** Imagem com carregamento progressivo e placeholder quando não houver foto. */
export function ProductImage({ src, alt, className = '', eager }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className={`grid place-items-center bg-ink-100 text-ink-300 ${className}`}>
        <ImageIcon width={32} height={32} />
      </div>
    )
  }
  return (
    <div className={`overflow-hidden bg-ink-100 ${className}`}>
      <img
        src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        className={`size-full object-cover transition duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}
