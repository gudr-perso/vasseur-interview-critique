import { describe, expect, it } from 'vitest'
import {
  ANALYSE_VIDE, ERREUR_SANS_MESSAGE, LecteurFluxAnalyse, lireFluxAnalyse, REPONSE_INATTENDUE,
} from '../../src/admin/fluxAnalyse'

const octets = (texte: string) => new TextEncoder().encode(texte)

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
  it("sépare la ligne d'en-tête et accumule le texte", () => {
    const { resultat, etapes } = lire(['{"nb_entretiens":4}\n## Syn', 'thèse\n\nTexte'])
    expect(resultat).toEqual({ nb_entretiens: 4, texte: '## Synthèse\n\nTexte' })
    expect(etapes[0]).toBe('## Syn')
  })

  it("attend la fin de la ligne d'en-tête, même coupée en plusieurs morceaux", () => {
    const { resultat, etapes, lecteur } = lire(['{"nb_entre', 'tiens":2}', '\nBonjour'])
    expect(etapes).toEqual(['', '', 'Bonjour'])
    expect(lecteur.nb_entretiens).toBe(2)
    expect(resultat).toEqual({ nb_entretiens: 2, texte: 'Bonjour' })
  })

  it("accepte un en-tête seul : l'analyse vide est signalée", () => {
    expect(lire(['{"nb_entretiens":1}']).resultat).toEqual({ nb_entretiens: 1, texte: '', erreur: ANALYSE_VIDE })
    expect(lire(['{"nb_entretiens":1}\n', '  \n']).resultat.erreur).toBe(ANALYSE_VIDE)
  })

  it('signale un en-tête illisible ou absent', () => {
    expect(lire(['## Pas d’en-tête\nTexte']).resultat).toEqual({ nb_entretiens: 0, texte: '', erreur: REPONSE_INATTENDUE })
    expect(lire(['{"nb_entretiens":"4"}\nTexte']).resultat.erreur).toBe(REPONSE_INATTENDUE)
    expect(lire([]).resultat.erreur).toBe(REPONSE_INATTENDUE)
  })

  it("détecte et retire la ligne d'erreur finale", () => {
    const { resultat } = lire(['{"nb_entretiens":3}\nDébut du texte', '\n\n[[ERREUR]] Surcharge du service.'])
    expect(resultat).toEqual({ nb_entretiens: 3, texte: 'Début du texte', erreur: 'Surcharge du service.' })
  })

  it("détecte la ligne d'erreur coupée entre deux morceaux, sans jamais l'afficher", () => {
    const { resultat, etapes } = lire(['{"nb_entretiens":3}\nTexte\n', '\n[[ERR', 'EUR]] Délai ', 'dépassé'])
    expect(resultat).toEqual({ nb_entretiens: 3, texte: 'Texte', erreur: 'Délai dépassé' })
    for (const etape of etapes) expect(etape).not.toContain('[')
    expect(etapes).toEqual(['Texte', 'Texte', 'Texte', 'Texte'])
  })

  it('essaie toutes les coupures possibles de la marque', () => {
    const complet = '{"nb_entretiens":1}\nAvant\n\n[[ERREUR]] Panne'
    for (let i = 1; i < complet.length; i++) {
      const { resultat, etapes } = lire([complet.slice(0, i), complet.slice(i)])
      expect(resultat).toEqual({ nb_entretiens: 1, texte: 'Avant', erreur: 'Panne' })
      expect(etapes.every(etape => !etape.includes('[['))).toBe(true)
    }
  })

  it("une erreur sans message reçoit un message par défaut, et peut arriver avant tout texte", () => {
    expect(lire(['{"nb_entretiens":2}\n\n\n[[ERREUR]]']).resultat)
      .toEqual({ nb_entretiens: 2, texte: '', erreur: ERREUR_SANS_MESSAGE })
  })

  it("rend à la fin les caractères retenus qui n'étaient pas une marque d'erreur", () => {
    const { resultat, etapes } = lire(['{"nb_entretiens":1}\nFin\n\n[', '[Note]] suite'])
    expect(etapes[0]).toBe('Fin')
    expect(resultat.texte).toBe('Fin\n\n[[Note]] suite')
    expect(resultat.erreur).toBeUndefined()
    expect(lire(['{"nb_entretiens":1}\nFin\n\n']).resultat.texte).toBe('Fin\n\n')
  })

  it('décode un caractère accentué coupé entre deux morceaux', () => {
    const tout = octets('{"nb_entretiens":1}\nSynthèse 🙂 réalisée')
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
      flux(['{"nb_entretiens":5}\n', '## Titre', '\n\nPremier constat.']),
      (texte, nb) => appels.push([texte, nb]),
    )
    expect(resultat).toEqual({ nb_entretiens: 5, texte: '## Titre\n\nPremier constat.' })
    expect(appels).toEqual([['', 5], ['## Titre', 5], ['## Titre\n\nPremier constat.', 5]])
  })

  it("n'appelle pas surTexte quand le texte affichable ne change pas", async () => {
    const appels: string[] = []
    const resultat = await lireFluxAnalyse(
      flux(['{"nb_entretiens":1}\nA', '\n\n[[ERR', 'EUR]] Coupure']),
      texte => appels.push(texte),
    )
    expect(appels).toEqual(['A'])
    expect(resultat.erreur).toBe('Coupure')
  })

  it('relance une coupure de lecture', async () => {
    const coupe = new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.enqueue(octets('{"nb_entretiens":1}\nDébut'))
        controleur.error(new Error('réseau'))
      },
    })
    await expect(lireFluxAnalyse(coupe, () => {})).rejects.toThrow('réseau')
  })
})
