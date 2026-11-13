import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import {
  deleteCategory, listAllCategories, reorderCategories, saveCategory, type AdminCategory,
} from '../../lib/admin/adminApi'
import { friendlyError } from '../../lib/admin/errors'
import { optimizeAndUpload, pathFromUrl, removeUnusedFiles } from '../../lib/admin/images'
import { emptyToNull, slugify, SLUG_RE } from '../../lib/admin/text'
import { Badge, Field, PageHeader, TextArea, TextInput, Toggle } from '../../components/admin/Form'
import { Modal, useConfirm } from '../../components/admin/Modal'
import { useToast } from '../../components/admin/Toast'
import { ProductImage } from '../../components/store/ProductImage'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { ArrowDown, ArrowUp, EditIcon, ImageIcon, PlusIcon, TrashIcon } from '../../components/ui/Icons'

interface Draft {
  id?: string
  name: string
  slug: string
  slugEdited: boolean
  description: string
  image_url: string | null
  is_active: boolean
  file?: File
  preview?: string
}

function CategoryModal({ initial, existing, onClose, onSaved }: {
  initial: Draft; existing: AdminCategory[]; onClose: () => void; onSaved: () => void
}) {
  const notify = useToast()
  const [d, setD] = useState<Draft>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!d.name.trim()) errs.name = 'Informe o nome.'
    else if (d.name.trim().length > 80) errs.name = 'Máximo de 80 caracteres.'
    if (!SLUG_RE.test(d.slug)) errs.slug = 'Use apenas letras minúsculas, números e hífens.'
    else if (existing.some((c) => c.slug === d.slug && c.id !== d.id)) errs.slug = 'Já existe uma categoria com este endereço.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      let image_url = d.image_url
      if (d.file) image_url = (await optimizeAndUpload(d.file, 'categories', { maxSize: 800 })).url
      await saveCategory(
        { name: d.name.trim(), slug: d.slug, description: emptyToNull(d.description), image_url, is_active: d.is_active },
        d.id, existing.length,
      )
      // Remove a imagem antiga do Storage quando trocada ou removida
      if (initial.image_url && initial.image_url !== image_url) await removeUnusedFiles([pathFromUrl(initial.image_url)])
      notify(d.id ? 'Categoria atualizada.' : 'Categoria criada.')
      onSaved()
    } catch (err) {
      notify(friendlyError(err, 'Não foi possível salvar a categoria.'), 'error')
    } finally { setSaving(false) }
  }

  const preview = d.preview ?? d.image_url
  return (
    <Modal title={d.id ? 'Editar categoria' : 'Nova categoria'} onClose={onClose} footer={
      <>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" form="category-form" disabled={saving} className="btn-primary h-11">{saving ? 'Salvando...' : 'Salvar'}</button>
      </>
    }>
      <form id="category-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Nome" required error={errors.name}>
          <TextInput autoFocus value={d.name} aria-invalid={errors.name ? true : undefined} maxLength={80}
            onChange={(e) => setD({ ...d, name: e.target.value, slug: d.slugEdited ? d.slug : slugify(e.target.value) })} />
        </Field>
        <Field label="Endereço (slug)" error={errors.slug} hint={`/catalogo?categoria=${d.slug || '...'}`}>
          <TextInput value={d.slug} aria-invalid={errors.slug ? true : undefined}
            onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase(), slugEdited: true })} />
        </Field>
        <Field label="Descrição" hint="Opcional. Exibida no topo da página da categoria.">
          <TextArea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Imagem (opcional)</span>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setD({ ...d, file: f, preview: URL.createObjectURL(f) }); e.target.value = '' }} />
          <div className="flex items-center gap-3">
            {preview ? <img src={preview} alt="" className="size-20 rounded-xl object-cover ring-1 ring-ink-200" />
              : <div className="grid size-20 place-items-center rounded-xl bg-ink-100 text-ink-400"><ImageIcon /></div>}
            <div className="flex flex-col gap-1.5">
              <button type="button" className="btn-secondary h-9 text-xs" onClick={() => fileInput.current?.click()}>{preview ? 'Trocar imagem' : 'Enviar imagem'}</button>
              {preview && <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => setD({ ...d, file: undefined, preview: undefined, image_url: null })}>Remover imagem</button>}
            </div>
          </div>
        </div>
        <Toggle checked={d.is_active} onChange={(v) => setD({ ...d, is_active: v })} label="Ativa" description="Categorias inativas não aparecem na loja." />
      </form>
    </Modal>
  )
}

export default function CategoriesPage() {
  const notify = useToast()
  const confirm = useConfirm()
  const { reload: reloadStore } = useStore()
  const [items, setItems] = useState<AdminCategory[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setError('')
    listAllCategories().then(setItems).catch((e) => setError(friendlyError(e, 'Não foi possível carregar as categorias.')))
  }, [])
  useEffect(() => { document.title = 'Categorias | Painel'; load() }, [load])

  const afterChange = () => { load(); reloadStore() }

  const move = async (i: number, dir: -1 | 1) => {
    if (!items) return
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
    setBusy(true)
    try { await reorderCategories(next.map((c) => c.id)); reloadStore() }
    catch (e) { notify(friendlyError(e), 'error'); load() }
    finally { setBusy(false) }
  }

  const remove = async (c: AdminCategory) => {
    if (c.product_count > 0) {
      notify(`"${c.name}" possui ${c.product_count} produto(s). Mova-os para outra categoria antes de excluir.`, 'error')
      return
    }
    if (!(await confirm({ title: 'Excluir categoria?', danger: true, confirmLabel: 'Excluir', message: <>A categoria <strong>{c.name}</strong> será excluída.</> }))) return
    try {
      await deleteCategory(c.id)
      await removeUnusedFiles([pathFromUrl(c.image_url)])
      notify('Categoria excluída.')
      afterChange()
    } catch (e) { notify(friendlyError(e), 'error') }
  }

  const openNew = () => setEditing({ name: '', slug: '', slugEdited: false, description: '', image_url: null, is_active: true })
  const openEdit = (c: AdminCategory) => setEditing({ id: c.id, name: c.name, slug: c.slug, slugEdited: true, description: c.description ?? '', image_url: c.image_url, is_active: c.is_active })

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!items) return <Spinner />

  return (
    <>
      <PageHeader title="Categorias" description="Use as setas para definir a ordem de exibição na loja."
        actions={<button onClick={openNew} className="btn-primary h-11"><PlusIcon width={18} height={18} /> Nova categoria</button>} />

      {items.length === 0 ? (
        <EmptyState title="Nenhuma categoria" action={<button className="btn-primary" onClick={openNew}>Criar primeira categoria</button>}>
          Categorias organizam o catálogo e aparecem no menu e na página inicial.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
          {items.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 p-3 sm:px-4">
              <div className="flex flex-col">
                <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Mover ${c.name} para cima`} className="grid size-7 place-items-center rounded-full text-ink-500 hover:bg-ink-100 disabled:opacity-25"><ArrowUp width={15} height={15} /></button>
                <button disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Mover ${c.name} para baixo`} className="grid size-7 place-items-center rounded-full text-ink-500 hover:bg-ink-100 disabled:opacity-25"><ArrowDown width={15} height={15} /></button>
              </div>
              {c.image_url ? <ProductImage src={c.image_url} alt="" className="size-12 shrink-0 rounded-lg" />
                : <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand/8 font-display text-lg font-semibold text-brand">{c.name.charAt(0)}</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                  <Link to={`/admin/produtos?categoria=${c.id}`} className="hover:underline">{c.product_count} produto{c.product_count === 1 ? '' : 's'}</Link>
                  {!c.is_active && <Badge>Inativa</Badge>}
                </div>
              </div>
              <button onClick={() => openEdit(c)} aria-label={`Editar ${c.name}`} className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"><EditIcon width={17} height={17} /></button>
              <button onClick={() => remove(c)} aria-label={`Excluir ${c.name}`} title={c.product_count ? 'Possui produtos associados' : 'Excluir'}
                className={`grid size-9 place-items-center rounded-full ${c.product_count ? 'text-ink-300' : 'text-ink-500 hover:bg-red-50 hover:text-red-600'}`}><TrashIcon width={17} height={17} /></button>
            </li>
          ))}
        </ul>
      )}

      {editing && <CategoryModal initial={editing} existing={items} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); afterChange() }} />}
    </>
  )
}
