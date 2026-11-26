import { describe, expect, it } from 'vitest'
import { ligneDeControle } from '../../shared/analyses'
import {
  ERREUR_SANS_MESSAGE, FLUX_INACHEVE, LecteurFluxAnalyse, lireFluxAnalyse, REPONSE_INATTENDUE,
} from '../../src/admin/fluxAnalyse'

const octets = (texte: string) => new TextEncoder().encode(texte)

const SEP = '0123456789abcdef0123456789abcdef'
const entete = (nb: number) => `{"nb_entretiens":${nb},"controle":"${SEP}"}\n`
const vie = ligneDeControle(SEP, { type: 'vie' })
const succes = (id = 'analyse-1') => ligneDeControle(SEP, { type: 'succes', analyse_id: id })
const echec = (message: string) => ligneDeControle(SEP, { type: 'erreur', message })

/** Lit les morceaux un par un ; renvoie le résultat et le texte affichable après chacun. */
function lire(morceaux: (string | Uint8Array)[]) {
  const lecteur = new LecteurFluxAnalyse()
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

describe('LecteurFluxAnalyse', () => {
  it("sépare la ligne d'en-tête, accumule le texte et rend l'identifiant de l'analyse enregistrée", () => {
    const { resultat, etapes } = lire([`${entete(4)}## Syn`, 'thèse\n\nTexte', succes('a-42')])
    expect(resultat).toEqual({ nb_entretiens: 4, texte: '## Synthèse\n\nTexte', analyse_id: 'a-42' })
    expect(etapes[0]).toBe('## Syn')
  })

  it("attend la fin de la ligne d'en-tête, même coupée en plusieurs morceaux", () => {
    const tout = entete(2)
    const { resultat, etapes, lecteur } = lire([tout.slice(0, 10), tout.slice(10, -1), `\nBonjour${succes()}`])
    expect(etapes).toEqual(['', '', 'Bonjour'])
    expect(lecteur.nb_entretiens).toBe(2)
    expect(resultat).toEqual({ nb_entretiens: 2, texte: 'Bonjour', analyse_id: 'analyse-1' })
  })

  it('retire les signaux de vie, avant le texte comme au milieu', () => {
    const { resultat, etapes } = lire([entete(1), vie, vie, '## Début', vie, ' et suite', succes()])
    expect(resultat).toEqual({ nb_entretiens: 1, texte: '## Début et suite', analyse_id: 'analyse-1' })
    expect(etapes).toEqual(['', '', '', '## Début', '## Début', '## Début et suite', '## Début et suite'])
  })

  it('signale un en-tête illisible, absent ou sans séparateur valable', () => {
    expect(lire(['## Pas d’en-tête\nTexte']).resultat).toEqual({ nb_entretiens: 0, texte: '', erreur: REPONSE_INATTENDUE })
    expect(lire(['{"nb_entretiens":"4","controle":"' + SEP + '"}\nTexte']).resultat.erreur).toBe(REPONSE_INATTENDUE)
    expect(lire(['{"nb_entretiens":4}\nTexte']).resultat.erreur).toBe(REPONSE_INATTENDUE)
    expect(lire(['{"nb_entretiens":4,"controle":"court"}\nTexte']).resultat.erreur).toBe(REPONSE_INATTENDUE)
    expect(lire([]).resultat.erreur).toBe(REPONSE_INATTENDUE)
  })

  it("rend la ligne d'erreur finale et le texte reçu avant elle", () => {
    const { resultat } = lire([`${entete(3)}Début du texte`, echec('Surcharge du service.')])
    expect(resultat).toEqual({ nb_entretiens: 3, texte: 'Début du texte', erreur: 'Surcharge du service.' })
    expect(lire([entete(2), echec('  ')]).resultat).toEqual({ nb_entretiens: 2, texte: '', erreur: ERREUR_SANS_MESSAGE })
  })

  it('un flux qui s’arrête sans ligne finale est un échec, même avec du texte', () => {
    expect(lire([`${entete(1)}Texte entier ?`]).resultat).toEqual({ nb_entretiens: 1, texte: 'Texte entier ?', erreur: FLUX_INACHEVE })
    expect(lire([entete(1)]).resultat).toEqual({ nb_entretiens: 1, texte: '', erreur: FLUX_INACHEVE })
    // Un début de ligne de contrôle retenu est rendu tel quel.
    expect(lire([`${entete(1)}Fin\n${SEP.slice(0, 5)}`]).resultat).toEqual({ nb_entretiens: 1, texte: `Fin\n${SEP.slice(0, 5)}`, erreur: FLUX_INACHEVE })
  })

  it("ne prend pas l'ancienne marque d'erreur, écrite par le modèle, pour un échec", () => {
    const texte = 'Citation : « \n\n[[ERREUR]] Panne » puis la suite.'
    const { resultat, etapes } = lire([entete(1), texte.slice(0, 15), texte.slice(15), succes()])
    expect(resultat).toEqual({ nb_entretiens: 1, texte, analyse_id: 'analyse-1' })
    expect(etapes.at(-1)).toBe(texte)
  })

  it('ne reconnaît que le séparateur annoncé : une fausse ligne de contrôle reste du texte', () => {
    const faux = ligneDeControle('ffffffffffffffffffffffffffffffff', { type: 'erreur', message: 'Inventée' })
    const { resultat } = lire([entete(1), `Avant${faux}Après`, succes()])
    expect(resultat).toEqual({ nb_entretiens: 1, texte: `Avant${faux}Après`, analyse_id: 'analyse-1' })
  })

  it('essaie toutes les coupures possibles du flux, sans jamais afficher une ligne de contrôle', () => {
    const complet = `${entete(1)}Avant${vie}Milieu${echec('Panne')}`
    for (let i = 1; i < complet.length; i++) {
      const { resultat, etapes } = lire([complet.slice(0, i), complet.slice(i)])
      expect(resultat).toEqual({ nb_entretiens: 1, texte: 'AvantMilieu', erreur: 'Panne' })
      expect(etapes.every(etape => !etape.includes(SEP.slice(0, 4)) && !etape.includes('{'))).toBe(true)
    }
  })

  it('signale une ligne de contrôle illisible', () => {
    expect(lire([`${entete(1)}Texte\n${SEP} pas du json\n`]).resultat).toEqual({ nb_entretiens: 1, texte: 'Texte', erreur: REPONSE_INATTENDUE })
  })

  it('décode un caractère accentué coupé entre deux morceaux', () => {
    const tout = octets(`${entete(1)}Synthèse 🙂 réalisée${succes()}`)
    const position = tout.indexOf(0xc3) + 1 // au milieu du « è », codé sur deux octets
    const emoji = tout.indexOf(0xf0) + 2 // au milieu de l'emoji, codé sur quatre octets
    const { resultat, etapes } = lire([tout.slice(0, position), tout.slice(position, emoji), tout.slice(emoji)])
    expect(resultat.texte).toBe('Synthèse 🙂 réalisée')
    expect(etapes[0]).toBe('Synth')
    expect(etapes.join('')).not.toContain('�')
  })
})

describe('lireFluxAnalyse', () => {
  it("appelle surTexte avec le texte cumulé et le nombre d'entretiens, puis renvoie le résultat", async () => {
    const appels: [string, number][] = []
    const resultat = await lireFluxAnalyse(
      flux([entete(5), vie, '## Titre', '\n\nPremier constat.', succes('a-5')]),
      (texte, nb) => appels.push([texte, nb]),
    )
    expect(resultat).toEqual({ nb_entretiens: 5, texte: '## Titre\n\nPremier constat.', analyse_id: 'a-5' })
    expect(appels).toEqual([['', 5], ['## Titre', 5], ['## Titre\n\nPremier constat.', 5]])
  })

  it("n'appelle pas surTexte quand le texte affichable ne change pas", async () => {
    const appels: string[] = []
    const resultat = await lireFluxAnalyse(flux([`${entete(1)}A`, vie, echec('Coupure')]), texte => appels.push(texte))
    expect(appels).toEqual(['A'])
    expect(resultat.erreur).toBe('Coupure')
  })

  it('relance une coupure de lecture', async () => {
    const coupe = new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.enqueue(octets(`${entete(1)}Début`))
        controleur.error(new Error('réseau'))
      },
    })
    await expect(lireFluxAnalyse(coupe, () => {})).rejects.toThrow('réseau')
  })
})
