/** Leitura e escrita de CSV (RFC 4180), sem dependências. */

/** Detecta o separador mais provável na primeira linha (Excel em português usa ";"). */
function detectDelimiter(text: string) {
  const firstLine = text.slice(0, text.indexOf('\n') >= 0 ? text.indexOf('\n') : undefined)
  const count = (d: string) => firstLine.split(d).length
  return count(';') >= count(',') ? (count(';') > count('\t') ? ';' : '\t') : count(',') >= count('\t') ? ',' : '\t'
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const d = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === d) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const escape = (v: unknown, d: string) => {
  const s = v == null ? '' : String(v)
  return /["\n\r]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Gera CSV com BOM (acentos corretos no Excel) e separador ";". */
export function toCsv(rows: unknown[][], delimiter = ';') {
  return '﻿' + rows.map((r) => r.map((v) => escape(v, delimiter)).join(delimiter)).join('\r\n')
}

/** Lê o arquivo como UTF-8; se houver caracteres inválidos, tenta Windows-1252 (Excel antigo). */
export async function readTextFile(file: File) {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

export function downloadFile(content: string, filename: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
