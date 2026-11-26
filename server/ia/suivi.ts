// Point de passage unique du coût de l'IA : la fonction `fetch` du client SDK et du proxy de l'interview critique.
// Requête et réponse passent sans changement ; les jetons sont lus sur une copie, après coup, puis enregistrés
// par `waitUntil`. Une panne ici est journalisée et n'interrompt jamais l'appel utile.

import type { Poste } from '../../shared/tarifs'
import { enregistrerConsommation } from '../services/couts'

export interface Suivi {
  db: D1Database
  poste: Poste
  projet_id: string | null
  /** `context.waitUntil` de la route. */
  attendre?: (promesse: Promise<unknown>) => void
}

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

interface Lecture { modele: string | null; usage: Usage }

function planifier(suivi: Suivi, travail: Promise<unknown>): void {
  const protege = travail.catch(e => console.error("Coût de l'IA", e instanceof Error ? e.message : e))
  try {
    suivi.attendre?.(protege)
  } catch (e) {
    // `waitUntil` absent ou refusé : la lecture continue sans garantie d'aller au bout, l'appel utile n'en souffre pas.
    console.error("Coût de l'IA", e instanceof Error ? e.message : e)
  }
}

function fusionner(cible: Usage, source: Usage | undefined): void {
  if (source) Object.assign(cible, Object.fromEntries(Object.entries(source).filter(([, v]) => v != null)))
}

async function lireFlux(corps: ReadableStream<Uint8Array>): Promise<Lecture> {
  const lecture: Lecture = { modele: null, usage: {} }
  const lecteur = corps.pipeThrough(new TextDecoderStream()).getReader()
  let tampon = ''
  try {
    for (;;) {
      const { value, done } = await lecteur.read()
      if (done) break
      tampon += value
      for (let fin = tampon.indexOf('\n\n'); fin >= 0; fin = tampon.indexOf('\n\n')) {
        const donnees = tampon.slice(0, fin).split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
        tampon = tampon.slice(fin + 2)
        if (!donnees) continue
        let e: { type?: string; message?: { model?: string; usage?: Usage }; usage?: Usage }
        try { e = JSON.parse(donnees) } catch { continue }
        if (e.type === 'message_start') { lecture.modele = e.message?.model ?? null; fusionner(lecture.usage, e.message?.usage) }
        else if (e.type === 'message_delta') fusionner(lecture.usage, e.usage)
      }
    }
  } catch {
    // Flux coupé : on garde les derniers compteurs reçus.
  }
  return lecture
}

async function enregistrer(suivi: Suivi, modeleDemande: string, { modele, usage }: Lecture): Promise<void> {
  const jetons = {
    entree: usage.input_tokens ?? 0,
    sortie: usage.output_tokens ?? 0,
    cache_lecture: usage.cache_read_input_tokens ?? 0,
    cache_ecriture: usage.cache_creation_input_tokens ?? 0,
  }
  if (Object.values(jetons).every(n => n === 0)) return
  await enregistrerConsommation(suivi.db, { poste: suivi.poste, projet_id: suivi.projet_id, modele: modele ?? modeleDemande, jetons })
}

function modeleDemande(corps: unknown): string {
  try {
    const model = typeof corps === 'string' ? (JSON.parse(corps) as { model?: unknown }).model : undefined
    return typeof model === 'string' ? model : 'inconnu'
  } catch {
    return 'inconnu'
  }
}

export function fetchSuivi(suivi: Suivi, sous?: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (entree, init) => {
    const appeler = sous ?? globalThis.fetch
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url
    const methode = init?.method ?? (entree instanceof Request ? entree.method : 'GET')
    if (methode.toUpperCase() !== 'POST' || !url.split('?')[0].endsWith('/v1/messages')) return appeler(entree, init)

    const reponse = await appeler(entree, init)
    try {
      if (!reponse.ok || !reponse.body) return reponse
      const demande = modeleDemande(init?.body)
      if (reponse.headers.get('content-type')?.includes('text/event-stream')) {
        const [pourAppelant, pourCompteur] = reponse.body.tee()
        planifier(suivi, lireFlux(pourCompteur).then(l => enregistrer(suivi, demande, l)))
        return new Response(pourAppelant, { status: reponse.status, statusText: reponse.statusText, headers: reponse.headers })
      }
      const copie = reponse.clone()
      planifier(suivi, (copie.json() as Promise<{ model?: string; usage?: Usage }>).then(m =>
        enregistrer(suivi, demande, { modele: m.model ?? null, usage: m.usage ?? {} })))
      return reponse
    } catch (e) {
      console.error("Coût de l'IA", e instanceof Error ? e.message : e)
      return reponse
    }
  }
}
