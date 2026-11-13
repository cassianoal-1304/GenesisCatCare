import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useStore } from '../../context/StoreContext'
import { updateSettings } from '../../lib/admin/adminApi'
import { friendlyError } from '../../lib/admin/errors'
import { optimizeAndUpload, pathFromUrl, removeUnusedFiles } from '../../lib/admin/images'
import { emptyToNull, normalizeWhatsApp, parseIntSafe } from '../../lib/admin/text'
import type { StoreSettings } from '../../types/db'
import { Card, Field, PageHeader, TextArea, TextInput, Toggle } from '../../components/admin/Form'
import { useToast } from '../../components/admin/Toast'
import { Spinner } from '../../components/ui/Feedback'
import { ImageIcon } from '../../components/ui/Icons'

type TextKey = 'store_name' | 'tagline' | 'whatsapp_number' | 'email' | 'phone' | 'address' | 'business_hours' |
  'instagram_url' | 'facebook_url' | 'about_text' | 'hero_title' | 'hero_subtitle' | 'hero_cta_label' |
  'footer_text' | 'meta_description' | 'primary_color' | 'accent_color'

type Form = Record<TextKey, string> & { show_stock_count: boolean; default_min_stock: string }

const HEX = /^#[0-9a-f]{6}$/i
const URL_RE = /^https?:\/\/\S+\.\S+/i
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function toForm(s: StoreSettings): Form {
  const str = (v: string | null) => v ?? ''
  return {
    store_name: s.store_name, tagline: str(s.tagline), whatsapp_number: str(s.whatsapp_number), email: str(s.email),
    phone: str(s.phone), address: str(s.address), business_hours: str(s.business_hours), instagram_url: str(s.instagram_url),
    facebook_url: str(s.facebook_url), about_text: str(s.about_text), hero_title: str(s.hero_title),
    hero_subtitle: str(s.hero_subtitle), hero_cta_label: str(s.hero_cta_label), footer_text: str(s.footer_text),
    meta_description: str(s.meta_description), primary_color: s.primary_color, accent_color: s.accent_color,
    show_stock_count: s.show_stock_count, default_min_stock: String(s.default_min_stock),
  }
}

/** Seletor de imagem única (logotipo / banner). */
function ImagePicker({ label, hint, url, file, onPick, onClear, wide }: {
  label: string; hint: string; url: string | null; file: File | null; onPick: (f: File) => void; onClear: () => void; wide?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const u = URL.createObjectURL(file); setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  const src = preview ?? url
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
      <div className="flex flex-wrap items-center gap-3">
        <div className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-200 ${wide ? 'h-24 w-44' : 'size-24'}`}>
          {src ? <img src={src} alt="" className={`size-full ${wide ? 'object-cover' : 'object-contain p-2'}`} /> : <ImageIcon className="text-ink-400" />}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <button type="button" className="btn-secondary h-9 text-xs" onClick={() => input.current?.click()}>{src ? 'Trocar' : 'Enviar imagem'}</button>
          {src && <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={onClear}>Remover</button>}
          <span className="text-xs text-ink-500">{hint}</span>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { settings, reload } = useStore()
  const notify = useToast()
  const [form, setForm] = useState<Form | null>(settings ? toForm(settings) : null)
  const [logo, setLogo] = useState<{ url: string | null; file: File | null }>({ url: settings?.logo_url ?? null, file: null })
  const [hero, setHero] = useState<{ url: string | null; file: File | null }>({ url: settings?.hero_image_url ?? null, file: null })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = 'Configurações | Painel' }, [])
  useEffect(() => {
    if (settings && !form) {
      setForm(toForm(settings))
      setLogo({ url: settings.logo_url, file: null })
      setHero({ url: settings.hero_image_url, file: null })
    }
  }, [settings, form])

  if (!form || !settings) return <Spinner />

  const set = (k: keyof Form, v: string | boolean) => {
    setForm({ ...form, [k]: v })
    if (errors[k]) setErrors({ ...errors, [k]: '' })
  }
  const text = (k: TextKey) => ({ value: form[k], onChange: (e: { target: { value: string } }) => set(k, e.target.value), 'aria-invalid': errors[k] ? true : undefined })

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.store_name.trim()) e.store_name = 'Informe o nome da loja.'
    else if (form.store_name.trim().length > 80) e.store_name = 'Máximo de 80 caracteres.'
    const wa = normalizeWhatsApp(form.whatsapp_number)
    if (form.whatsapp_number.trim() && !/^\d{12,15}$/.test(wa)) e.whatsapp_number = 'Número inválido. Use DDD + número, ex.: (11) 98765-4321.'
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = 'E-mail inválido.'
    for (const k of ['instagram_url', 'facebook_url'] as const) if (form[k].trim() && !URL_RE.test(form[k].trim())) e[k] = 'Informe o endereço completo, começando com https://'
    if (!HEX.test(form.primary_color)) e.primary_color = 'Cor inválida (#RRGGBB).'
    if (!HEX.test(form.accent_color)) e.accent_color = 'Cor inválida (#RRGGBB).'
    const ms = parseIntSafe(form.default_min_stock)
    if (ms == null || Number.isNaN(ms)) e.default_min_stock = 'Número inteiro ≥ 0.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!validate()) { notify('Corrija os campos destacados.', 'error'); return }
    setSaving(true)
    try {
      let logo_url = logo.url
      let hero_image_url = hero.url
      if (logo.file) logo_url = (await optimizeAndUpload(logo.file, 'store', { maxSize: 600, keepAlpha: true })).url
      if (hero.file) hero_image_url = (await optimizeAndUpload(hero.file, 'store', { maxSize: 2000 })).url

      await updateSettings({
        store_name: form.store_name.trim(),
        tagline: emptyToNull(form.tagline), whatsapp_number: form.whatsapp_number.trim() ? normalizeWhatsApp(form.whatsapp_number) : null,
        email: emptyToNull(form.email), phone: emptyToNull(form.phone), address: emptyToNull(form.address),
        business_hours: emptyToNull(form.business_hours), instagram_url: emptyToNull(form.instagram_url),
        facebook_url: emptyToNull(form.facebook_url), about_text: emptyToNull(form.about_text),
        hero_title: emptyToNull(form.hero_title), hero_subtitle: emptyToNull(form.hero_subtitle),
        hero_cta_label: emptyToNull(form.hero_cta_label), footer_text: emptyToNull(form.footer_text),
        meta_description: emptyToNull(form.meta_description),
        primary_color: form.primary_color.toLowerCase(), accent_color: form.accent_color.toLowerCase(),
        show_stock_count: form.show_stock_count, default_min_stock: parseIntSafe(form.default_min_stock) ?? 0,
        logo_url, hero_image_url,
      })
      // Remove arquivos antigos substituídos
      const old = [settings.logo_url !== logo_url ? settings.logo_url : null, settings.hero_image_url !== hero_image_url ? settings.hero_image_url : null]
      await removeUnusedFiles(old.map(pathFromUrl))
      setLogo({ url: logo_url, file: null })
      setHero({ url: hero_image_url, file: null })
      setForm((f) => f && { ...f, whatsapp_number: f.whatsapp_number.trim() ? normalizeWhatsApp(f.whatsapp_number) : '' })
      reload()
      notify('Configurações salvas.')
    } catch (e) {
      notify(friendlyError(e, 'Não foi possível salvar as configurações.'), 'error')
    } finally { setSaving(false) }
  }

  // Função (não componente) para não recriar o input a cada digitação
  const colorField = (k: 'primary_color' | 'accent_color', label: string, hint: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      <div className="flex gap-2">
        <input type="color" value={HEX.test(form[k]) ? form[k] : '#000000'} onChange={(e) => set(k, e.target.value)}
          aria-label={`${label} (seletor)`} className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-ink-200 bg-white p-1" />
        <TextInput {...text(k)} maxLength={7} />
      </div>
    </Field>
  )

  return (
    <form onSubmit={submit} noValidate className="pb-24 lg:pb-0">
      <PageHeader title="Configurações" description="Identidade, contatos e textos da loja."
        actions={<button type="submit" disabled={saving} className="btn-primary hidden h-11 lg:inline-flex">{saving ? 'Salvando...' : 'Salvar configurações'}</button>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Identidade">
          <div className="space-y-4">
            <Field label="Nome da loja" required error={errors.store_name}><TextInput {...text('store_name')} maxLength={80} /></Field>
            <Field label="Slogan" hint="Frase curta exibida no banner e no rodapé."><TextInput {...text('tagline')} maxLength={140} /></Field>
            <ImagePicker label="Logotipo" hint="PNG/SVG com fundo transparente funciona melhor." url={logo.url} file={logo.file}
              onPick={(f) => setLogo({ ...logo, file: f })} onClear={() => setLogo({ url: null, file: null })} />
            <div className="grid gap-4 sm:grid-cols-2">
              {colorField('primary_color', 'Cor principal', 'Botões e fundo do banner.')}
              {colorField('accent_color', 'Cor de destaque', 'Ofertas e contadores.')}
            </div>
          </div>
        </Card>

        <Card title="Contato e WhatsApp">
          <div className="space-y-4">
            <Field label="WhatsApp para pedidos" error={errors.whatsapp_number} hint="Com DDD. O código do Brasil (55) é adicionado automaticamente.">
              <TextInput {...text('whatsapp_number')} inputMode="tel" placeholder="(11) 98765-4321" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefone"><TextInput {...text('phone')} inputMode="tel" /></Field>
              <Field label="E-mail" error={errors.email}><TextInput {...text('email')} type="email" /></Field>
            </div>
            <Field label="Endereço"><TextArea {...text('address')} rows={2} /></Field>
            <Field label="Horário de atendimento"><TextInput {...text('business_hours')} placeholder="Seg a sex, 9h às 18h" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Instagram" error={errors.instagram_url}><TextInput {...text('instagram_url')} placeholder="https://instagram.com/..." /></Field>
              <Field label="Facebook" error={errors.facebook_url}><TextInput {...text('facebook_url')} placeholder="https://facebook.com/..." /></Field>
            </div>
          </div>
        </Card>

        <Card title="Banner da página inicial" description="Se o título ficar vazio, será usado o nome da loja.">
          <div className="space-y-4">
            <Field label="Título"><TextInput {...text('hero_title')} maxLength={80} /></Field>
            <Field label="Subtítulo"><TextArea {...text('hero_subtitle')} rows={2} maxLength={200} /></Field>
            <Field label="Texto do botão" hint="Padrão: “Ver catálogo”."><TextInput {...text('hero_cta_label')} maxLength={30} /></Field>
            <ImagePicker wide label="Imagem de fundo" hint="Horizontal, mínimo 1600px de largura." url={hero.url} file={hero.file}
              onPick={(f) => setHero({ ...hero, file: f })} onClear={() => setHero({ url: null, file: null })} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Textos institucionais">
            <div className="space-y-4">
              <Field label="Sobre a loja" hint="Exibido no rodapé."><TextArea {...text('about_text')} rows={4} /></Field>
              <Field label="Texto do rodapé" hint="Ex.: CNPJ e razão social."><TextInput {...text('footer_text')} /></Field>
              <Field label="Descrição para buscadores (SEO)" hint="Até 160 caracteres."><TextArea {...text('meta_description')} rows={2} maxLength={160} /></Field>
            </div>
          </Card>
          <Card title="Configurações gerais">
            <div className="space-y-4">
              <Toggle checked={form.show_stock_count} onChange={(v) => set('show_stock_count', v)} label="Mostrar “últimas unidades”"
                description="Exibe a quantidade restante quando houver 5 unidades ou menos." />
              <Field label="Estoque mínimo padrão" error={errors.default_min_stock} hint="Valor inicial do alerta de estoque baixo para novos produtos.">
                <TextInput {...text('default_min_stock' as TextKey)} inputMode="numeric" />
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Salvando...' : 'Salvar configurações'}</button>
      </div>
    </form>
  )
}
