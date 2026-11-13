import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { downloadFile, parseCsv, readTextFile } from '../../lib/admin/csv'
import { friendlyError } from '../../lib/admin/errors'
import { COLUMNS, exportProductsCsv, runImport, templateCsv, validateImport, type ImportRow } from '../../lib/admin/productCsv'
import { Badge, Card, PageHeader } from '../../components/admin/Form'
import { useConfirm } from '../../components/admin/Modal'
import { useToast } from '../../components/admin/Toast'
import { Spinner } from '../../components/ui/Feedback'
import { DownloadIcon, UploadIcon } from '../../components/ui/Icons'

type Filter = 'all' | 'create' | 'update' | 'error'

export default function ImportExportPage() {
  const notify = useToast()
  const confirm = useConfirm()
  const { reload } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [ignored, setIgnored] = useState<string[]>([])
  const [fatal, setFatal] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)

  useEffect(() => { document.title = 'Importar e exportar | Painel' }, [])

  const stamp = () => new Date().toISOString().slice(0, 10)

  const doExport = async () => {
    setExporting(true)
    try {
      const { csv, count } = await exportProductsCsv()
      downloadFile(csv, `produtos-${stamp()}.csv`)
      notify(`${count} produto(s) exportado(s).`)
    } catch (e) { notify(friendlyError(e, 'Falha ao exportar.'), 'error') }
    finally { setExporting(false) }
  }

  const analyze = async (file: File) => {
    setRows(null); setFatal(''); setResult(null); setFilter('all'); setIgnored([])
    if (!/\.(csv|txt)$/i.test(file.name)) { setFatal('Selecione um arquivo .csv.'); return }
    if (file.size > 5 * 1024 * 1024) { setFatal('Arquivo muito grande (máx. 5 MB).'); return }
    setFileName(file.name)
    setAnalyzing(true)
    try {
      const table = parseCsv(await readTextFile(file))
      const res = await validateImport(table)
      if (res.fatal) setFatal(res.fatal)
      else { setRows(res.rows); setIgnored(res.ignoredColumns) }
    } catch (e) { setFatal(friendlyError(e, 'Não foi possível ler o arquivo.')) }
    finally { setAnalyzing(false) }
  }

  const counts = rows ? {
    create: rows.filter((r) => r.action === 'create').length,
    update: rows.filter((r) => r.action === 'update').length,
    error: rows.filter((r) => r.action === 'error').length,
  } : { create: 0, update: 0, error: 0 }
  const valid = counts.create + counts.update

  const doImport = async () => {
    if (!rows || !valid) return
    const ok = await confirm({
      title: 'Confirmar importação?',
      message: <>Serão <strong>criados {counts.create}</strong> e <strong>atualizados {counts.update}</strong> produto(s).
        {counts.error > 0 && <> As <strong>{counts.error} linha(s) com erro serão ignoradas.</strong></>}
        <br /><br />A importação é feita de uma só vez: se algo falhar no servidor, nada é alterado.</>,
      confirmLabel: 'Importar',
    })
    if (!ok) return
    setImporting(true)
    try {
      const r = await runImport(rows)
      setResult({ ...r, skipped: counts.error })
      setRows(null)
      reload()
      notify('Importação concluída.')
    } catch (e) { notify(friendlyError(e, 'A importação falhou. Nenhum produto foi alterado.'), 'error') }
    finally { setImporting(false) }
  }

  const visible = rows?.filter((r) => filter === 'all' || r.action === filter) ?? []

  return (
    <>
      <PageHeader title="Importar e exportar" description="Gerencie o catálogo em lote com planilhas CSV (Excel, Google Planilhas)." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Exportar produtos" description="Baixa todos os produtos. Edite a planilha e importe de volta para atualizar em lote.">
          <button onClick={doExport} disabled={exporting} className="btn-primary h-11"><DownloadIcon width={18} height={18} /> {exporting ? 'Exportando...' : 'Exportar CSV'}</button>
        </Card>
        <Card title="Importar produtos" description="Linhas com ID atualizam produtos existentes; linhas sem ID criam novos.">
          <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = '' }} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileInput.current?.click()} disabled={analyzing || importing} className="btn-primary h-11"><UploadIcon width={18} height={18} /> Selecionar arquivo</button>
            <button onClick={() => downloadFile(templateCsv(), 'modelo-produtos.csv')} className="btn-secondary">Baixar modelo</button>
          </div>
        </Card>
      </div>

      {analyzing && <Spinner label="Analisando arquivo..." />}
      {fatal && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{fatal}</p>}

      {result && (
        <div role="status" className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <strong>Importação concluída:</strong> {result.created} criado(s), {result.updated} atualizado(s)
          {result.skipped > 0 && `, ${result.skipped} linha(s) com erro ignorada(s)`}.
        </div>
      )}

      {rows && (
        <Card title={`Prévia: ${fileName}`} description="Revise antes de confirmar. Nada foi gravado ainda.">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {([['all', `Todas (${rows.length})`], ['create', `Novos (${counts.create})`], ['update', `Atualizações (${counts.update})`], ['error', `Com erro (${counts.error})`]] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={`chip h-8 text-xs ${filter === f ? 'chip-active' : ''}`}>{label}</button>
            ))}
          </div>
          {ignored.length > 0 && <p className="mb-3 text-xs text-ink-500">Colunas ignoradas: {ignored.join(', ')}</p>}

          <div className="max-h-[420px] overflow-auto rounded-xl ring-1 ring-ink-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr><th className="px-3 py-2">Linha</th><th className="px-3 py-2">Produto</th><th className="px-3 py-2">Ação</th><th className="px-3 py-2">Observações</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visible.map((r) => (
                  <tr key={r.line} className={r.action === 'error' ? 'bg-red-50/50' : ''}>
                    <td className="px-3 py-2 tabular-nums text-ink-500">{r.line}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2">
                      {r.action === 'create' ? <Badge tone="green">Criar</Badge> : r.action === 'update' ? <Badge tone="blue">Atualizar</Badge> : <Badge tone="red">Erro</Badge>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.errors.map((e) => <p key={e} className="text-red-700">{e}</p>)}
                      {r.warnings.map((w) => <p key={w} className="text-amber-700">{w}</p>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button className="btn-secondary" onClick={() => setRows(null)}>Cancelar</button>
            <button className="btn-primary h-11" disabled={!valid || importing} onClick={doImport}>
              {importing ? 'Importando...' : `Importar ${valid} produto(s)`}
            </button>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <Card title="Formato do arquivo">
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {COLUMNS.map((c) => (
              <li key={c.header}><code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{c.header}</code> {c.help && <span className="text-ink-500">— {c.help}</span>}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            Separador “;” ou “,” (detectado automaticamente). Na atualização, apenas as colunas presentes no arquivo são alteradas;
            células vazias em campos de texto e preço promocional limpam o valor. Variações e upload de fotos são gerenciados na tela do produto.
          </p>
        </Card>
      </div>
    </>
  )
}
