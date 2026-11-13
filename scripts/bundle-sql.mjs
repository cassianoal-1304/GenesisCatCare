// Gera supabase/instalacao_completa.sql juntando as migrações na ordem correta.
// Uso: npm run sql:bundle
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'supabase/migrations'
const files = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f) && !f.startsWith('005')).sort()
const header = `-- =====================================================================
-- INSTALAÇÃO COMPLETA DO BANCO (gerado automaticamente — não edite)
-- Contém, em ordem: ${files.join(', ')}
-- Execute de uma vez no SQL Editor do Supabase em um projeto NOVO.
-- Depois, crie o administrador com supabase/migrations/005_create_admin.sql.
-- =====================================================================
`
const body = files.map((f) => `\n-- >>>>>>>>>>>>>>>>>>>> ${f} <<<<<<<<<<<<<<<<<<<<\n` + readFileSync(join(dir, f), 'utf8')).join('\n')
writeFileSync('supabase/instalacao_completa.sql', header + body)
console.log('supabase/instalacao_completa.sql gerado com', files.length, 'arquivos')
