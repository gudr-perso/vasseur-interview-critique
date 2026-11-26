import { describe, expect, it } from 'vitest'
import type { TypeMessageCadrage } from '../../shared/cadrage'
import {
  boutonPropose, completerDialogue, consigneDialogue, dernierVu, libelleCompteur, peutTerminer, phaseDialogue,
  reponseEnregistree, zoneReponseVisible,
} from '../../src/admin/dialogueCadrage'

const m = (type: TypeMessageCadrage, contenu = '…') => ({ type, contenu })

describe('phaseDialogue', () => {
  it('suit le dernier message enregistré', () => {
    expect(phaseDialogue([], false)).toBe('vide')
    expect(phaseDialogue([m('question')], false)).toBe('question')
    expect(phaseDialogue([m('question'), m('reponse')], false)).toBe('relance')
    expect(phaseDialogue([m('question'), m('reponse'), m('conclusion')], false)).toBe('conclu')
  })

  it("« Terminer le cadrage » arrête un dialogue commencé, pas un dialogue vide, et ne masque pas une conclusion", () => {
    expect(phaseDialogue([m('question')], true)).toBe('termine')
    expect(phaseDialogue([m('question'), m('reponse')], true)).toBe('termine')
    expect(phaseDialogue([], true)).toBe('vide')
    expect(phaseDialogue([m('conclusion')], true)).toBe('conclu')
  })
})

describe('boutonPropose', () => {
  it('propose le tour qui convient au serveur', () => {
    expect(boutonPropose('vide', false)).toBe('commencer')
    expect(boutonPropose('question', false)).toBe('envoyer')
    // Après un échec, la réponse est enregistrée : un tour avec texte serait refusé (409), sans texte il relance.
    expect(boutonPropose('relance', false)).toBe('relancer')
    expect(boutonPropose('conclu', false)).toBe('rediger_note')
    expect(boutonPropose('termine', false)).toBe('rediger_note')
  })

  it("propose de relancer la première question après un échec, et garde l'envoi tant qu'une question attend", () => {
    expect(boutonPropose('vide', true)).toBe('relancer')
    expect(boutonPropose('question', true)).toBe('envoyer')
  })
})

describe('peutTerminer et consigneDialogue', () => {
  it("ne propose « Terminer » que tant que le dialogue est ouvert", () => {
    expect(peutTerminer('question')).toBe(true)
    expect(peutTerminer('relance')).toBe(true)
    expect(peutTerminer('vide')).toBe(false)
    expect(peutTerminer('conclu')).toBe(false)
    expect(peutTerminer('termine')).toBe(false)
  })

  it('dit comment reprendre après un échec, et quoi faire une fois le dialogue fini', () => {
    expect(consigneDialogue('vide', false)).toBe('')
    expect(consigneDialogue('vide', true)).toMatch(/Relancez/)
    expect(consigneDialogue('relance', false)).toMatch(/enregistrée.*Relancez/)
    expect(consigneDialogue('conclu', false)).toMatch(/Rédigez/)
    expect(consigneDialogue('termine', false)).toMatch(/Rédigez/)
  })
})

describe('libelleCompteur', () => {
  it('numérote la question en cours, puis donne le total', () => {
    expect(libelleCompteur({ plafond: 12, questions_posees: 3 }, 'question')).toBe('Question 3 sur 12 au plus')
    expect(libelleCompteur({ plafond: 3, questions_posees: 3 }, 'conclu')).toBe('3 questions posées sur 3 au plus')
    expect(libelleCompteur({ plafond: 6, questions_posees: 1 }, 'relance')).toBe('1 question posée sur 6 au plus')
    expect(libelleCompteur({ plafond: 6, questions_posees: 0 }, 'vide')).toBe('0 question posée sur 6 au plus')
  })
})

describe('reponseEnregistree', () => {
  it("reconnaît la réponse reçue par le serveur et restée sans suite (le serveur la stocke sans espaces autour)", () => {
    expect(reponseEnregistree([m('question'), m('reponse', 'Les comptables')], '  Les comptables \n')).toBe(true)
  })

  it("ne confond pas une réponse plus ancienne, déjà suivie d'une question, ni un autre texte", () => {
    expect(reponseEnregistree([m('reponse', 'Oui'), m('question')], 'Oui')).toBe(false)
    expect(reponseEnregistree([m('question'), m('reponse', 'Oui')], 'Non')).toBe(false)
    expect(reponseEnregistree([], 'Oui')).toBe(false)
  })
})

describe('completerDialogue, dernierVu, zoneReponseVisible', () => {
  const msg = (id: string, type: TypeMessageCadrage) => ({
    id, type, role: type === 'reponse' ? 'admin' as const : 'ia' as const, contenu: id, cree_le: '2026-11-26T10:00:00.000Z',
  })

  it('complète le fil avec les messages écrits par le tour, compteur et conclusion compris', () => {
    const etat = { messages: [msg('q1', 'question')], plafond: 3, questions_posees: 1, conclu: false }
    expect(completerDialogue(etat, [msg('r1', 'reponse'), msg('q2', 'question')])).toEqual({
      messages: [msg('q1', 'question'), msg('r1', 'reponse'), msg('q2', 'question')], plafond: 3, questions_posees: 2, conclu: false,
    })
    const conclu = completerDialogue(etat, [msg('r1', 'reponse'), msg('c', 'conclusion')])
    expect(conclu).toMatchObject({ questions_posees: 1, conclu: true })
    // Un message déjà présent n'est pas ajouté deux fois.
    expect(completerDialogue(etat, [msg('q1', 'question')]).messages).toHaveLength(1)
  })

  it('donne le dernier message vu, null pour un dialogue vide', () => {
    expect(dernierVu([])).toBeNull()
    expect(dernierVu([{ id: 'a' }, { id: 'b' }])).toBe('b')
  })

  it('garde la zone de réponse visible tant qu\'elle contient du texte', () => {
    expect(zoneReponseVisible('question', '')).toBe(true)
    for (const phase of ['vide', 'relance', 'conclu', 'termine'] as const) {
      expect(zoneReponseVisible(phase, ''), phase).toBe(false)
      expect(zoneReponseVisible(phase, '  \n'), phase).toBe(false)
      expect(zoneReponseVisible(phase, 'Réponse tapée'), phase).toBe(true)
    }
  })
})
