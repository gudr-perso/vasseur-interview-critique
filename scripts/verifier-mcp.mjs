// Contrôle de bout en bout du serveur MCP, avec le client officiel, dans les deux générations du protocole.
// Usage : MCP_TOKEN=<jeton> node scripts/verifier-mcp.mjs [http://localhost:8790]
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const base = process.argv[2] ?? 'http://localhost:8790'
const jeton = process.env.MCP_TOKEN
if (!jeton) {
  console.error("MCP_TOKEN manquant dans l'environnement.")
  process.exit(1)
}

const OUTILS_ATTENDUS = 13
let echec = false

async function controler(libelle, options) {
  const client = new Client({ name: 'verification', version: '1.0.0' }, options)
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${jeton}`)))

  const { tools } = await client.listTools()
  const guide = await client.callTool({ name: 'lire_guide', arguments: { etape: 'cadrage' } })
  const projets = await client.callTool({ name: 'lister_projets', arguments: {} })
  const inconnu = await client.callTool({ name: 'lire_projet', arguments: { projet_id: 'inconnu' } })

  console.log(`[${libelle}] ${tools.length} outils`)
  console.log(`[${libelle}] lire_guide → ${guide.content[0].text.split('\n')[0]}`)
  console.log(`[${libelle}] lister_projets → ${JSON.parse(projets.content[0].text).length} projet(s)`)
  console.log(`[${libelle}] lire_projet inconnu → isError=${inconnu.isError} « ${inconnu.content[0].text} »`)

  if (tools.length !== OUTILS_ATTENDUS || inconnu.isError !== true) echec = true
  await client.close()
}

await controler('client 2025', undefined)
await controler('client 2026', { versionNegotiation: { mode: 'auto' } })

process.exit(echec ? 1 : 0)
