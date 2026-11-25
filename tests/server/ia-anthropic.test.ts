import { describe, expect, it, vi } from 'vitest'
import { creerIaAnthropic } from '../../server/ia/anthropic'
import { ErreurIa } from '../../server/ia/types'

const contexte = { titre_projet: 'P', public_vise: 'Comptables', logiciels: [], resume_contexte: '' }
const demandeRelance = {
  contexte, question: { id: 'q1', type: 'texte' as const, libelle: 'Comment ?', objectif: 'o' }, reponse: 'Bof', relances: [],
}

function reponseApi(corps: object, stop_reason = 'end_turn', statut = 200) {
  return new Response(JSON.stringify({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason, stop_sequence: null,
    content: [{ type: 'text', text: JSON.stringify(corps) }],
    usage: { input_tokens: 10, output_tokens: 10 },
  }), { status: statut, headers: { 'Content-Type': 'application/json' } })
}

function ia(fetch: typeof globalThis.fetch) {
  return creerIaAnthropic({ cleApi: 'sk-test', modele: 'claude-sonnet-5-5', fetch })
}

describe('IA Anthropic', () => {
  it('décide une relance et envoie modèle, consigne, effort et format attendu', async () => {
    const appel = vi.fn(async () => reponseApi({ relancer: true, question: 'Pouvez-vous donner un exemple ?' }))
    const decision = await ia(appel as never).deciderRelance(demandeRelance)
    expect(decision).toEqual({ relancer: true, question: 'Pouvez-vous donner un exemple ?' })
    const corps = JSON.parse((appel.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(corps.model).toBe('claude-sonnet-5-5')
    expect(corps.system).toContain('vouvo')
    expect(corps.output_config.effort).toBe('low')
    expect(corps.output_config.format.type).toBe('json_schema')
  })

  it('traite comme « pas de relance » une question vide quand relancer est vrai', async () => {
    const appel = vi.fn(async () => reponseApi({ relancer: true, question: '  ' }))
    await expect(ia(appel as never).deciderRelance(demandeRelance)).rejects.toThrow(ErreurIa)
  })

  it('lève ErreurIa sur refus, réponse tronquée, et erreur de l\'API', async () => {
    for (const reponse of [
      () => reponseApi({ relancer: false, question: null }, 'refusal'),
      () => reponseApi({ relancer: false, question: null }, 'max_tokens'),
      () => new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }), { status: 529 }),
    ]) {
      await expect(ia(vi.fn(async () => reponse()) as never).deciderRelance(demandeRelance)).rejects.toThrow(ErreurIa)
    }
  })

  it('refait l\'appel sans effort si le modèle choisi ne le prend pas en charge', async () => {
    const appel = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'effort: unsupported for this model' } }), { status: 400 }))
      .mockResolvedValueOnce(reponseApi({ relancer: false, question: null }))
    await expect(ia(appel as never).deciderRelance(demandeRelance)).resolves.toEqual({ relancer: false, question: null })
    const second = JSON.parse((appel.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
    expect(second.output_config.effort).toBeUndefined()
  })

  it('renvoie le tour suivant d\'un entretien, et borne la question', async () => {
    const appel = vi.fn(async () => reponseApi({ fin: false, question: 'Et ensuite ?', themes_couverts: ['t1'] }))
    const tour = await ia(appel as never).prochainTour({
      contexte, question_ouverture: 'Racontez.', themes: [{ id: 't1', titre: 'T', objectif: 'O' }],
      historique: [{ question: 'Racontez.', reponse: 'Bonjour' }], tours_restants: 4,
    })
    expect(tour).toEqual({ fin: false, question: 'Et ensuite ?', themes_couverts: ['t1'] })

    const tropLongue = vi.fn(async () => reponseApi({ fin: false, question: 'x'.repeat(501), themes_couverts: [] }))
    await expect(ia(tropLongue as never).prochainTour({
      contexte, question_ouverture: 'R', themes: [], historique: [], tours_restants: 1,
    })).rejects.toThrow(ErreurIa)
  })
})
