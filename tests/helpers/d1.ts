import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare } from 'miniflare'

const DOSSIER = join(process.cwd(), 'migrations')

/** Base D1 en mémoire avec toutes les migrations appliquées. Appeler `fermer()` en fin de test. */
export async function creerBaseDeTest() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null) } }',
    d1Databases: ['DB'],
  })
  const db = await mf.getD1Database('DB')
  for (const fichier of readdirSync(DOSSIER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DOSSIER, fichier), 'utf8')
      .split('\n')
      .filter(ligne => !ligne.trim().startsWith('--'))
      .join('\n')
    for (const instruction of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      await db.prepare(instruction).run()
    }
  }
  return { db, fermer: () => mf.dispose() }
}
