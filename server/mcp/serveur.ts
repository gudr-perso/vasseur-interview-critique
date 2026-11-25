import { McpServer, createMcpHandler, type CallToolResult } from '@modelcontextprotocol/server'
import { OUTILS, executerOutil, type Contexte } from './outils'

/** Un serveur neuf, avec les outils liés au contexte de la requête en cours. */
function creerServeur(ctx: Contexte): McpServer {
  const serveur = new McpServer({ name: 'interviews-utilisateurs', version: '1.0.0' })
  for (const outil of OUTILS) {
    serveur.registerTool(
      outil.nom,
      {
        description: outil.description,
        inputSchema: outil.schema,
        annotations: { readOnlyHint: outil.lectureSeule },
      },
      // La décomposition donne au résultat la forme ouverte (clés libres) attendue par le SDK.
      async (args): Promise<CallToolResult> => ({ ...(await executerOutil(ctx, outil, args)) }),
    )
  }
  return serveur
}

/**
 * Traite une requête MCP. Sans état : rien n'est gardé d'une requête à l'autre, le point
 * d'entrée du SDK, le serveur et le transport sont créés pour cette seule requête, ce qui
 * convient à une Pages Function et évite toute session à stocker.
 *
 * `createMcpHandler` sert les deux générations du protocole avec les mêmes outils :
 * la révision 2026-07-28 (chaque requête se suffit à elle-même) et, pour les clients 2025,
 * le transport Streamable HTTP sans session (`initialize`, puis des requêtes indépendantes).
 */
export async function traiterRequeteMcp(requete: Request, ctx: Contexte): Promise<Response> {
  const point = createMcpHandler(() => creerServeur(ctx), {
    onerror: e => console.error('MCP :', e.message),
  })
  return point.fetch(requete)
}
