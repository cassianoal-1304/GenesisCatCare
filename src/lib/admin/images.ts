import { supabase } from '../supabase'

export const BUCKET = 'media'
const MAX_INPUT_BYTES = 20 * 1024 * 1024
const ACCEPTED = /^image\/(jpeg|png|webp|gif|avif|heic|heif|bmp)$/i

export interface OptimizeOptions {
  maxSize?: number      // maior lado em pixels
  quality?: number
  keepAlpha?: boolean   // logotipos: fallback em PNG para preservar transparência
}

/**
 * Redimensiona e converte a imagem no navegador (WebP, ou JPEG/PNG se o
 * navegador não suportar WebP). Reduz drasticamente o tamanho dos arquivos
 * sem depender de serviços pagos de transformação.
 */
export async function optimizeImage(file: File, opts: OptimizeOptions = {}): Promise<Blob> {
  const { maxSize = 1600, quality = 0.82, keepAlpha = false } = opts
  if (file.type === 'image/svg+xml') return file
  if (!ACCEPTED.test(file.type) && file.type !== '') throw new Error(`"${file.name}" não é uma imagem suportada.`)
  if (file.size > MAX_INPUT_BYTES) throw new Error(`"${file.name}" é maior que 20 MB.`)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`Não foi possível ler "${file.name}". Use JPG, PNG ou WebP.`)
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality))
  let blob = await toBlob('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(keepAlpha ? 'image/png' : 'image/jpeg')
  if (!blob) throw new Error(`Falha ao processar "${file.name}".`)
  return blob
}

const extOf = (type: string) => ({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/svg+xml': 'svg' }[type] ?? 'bin')

/** Envia para o Storage e retorna o caminho e a URL pública. */
export async function uploadImage(blob: Blob, folder: string): Promise<{ path: string; url: string }> {
  const path = `${folder}/${crypto.randomUUID()}.${extOf(blob.type)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type, cacheControl: '31536000', upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function optimizeAndUpload(file: File, folder: string, opts?: OptimizeOptions) {
  return uploadImage(await optimizeImage(file, opts), folder)
}

/** Extrai o caminho no bucket a partir de uma URL pública (null se for URL externa). */
export function pathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null
}

/**
 * Remove arquivos do Storage que não são mais usados por nenhuma imagem de produto
 * (produtos duplicados compartilham os mesmos arquivos). Falhas são apenas registradas.
 */
export async function removeUnusedFiles(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  if (unique.length === 0) return
  const { data, error } = await supabase.from('product_images').select('storage_path').in('storage_path', unique)
  if (error) { console.warn(error); return }
  const inUse = new Set((data ?? []).map((r) => r.storage_path))
  const toRemove = unique.filter((p) => !inUse.has(p))
  if (toRemove.length) {
    const { error: rmError } = await supabase.storage.from(BUCKET).remove(toRemove)
    if (rmError) console.warn('Falha ao remover arquivos:', rmError)
  }
}
