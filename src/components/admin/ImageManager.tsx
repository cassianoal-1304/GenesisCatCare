import { useRef } from 'react'
import { ArrowDown, ArrowUp, ImageIcon, RefreshIcon, StarIcon, TrashIcon, UploadIcon } from '../ui/Icons'

export interface ImageItem {
  key: string
  id?: string
  url: string               // URL pública ou prévia local (blob:)
  storage_path: string | null
  alt: string | null
  file?: File               // arquivo pendente de envio
}

const MAX_IMAGES = 12
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif'

export const newImageItem = (file: File): ImageItem => ({
  key: crypto.randomUUID(), url: URL.createObjectURL(file), storage_path: null, alt: null, file,
})

interface Props {
  images: ImageItem[]
  onChange: (images: ImageItem[]) => void
  onRemove: (item: ImageItem) => void
  onError: (msg: string) => void
}

/** Envio múltiplo, prévia, imagem principal, ordenação, substituição e exclusão. */
export function ImageManager({ images, onChange, onRemove, onError }: Props) {
  const addInput = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const replaceKey = useRef<string | null>(null)

  const validFiles = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    const ok = files.filter((f) => f.type.startsWith('image/') && f.type !== 'image/svg+xml')
    if (ok.length < files.length) onError('Alguns arquivos foram ignorados por não serem imagens.')
    return ok
  }

  const add = (list: FileList | null) => {
    let files = validFiles(list)
    const room = MAX_IMAGES - images.length
    if (files.length > room) { onError(`Máximo de ${MAX_IMAGES} imagens por produto.`); files = files.slice(0, room) }
    if (files.length) onChange([...images, ...files.map(newImageItem)])
  }

  const replace = (list: FileList | null) => {
    const file = validFiles(list)[0]
    const key = replaceKey.current
    if (!file || !key) return
    onChange(images.map((img) => (img.key === key ? { ...img, file, url: URL.createObjectURL(file) } : img)))
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return
    const next = [...images]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <div>
      <input ref={addInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      <input ref={replaceInput} type="file" accept={ACCEPT} hidden onChange={(e) => { replace(e.target.files); e.target.value = '' }} />

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.key} className={`overflow-hidden rounded-xl bg-white ring-1 ${i === 0 ? 'ring-2 ring-brand' : 'ring-ink-200'}`}>
              <div className="relative aspect-square bg-ink-100">
                <img src={img.url} alt={img.alt ?? ''} className="size-full object-cover" />
                {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">Principal</span>}
                {img.file && <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">Não salva</span>}
              </div>
              <div className="flex items-center justify-between px-1 py-1">
                <div className="flex">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Mover para a esquerda" title="Mover antes"
                    className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100 disabled:opacity-30"><ArrowUp width={15} height={15} className="-rotate-90" /></button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === images.length - 1} aria-label="Mover para a direita" title="Mover depois"
                    className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100 disabled:opacity-30"><ArrowDown width={15} height={15} className="-rotate-90" /></button>
                </div>
                <div className="flex">
                  {i > 0 && (
                    <button type="button" onClick={() => move(i, 0)} aria-label="Definir como principal" title="Definir como principal"
                      className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-brand"><StarIcon width={15} height={15} /></button>
                  )}
                  <button type="button" onClick={() => { replaceKey.current = img.key; replaceInput.current?.click() }} aria-label="Substituir imagem" title="Substituir"
                    className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100"><RefreshIcon width={15} height={15} /></button>
                  <button type="button" onClick={() => onRemove(img)} aria-label="Excluir imagem" title="Excluir"
                    className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-red-50 hover:text-red-600"><TrashIcon width={15} height={15} /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {images.length < MAX_IMAGES && (
        <button type="button" onClick={() => addInput.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 px-4 text-sm text-ink-500 transition hover:border-brand hover:text-brand ${images.length ? 'mt-3 py-5' : 'py-10'}`}>
          {images.length ? <UploadIcon /> : <ImageIcon width={28} height={28} />}
          <span className="font-medium">{images.length ? 'Adicionar mais imagens' : 'Enviar imagens'}</span>
          <span className="text-xs">Toque para escolher ou arraste arquivos · JPG, PNG ou WebP · até {MAX_IMAGES}</span>
        </button>
      )}
      <p className="mt-2 text-xs text-ink-500">As imagens são otimizadas automaticamente (WebP, até 1600px) antes do envio. A primeira é a imagem principal.</p>
    </div>
  )
}
