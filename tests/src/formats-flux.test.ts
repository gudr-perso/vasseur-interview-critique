import { describe, expect, it } from 'vitest'
import { ligneDeControle } from '../../shared/flux'
import { finDuFlux, LecteurFlux, REPONSE_INATTENDUE, type FormatFlux } from '../../src/admin/flux'
import { FORMAT_PUBLICS, FORMAT_QUESTIONNAIRE, FORMAT_TEXTE_CADRAGE, FORMAT_TOUR } from '../../src/admin/formatsFlux'

const SEP = '0123456789abcdef0123456789abcdef'
const entete = (champs: Record<string, unknown>) => `${JSON.stringify({ ...champs, controle: SEP })}\n`
const succes = (charge: Record<string, unknown>) => ligneDeControle(SEP, { type: 'succes', ...charge })

function lire<C, S>(format: FormatFlux<C, S>, ...morceaux: string[]) {
  const lecteur = new LecteurFlux(format)
  for (const morceau of morceaux) lecteur.ajouter(new TextEncoder().encode(morceau))
  return lecteur.terminer()
}

describe('FORMAT_TOUR', () => {
  const ENTETE = { plafond: 12, questions_posees: 2, contexte_tronque: false }

  const REPONSE = { id: 'm1', role: 'admin', type: 'reponse', contenu: 'Le comptable.', cree_le: '2026-11-26T10:00:00.000Z' }
  const QUESTION = { id: 'm2', role: 'ia', type: 'question', contenu: 'Qui utilise cet écran ?', cree_le: '2026-11-26T10:00:01.000Z' }

  it("lit l'en-tête du tour, la question suivante et les messages écrits pendant le tour", () => {
    const charge = { fin: false, message: 'Qui utilise cet écran ?', messages: [REPONSE, QUESTION] }
    expect(lire(FORMAT_TOUR, entete(ENTETE), succes(charge))).toEqual({ entete: ENTETE, texte: '', succes: charge })
  })

  it('refuse un en-tête incomplet, une charge sans message ou des messages mal formés', () => {
    const messages = [QUESTION]
    expect(lire(FORMAT_TOUR, entete({ plafond: 12, contexte_tronque: false }), succes({ fin: true, message: 'Fin', messages })).erreur)
      .toBe(REPONSE_INATTENDUE)
    expect(lire(FORMAT_TOUR, entete(ENTETE), succes({ fin: true, message: '  ', messages })).erreur).toBe(REPONSE_INATTENDUE)
    expect(lire(FORMAT_TOUR, entete(ENTETE), succes({ fin: 'oui', message: 'Fin', messages })).erreur).toBe(REPONSE_INATTENDUE)
    for (const mauvais of [undefined, [], [{ ...QUESTION, id: '' }], [{ ...QUESTION, type: 'autre' }], [{ ...QUESTION, contenu: 3 }]]) {
      expect(lire(FORMAT_TOUR, entete(ENTETE), succes({ fin: false, message: 'Q ?', messages: mauvais })).erreur).toBe(REPONSE_INATTENDUE)
    }
  })

  it("signale une réponse coupée avant la fin, avec l'en-tête déjà reçu", () => {
    const resultat = lire(FORMAT_TOUR, entete(ENTETE))
    expect(resultat.entete).toEqual(ENTETE)
    expect(resultat.erreur).toMatch(/Relancez/)
  })
})

describe('FORMAT_TEXTE_CADRAGE', () => {
  it('rend le texte au fil de l’eau et la troncature', () => {
    expect(lire(FORMAT_TEXTE_CADRAGE, entete({ contexte_tronque: true }), '## Objectif', succes({ tronquee: false }))).toEqual({
      entete: { contexte_tronque: true }, texte: '## Objectif', succes: { tronquee: false },
    })
  })
})

describe('FORMAT_PUBLICS', () => {
  const PUBLIC = { public_vise: 'Comptables', mode: 'hybride', justification: 'Saisissent les factures.' }

  it('lit les publics proposés', () => {
    expect(lire(FORMAT_PUBLICS, entete({ contexte_tronque: false }), succes({ publics: [PUBLIC] })).succes)
      .toEqual({ publics: [PUBLIC] })
  })

  it('refuse une liste vide, un mode inconnu ou un public sans nom', () => {
    const base = entete({ contexte_tronque: false })
    expect(lire(FORMAT_PUBLICS, base, succes({ publics: [] })).erreur).toBe(REPONSE_INATTENDUE)
    expect(lire(FORMAT_PUBLICS, base, succes({ publics: [{ ...PUBLIC, mode: 'sondage' }] })).erreur).toBe(REPONSE_INATTENDUE)
    expect(lire(FORMAT_PUBLICS, base, succes({ publics: [{ ...PUBLIC, public_vise: ' ' }] })).erreur).toBe(REPONSE_INATTENDUE)
    expect(lire(FORMAT_PUBLICS, base, succes({ publics: ['Comptables'] })).erreur).toBe(REPONSE_INATTENDUE)
  })
})

describe('FORMAT_QUESTIONNAIRE', () => {
  it("lit l'identifiant du brouillon créé", () => {
    expect(lire(FORMAT_QUESTIONNAIRE, entete({ contexte_tronque: false }), succes({ questionnaire_id: 'q-7' })).succes)
      .toEqual({ questionnaire_id: 'q-7' })
  })
})

describe('finDuFlux', () => {
  it('ne conclut au succès que si le serveur l’a confirmé', () => {
    expect(finDuFlux({ entete: { contexte_tronque: false }, texte: 'Note', succes: { tronquee: false } })).toEqual({
      phase: 'terminee', entete: { contexte_tronque: false }, texte: 'Note', succes: { tronquee: false },
    })
    expect(finDuFlux({ entete: { contexte_tronque: false }, texte: 'No', erreur: 'Coupé' })).toEqual({
      phase: 'erreur', entete: { contexte_tronque: false }, texte: 'No', message: 'Coupé',
    })
    expect(finDuFlux({ entete: null, texte: '', erreur: REPONSE_INATTENDUE })).toMatchObject({ phase: 'erreur', entete: null })
  })
})
