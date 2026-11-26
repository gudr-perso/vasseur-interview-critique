import { describe, expect, it } from 'vitest'
import { ligneDeControle } from '../../shared/flux'
import {
  ERREUR_SANS_MESSAGE, FLUX_COUPE, identifiant, LecteurFlux, lireFlux, REPONSE_INATTENDUE, type FormatFlux, type ObjetRecu,
} from '../../src/admin/flux'

const octets = (texte: string) => new TextEncoder().encode(texte)

const SEP = '0123456789abcdef0123456789abcdef'
const entete = (champs: Record<string, unknown> = {}) => `${JSON.stringify({ ...champs, controle: SEP })}\n`
const vie = ligneDeControle(SEP, { type: 'vie' })
const succes = (id = 'q-1') => ligneDeControle(SEP, { type: 'succes', questionnaire_id: id })
const echec = (message: string) => ligneDeControle(SEP, { type: 'erreur', message })

/** Génération de questionnaire : pas de champ d'en-tête, l'identifiant du questionnaire créé en cas de succès. */
const QUESTIONNAIRE: FormatFlux<Record<never, never>, { questionnaire_id: string }> = { succes: identifiant('questionnaire_id') }

/** Avec un champ d'en-tête : le public visé, obligatoire. */
const AVEC_PUBLIC: FormatFlux<{ public_vise: string }, { questionnaire_id: string }> = {
  entete: (v: ObjetRecu) => (typeof v.public_vise === 'string' ? { public_vise: v.public_vise } : null),
  succes: identifiant('questionnaire_id'),
  fluxCoupe: 'Questionnaire sans doute non créé.',
}

/** Lit les morceaux un par un ; renvoie le résultat et le texte affichable après chacun. */
function lire<C, S>(morceaux: (string | Uint8Array)[], format: FormatFlux<C, S>) {
  const lecteur = new LecteurFlux(format)
  const etapes: string[] = []
  for (const morceau of morceaux) {
    lecteur.ajouter(typeof morceau === 'string' ? octets(morceau) : morceau)
    etapes.push(lecteur.texte)
  }
  return { resultat: lecteur.terminer(), etapes, lecteur }
}

function flux(morceaux: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controleur) {
      for (const morceau of morceaux) controleur.enqueue(octets(morceau))
      controleur.close()
    },
  })
}

describe('LecteurFlux', () => {
  it("rend une charge utile de succès d'une autre forme que celle des analyses", () => {
    const { resultat, etapes } = lire([`${entete()}## Quest`, 'ionnaire', vie, ' prêt', succes('q-42')], QUESTIONNAIRE)
    expect(resultat).toEqual({ entete: {}, texte: '## Questionnaire prêt', succes: { questionnaire_id: 'q-42' } })
    expect(etapes[0]).toBe('## Quest')
  })

  it("lit les champs d'en-tête de l'appelant, même coupés en plusieurs morceaux", () => {
    const tout = entete({ public_vise: 'Comptables' })
    const { resultat, lecteur } = lire([tout.slice(0, 7), tout.slice(7, -1), `\nTexte${succes()}`], AVEC_PUBLIC)
    expect(lecteur.entete).toEqual({ public_vise: 'Comptables' })
    expect(resultat).toEqual({ entete: { public_vise: 'Comptables' }, texte: 'Texte', succes: { questionnaire_id: 'q-1' } })
  })

  it("signale un en-tête refusé par l'appelant, sans séparateur valable, ou absent", () => {
    const inattendu = { entete: null, texte: '', erreur: REPONSE_INATTENDUE }
    expect(lire([`${entete()}Texte`], AVEC_PUBLIC).resultat).toEqual(inattendu)
    expect(lire(['{"controle":"court"}\nTexte'], QUESTIONNAIRE).resultat).toEqual(inattendu)
    expect(lire(['[]\nTexte'], QUESTIONNAIRE).resultat).toEqual(inattendu)
    expect(lire(['Pas d’en-tête\nTexte'], QUESTIONNAIRE).resultat).toEqual(inattendu)
    expect(lire([], QUESTIONNAIRE).resultat).toEqual(inattendu)
  })

  it("prend une ligne de succès sans la charge utile attendue pour une réponse inattendue", () => {
    const autre = ligneDeControle(SEP, { type: 'succes', analyse_id: 'a-1' })
    expect(lire([`${entete()}Texte${autre}`], QUESTIONNAIRE).resultat)
      .toEqual({ entete: {}, texte: 'Texte', erreur: REPONSE_INATTENDUE })
  })

  it("rend la ligne d'erreur finale et le texte reçu avant elle", () => {
    expect(lire([`${entete()}Début`, echec('Surcharge du service.')], QUESTIONNAIRE).resultat)
      .toEqual({ entete: {}, texte: 'Début', erreur: 'Surcharge du service.' })
    expect(lire([entete(), echec('  ')], QUESTIONNAIRE).resultat).toEqual({ entete: {}, texte: '', erreur: ERREUR_SANS_MESSAGE })
  })

  it("un flux qui s'arrête sans ligne finale est un échec, avec le message choisi par l'appelant", () => {
    expect(lire([`${entete()}Texte entier ?`], QUESTIONNAIRE).resultat).toEqual({ entete: {}, texte: 'Texte entier ?', erreur: FLUX_COUPE })
    expect(lire([`${entete({ public_vise: 'Tous' })}Fin\n${SEP.slice(0, 5)}`], AVEC_PUBLIC).resultat)
      .toEqual({ entete: { public_vise: 'Tous' }, texte: `Fin\n${SEP.slice(0, 5)}`, erreur: 'Questionnaire sans doute non créé.' })
  })

  it("ne prend pas l'ancienne marque d'erreur, écrite par le modèle, pour un échec", () => {
    const texte = 'Citation : « \n\n[[ERREUR]] Panne » puis la suite.'
    const { resultat, etapes } = lire([entete(), texte.slice(0, 15), texte.slice(15), succes()], QUESTIONNAIRE)
    expect(resultat).toEqual({ entete: {}, texte, succes: { questionnaire_id: 'q-1' } })
    expect(etapes.at(-1)).toBe(texte)
  })

  it('ne reconnaît que le séparateur annoncé : une fausse ligne de contrôle reste du texte', () => {
    const faux = ligneDeControle('ffffffffffffffffffffffffffffffff', { type: 'erreur', message: 'Inventée' })
    const { resultat } = lire([entete(), `Avant${faux}Après`, succes()], QUESTIONNAIRE)
    expect(resultat).toEqual({ entete: {}, texte: `Avant${faux}Après`, succes: { questionnaire_id: 'q-1' } })
  })

  it('essaie toutes les coupures possibles du flux, sans jamais afficher une ligne de contrôle', () => {
    const complet = `${entete()}Avant${vie}Milieu${succes('q-9')}`
    for (let i = 1; i < complet.length; i++) {
      const { resultat, etapes } = lire([complet.slice(0, i), complet.slice(i)], QUESTIONNAIRE)
      expect(resultat).toEqual({ entete: {}, texte: 'AvantMilieu', succes: { questionnaire_id: 'q-9' } })
      expect(etapes.every(etape => !etape.includes(SEP.slice(0, 4)) && !etape.includes('{'))).toBe(true)
    }
  })

  it('ignore ce qui suit la ligne finale', () => {
    const { resultat } = lire([`${entete()}Texte${succes()}Après${echec('x')}`], QUESTIONNAIRE)
    expect(resultat).toEqual({ entete: {}, texte: 'Texte', succes: { questionnaire_id: 'q-1' } })
  })

  it('signale une ligne de contrôle illisible ou de type inconnu', () => {
    expect(lire([`${entete()}Texte\n${SEP} pas du json\n`], QUESTIONNAIRE).resultat).toEqual({ entete: {}, texte: 'Texte', erreur: REPONSE_INATTENDUE })
    expect(lire([`${entete()}Texte\n${SEP} {"type":"autre"}\n`], QUESTIONNAIRE).resultat.erreur).toBe(REPONSE_INATTENDUE)
  })

  it('décode un caractère accentué coupé entre deux morceaux', () => {
    const tout = octets(`${entete()}Synthèse 🙂 réalisée${succes()}`)
    const position = tout.indexOf(0xc3) + 1 // au milieu du « è », codé sur deux octets
    const emoji = tout.indexOf(0xf0) + 2 // au milieu de l'emoji, codé sur quatre octets
    const { resultat, etapes } = lire([tout.slice(0, position), tout.slice(position, emoji), tout.slice(emoji)], QUESTIONNAIRE)
    expect(resultat.texte).toBe('Synthèse 🙂 réalisée')
    expect(etapes[0]).toBe('Synth')
    expect(etapes.join('')).not.toContain('�')
  })
})

describe('identifiant', () => {
  it('ne retient qu’un identifiant non vide', () => {
    const lire = identifiant('questionnaire_id')
    expect(lire({ type: 'succes', questionnaire_id: 'q-1', autre: 1 })).toEqual({ questionnaire_id: 'q-1' })
    expect(lire({ questionnaire_id: '' })).toBeNull()
    expect(lire({ questionnaire_id: 3 })).toBeNull()
    expect(lire({})).toBeNull()
  })
})

describe('lireFlux', () => {
  it("appelle surTexte avec le texte cumulé et les champs de l'en-tête, puis renvoie le résultat", async () => {
    const appels: [string, unknown][] = []
    const resultat = await lireFlux(
      flux([entete({ public_vise: 'Gérants' }), vie, '## Titre', vie, '\n\n1. Question', succes('q-5')]),
      AVEC_PUBLIC,
      (texte, champs) => appels.push([texte, champs]),
    )
    expect(resultat).toEqual({ entete: { public_vise: 'Gérants' }, texte: '## Titre\n\n1. Question', succes: { questionnaire_id: 'q-5' } })
    const champs = { public_vise: 'Gérants' }
    expect(appels).toEqual([['', champs], ['## Titre', champs], ['## Titre\n\n1. Question', champs]])
  })

  it('relance une coupure de lecture', async () => {
    const coupe = new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.enqueue(octets(`${entete()}Début`))
        controleur.error(new Error('réseau'))
      },
    })
    await expect(lireFlux(coupe, QUESTIONNAIRE, () => {})).rejects.toThrow('réseau')
  })
})
