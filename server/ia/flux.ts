// Réponse en flux d'un travail de l'IA qui peut durer, selon le contrat de `shared/flux.ts`. Indépendant de ce
// qui est produit : l'appelant fournit les champs de l'en-tête, le texte au fil de l'eau et la charge utile de succès.

import { ligneDeControle, type ControleFlux, type EnteteFlux } from '../../shared/flux'
import { ErreurMetier } from '../erreurs'
import { ErreurIa } from './types'

/** Sans aucun envoi pendant cette durée, un signal de vie part : Cloudflare coupe une réponse muette vers 100 s. */
export const INTERVALLE_VIE_MS = 15_000
/** Au-delà, l'en-tête non lu est signalé dans les journaux : quelque chose retient le flux en route. */
const DELAI_ENTETE_MS = 10_000

export interface ReglagesFlux {
  /** Pour les tests : intervalle du signal de vie. */
  intervalleVieMs?: number
}

/** Écrit un morceau de texte dans le flux ; jamais à attendre, l'écriture ne bloque pas. */
export type EcrireTexte = (texte: string) => void

export interface OptionsFlux<C extends object, S extends object> {
  /** Champs propres à l'appelant, envoyés dans l'en-tête avant le séparateur ; jamais de champ `controle`. */
  entete: C
  /**
   * Travail à conduire : écrit le texte au fil de l'eau, puis renvoie la charge utile de succès (jamais de champ
   * `type`). Une erreur levée devient la ligne d'erreur.
   */
  produire: (ecrire: EcrireTexte) => Promise<S>
  /** Message affichable pour une erreur levée par `produire`. Par défaut : celui d'une ErreurIa ou d'une ErreurMetier. */
  messageErreur?: (e: unknown) => string
  /** Nom du travail dans les journaux, par exemple « Analyse par l'API ». */
  journal: string
  reglages?: ReglagesFlux
}

/** Ce que `repondreEnFlux` attend du contexte de la Pages Function. */
export interface ContexteFlux {
  waitUntil(promesse: Promise<unknown>): void
}

const ERREUR_INTERNE = 'Erreur interne : la génération a échoué.'

function messageParDefaut(e: unknown): string {
  return e instanceof ErreurIa || e instanceof ErreurMetier ? e.message : ERREUR_INTERNE
}

/** Séparateur des lignes de contrôle : tiré au hasard, jamais montré au modèle, qui ne peut donc pas l'écrire. */
function nouveauSeparateur(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(octets, o => o.toString(16).padStart(2, '0')).join('')
}

/** Écritures dans le flux, signal de vie compris. */
function creerEmetteur(ecrivain: WritableStreamDefaultWriter<Uint8Array>, intervalleVie: number) {
  const encodeur = new TextEncoder()
  const separateur = nouveauSeparateur()
  let navigateurParti = false
  let minuterieVie: ReturnType<typeof setTimeout> | undefined

  // Les écritures ne sont jamais attendues par le travail : sans lecteur, les morceaux s'accumulent en mémoire,
  // et le travail continue au rythme de l'API, pas à celui du navigateur.
  const ecrire = (texte: string): Promise<void> => {
    if (navigateurParti) return Promise.resolve()
    armerVie()
    return ecrivain.write(encodeur.encode(texte)).catch(() => { navigateurParti = true })
  }
  const controler = <S extends object>(controle: ControleFlux<S>) => ecrire(ligneDeControle(separateur, controle))
  // Après `intervalleVie` sans aucun envoi, un signal de vie ; il se réarme à chaque envoi.
  function armerVie() {
    clearTimeout(minuterieVie)
    minuterieVie = setTimeout(() => { void controler({ type: 'vie' }) }, intervalleVie)
  }

  return {
    separateur,
    ecrire,
    controler,
    parti: () => navigateurParti,
    arreterVie: () => clearTimeout(minuterieVie),
  }
}

/**
 * Répond aussitôt avec un flux (servi en `text/event-stream`) selon le contrat de `shared/flux.ts` : en-tête JSON
 * avec le séparateur, texte écrit par `produire` au fil de l'eau, signaux de vie, puis une seule ligne finale
 * (succès avec la charge utile renvoyée par `produire`, ou erreur).
 *
 * Le travail ne dépend pas du navigateur : il est confié à `waitUntil` et écrit chaque morceau dans le flux sans
 * jamais attendre qu'il soit lu. Les refus à opposer avant tout travail se font avant l'appel, en réponse ordinaire.
 */
export function repondreEnFlux<C extends object, S extends object>(
  contexte: ContexteFlux,
  options: OptionsFlux<C, S>,
): Response {
  // Flux d'identité : c'est la forme que le moteur des Workers transmet morceau par morceau. Avec les stratégies
  // par défaut, la promesse d'une écriture n'est tenue qu'une fois le morceau lu par le moteur, c'est-à-dire
  // parti vers le navigateur : elle sert à vérifier que l'en-tête est réellement transmis.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const ecrivain = writable.getWriter()
  const emetteur = creerEmetteur(ecrivain, options.reglages?.intervalleVieMs ?? INTERVALLE_VIE_MS)
  const messageErreur = options.messageErreur ?? messageParDefaut

  const entete: EnteteFlux<C> = { ...options.entete, controle: emetteur.separateur }
  let enteteTransmis = false
  void emetteur.ecrire(`${JSON.stringify(entete)}\n`).then(() => { enteteTransmis = !emetteur.parti() })
  // Vérification : l'écriture de l'en-tête n'est tenue qu'une fois l'en-tête parti. S'il est retenu, on le saura.
  const minuterieEntete = setTimeout(() => {
    if (!enteteTransmis && !emetteur.parti()) {
      console.warn(`${options.journal} : l'en-tête du flux n'est toujours pas parti après ${DELAI_ENTETE_MS / 1000} s.`)
    }
  }, DELAI_ENTETE_MS)

  const conduire = async (): Promise<void> => {
    try {
      const charge = await options.produire(texte => { void emetteur.ecrire(texte) })
      void emetteur.controler<S>({ type: 'succes', ...charge })
    } catch (e) {
      console.error(`${options.journal} :`, e instanceof ErreurIa ? e.message : '', e instanceof ErreurIa ? e.cause ?? '' : e)
      void emetteur.controler({ type: 'erreur', message: messageErreur(e).replace(/\s+/g, ' ').trim() })
    } finally {
      emetteur.arreterVie()
      clearTimeout(minuterieEntete)
      // La fermeture passe après les écritures en attente ; elle échoue sans gravité si le navigateur est parti.
      ecrivain.close().catch(() => {})
    }
  }

  // Sans waitUntil, la fermeture de l'onglet arrêterait le travail en cours ; l'appel garde son récepteur (pas de déstructuration).
  contexte.waitUntil(conduire())

  return new Response(readable, {
    status: 200,
    headers: {
      // `text/event-stream` : Cloudflare (et wrangler en local) compresse un `text/plain` en gzip malgré
      // `no-transform`, ce qui retient les morceaux jusqu'à la fin ; un flux d'événements ne l'est jamais.
      // Le corps garde son propre format (voir `shared/flux.ts`) : le client le lit brut.
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
