import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as generer from '../../functions/api/admin/projets/[id]/questionnaires/generer'
import * as publics from '../../functions/api/admin/projets/[id]/questionnaires/publics'
import { route } from '../../server/api'
import { consigneSansOutils } from '../../server/guides'
import type { OptionsAppelIa } from '../../server/ia/cadrage'
import { consigneQuestionnaire, repondreGeneration, repondrePublics, SECTION_ADMIN } from '../../server/ia/questionnaires'
import { contexteCadrage } from '../../server/services/cadrage'
import { ajouterDocument, creerProjet, lireProjet, modifierProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, lireQuestionnaire } from '../../server/services/questionnaires'
import type { SuccesGeneration, SuccesPublics } from '../../shared/generation'
import { creerBaseDeTest } from '../helpers/d1'
import { analyserFlux, apiSimulee, contexteRoute, reponseJson, reponseSse } from '../helpers/api-messages'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

const MODELE = 'claude-modele-cadrage-du-projet'
type Handler = (contexte: never) => Promise<Response>

async function nouveauProjet(note = '## Objectif\nSavoir comment les comptables saisissent les temps.') {
  const projet = await creerProjet(base.db, {
    titre: 'Saisie des temps', type_demande: 'amelioration', description: 'La saisie est lente.', modeles: { cadrage: MODELE },
  })
  await modifierProjet(base.db, projet.id, { note_cadrage: note })
  await ajouterDocument(base.db, projet.id, { nom: 'Compte rendu', contenu: 'Une heure de saisie par jour.' })
  return projet.id
}

const avec = (repondre: (c: never, o: OptionsAppelIa) => Promise<Response>, options: OptionsAppelIa) =>
  route<'id'>(c => repondre(c as never, { reglages: { intervalleVieMs: 20 }, ...options })) as Handler

async function lancer<S extends object>(
  repondre: (c: never, o: OptionsAppelIa) => Promise<Response>, id: string, api: ReturnType<typeof apiSimulee>, corps?: unknown, cle?: string,
) {
  const ctx = contexteRoute(base.db, 'POST', id, corps, cle)
  const reponse = await avec(repondre, { fetch: api.fetch })(ctx.valeur)
  if (reponse.status !== 200) return { statut: reponse.status, erreur: ((await reponse.json()) as { error: { message: string } }).error.message }
  const flux = analyserFlux<Record<string, unknown>, S>(await reponse.text())
  await ctx.tache()
  return { statut: 200, flux }
}

const questionnairesDu = async (id: string) => (await lireProjet(base.db, id)).questionnaires

const hybrideValide = {
  introduction: "Nous préparons une évolution de la saisie des temps. Cinq minutes suffisent ; vos réponses restent anonymes.",
  duree_estimee_min: 5,
  contenu: {
    questions: [
      { type: 'texte', libelle: 'Comment saisissez-vous vos temps aujourd\'hui ?', objectif: 'Décrire la pratique réelle' },
      { type: 'choix_unique', libelle: 'À quelle fréquence ?', options: ['Chaque jour', 'Chaque semaine'], objectif: 'Mesurer la charge' },
      { type: 'echelle', libelle: 'Sur 5, à quel point est-ce pénible ?', objectif: "Hiérarchiser l'irritant" },
    ],
  },
}

describe('consigne de la génération', () => {
  it("reprend le guide du questionnaire sans les outils, puis la section propre à l'admin", () => {
    const consigne = consigneQuestionnaire()
    expect(consigne).toBe(`${consigneSansOutils('questionnaire')}\n\n${SECTION_ADMIN}`)
    expect(consigne.startsWith('# Guide de rédaction d\'un questionnaire')).toBe(true)
    for (const outil of ['lire_projet', 'lire_document', 'enregistrer_questionnaire', 'publier_questionnaire']) expect(consigne).not.toContain(outil)
    for (const repere of ['"questions"', '"question_ouverture"', '40 questions au plus', 'brouillon', "message d'erreur"]) expect(consigne).toContain(repere)
  })
})

describe('refus avant tout appel', () => {
  it('répond 503 sans clé API', async () => {
    const id = await nouveauProjet()
    const api = apiSimulee()
    expect(await lancer(repondrePublics, id, api, {}, '')).toMatchObject({ statut: 503, erreur: expect.stringMatching(/clé non configurée.*MCP/) })
    expect(await lancer(repondreGeneration, id, api, { public_vise: 'Comptables', mode: 'hybride' }, '')).toMatchObject({ statut: 503 })
    expect(api.appel).not.toHaveBeenCalled()
  })

  it('exige la note de cadrage (400)', async () => {
    const id = await nouveauProjet('  \n ')
    const api = apiSimulee()
    for (const [repondre, corps] of [[repondrePublics, {}], [repondreGeneration, { public_vise: 'Comptables', mode: 'hybride' }]] as const) {
      expect(await lancer(repondre, id, api, corps)).toEqual({ statut: 400, erreur: "Rédigez d'abord la note de cadrage." })
    }
    expect(api.appel).not.toHaveBeenCalled()
  })

  it('refuse un public vide ou trop long, un mode inconnu, des consignes trop longues, un projet inconnu', async () => {
    const id = await nouveauProjet()
    const api = apiSimulee()
    for (const corps of [
      { public_vise: '  ', mode: 'hybride' },
      { public_vise: 'x'.repeat(201), mode: 'hybride' },
      { public_vise: 'Comptables', mode: 'sondage' },
      { public_vise: 'Comptables', mode: 'hybride', consignes: 'x'.repeat(4001) },
    ]) expect((await lancer(repondreGeneration, id, api, corps)).statut, JSON.stringify(corps).slice(0, 60)).toBe(400)
    expect((await lancer(repondreGeneration, 'inconnu', api, { public_vise: 'Comptables', mode: 'hybride' })).statut).toBe(404)
    expect((await lancer(repondrePublics, 'inconnu', api, {})).statut).toBe(404)
    expect(api.appel).not.toHaveBeenCalled()
  })
})

describe('POST …/questionnaires/publics', () => {
  it("transmet les questionnaires existants, renvoie les propositions et n'enregistre rien", async () => {
    const id = await nouveauProjet()
    await enregistrerQuestionnaire(base.db, { projet_id: id, public_vise: 'Comptables', mode: 'hybride', contenu: hybrideValide.contenu })
    const propositions = [
      { public_vise: 'Animateurs terrain', mode: 'entretien', justification: 'Ils vivent la saisie sur le terrain.' },
      { public_vise: 'Gérants', mode: 'hybride', justification: 'Ils valident les temps.' },
    ]
    const api = apiSimulee(() => reponseJson({ publics: propositions }))
    const { flux } = await lancer<SuccesPublics>(repondrePublics, id, api, {})
    expect(flux!.entete).toMatchObject({ contexte_tronque: false })
    expect(flux!.texte).toBe('')
    expect(flux!.fin).toEqual({ type: 'succes', publics: propositions })

    const [corps] = api.lus()
    expect(corps.model).toBe(MODELE)
    expect(corps).not.toHaveProperty('thinking')
    expect(corps.system).toEqual([
      { type: 'text', text: consigneQuestionnaire() },
      { type: 'text', text: (await contexteCadrage(base.db, id)).texte, cache_control: { type: 'ephemeral' } },
    ])
    expect(corps.system[1].text).toContain('Savoir comment les comptables saisissent les temps.')
    expect(corps.output_config).toMatchObject({ effort: 'medium', format: { type: 'json_schema' } })
    expect(corps.messages).toHaveLength(1)
    expect(corps.messages[0].content).toContain('- Comptables (hybride, brouillon)')
    expect(corps.messages[0].content).toContain('Ne repropose pas')
    expect(await questionnairesDu(id)).toHaveLength(1)
  })

  it('refuse plus de 6 propositions ou une proposition sans justification', async () => {
    const un = { public_vise: 'Comptables', mode: 'hybride', justification: 'x' }
    for (const sortie of [{ publics: Array(7).fill(un) }, { publics: [{ ...un, justification: '' }] }, { publics: [] }]) {
      const { flux } = await lancer(repondrePublics, await nouveauProjet(), apiSimulee(() => reponseJson(sortie)), {})
      expect(flux!.fin.type === 'erreur' && flux!.fin.message).toMatch(/hors du format/)
    }
  })
})

describe('POST …/questionnaires/generer', () => {
  it('crée un brouillon valide et renvoie son identifiant', async () => {
    const id = await nouveauProjet()
    const api = apiSimulee(() => reponseJson(hybrideValide))
    const { flux } = await lancer<SuccesGeneration>(repondreGeneration, id, api, {
      public_vise: '  Comptables  ', mode: 'hybride', consignes: 'Insistez sur la saisie mobile.',
    })
    expect(flux!.fin.type).toBe('succes')
    const questionnaireId = (flux!.fin as unknown as SuccesGeneration).questionnaire_id
    const questionnaire = await lireQuestionnaire(base.db, questionnaireId)
    expect(questionnaire).toMatchObject({
      projet_id: id, public_vise: 'Comptables', mode: 'hybride', statut: 'brouillon',
      introduction: hybrideValide.introduction, duree_estimee_min: 5, tours_max: 12, relances_max_par_question: 1,
    })
    expect(questionnaire.contenu).toEqual({
      questions: hybrideValide.contenu.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
    })

    const [corps] = api.lus()
    expect(api.appel).toHaveBeenCalledTimes(1)
    expect(corps.output_config.effort).toBe('high')
    expect(corps.system[1].cache_control).toEqual({ type: 'ephemeral' })
    const schema = corps.output_config.format.schema
    expect(schema.required).toEqual(['introduction', 'duree_estimee_min', 'contenu'])
    expect(schema.properties.contenu.required).toEqual(['questions'])
    // Les bornes que les sorties structurées n'imposent pas sont rappelées au modèle dans la description.
    expect(schema.properties.contenu.properties.questions.description).toContain('maxItems: 40')
    const texteSchema = JSON.stringify(schema)
    for (const borne of ['maxLength: 500', 'maxLength: 200', 'maxLength: 2000', 'maxItems: 10, minItems: 2', 'minimum: 1, maximum: 120', 'uniquement pour choix_unique et choix_multiple']) {
      expect(texteSchema, borne).toContain(borne)
    }
    expect(corps.messages[0].content).toContain('« Comptables », en mode hybride')
    expect(corps.messages[0].content).toContain('Insistez sur la saisie mobile.')
  })

  it('crée un brouillon en mode entretien, au format du mode', async () => {
    const id = await nouveauProjet()
    const sortie = {
      introduction: 'Une conversation de vingt minutes sur votre pratique.',
      duree_estimee_min: 20,
      contenu: {
        question_ouverture: 'Racontez-moi votre dernière saisie des temps.',
        themes: [{ titre: 'Pratique actuelle', objectif: 'Qui fait quoi, quand' }, { titre: 'Difficultés', objectif: 'Exemples de blocages' }],
      },
    }
    const api = apiSimulee(() => reponseJson(sortie))
    const { flux } = await lancer<SuccesGeneration>(repondreGeneration, id, api, { public_vise: 'Animateurs', mode: 'entretien' })
    const questionnaire = await lireQuestionnaire(base.db, (flux!.fin as unknown as SuccesGeneration).questionnaire_id)
    expect(questionnaire).toMatchObject({ mode: 'entretien', statut: 'brouillon', tours_max: 15 })
    expect(questionnaire.contenu).toEqual({ ...sortie.contenu, themes: sortie.contenu.themes.map((t, i) => ({ id: `t${i + 1}`, ...t })) })
    expect(api.lus()[0].output_config.format.schema.properties.contenu.required).toEqual(['question_ouverture', 'themes'])
  })

  it("renvoie au modèle l'erreur exacte de validerContenu, puis crée le brouillon corrigé", async () => {
    const id = await nouveauProjet()
    const fautif = structuredClone(hybrideValide)
    fautif.contenu.questions[1].options = ['Chaque jour', ' chaque JOUR ']
    const api = apiSimulee(() => reponseJson(fautif), () => reponseJson(hybrideValide))
    const { flux } = await lancer<SuccesGeneration>(repondreGeneration, id, api, { public_vise: 'Comptables', mode: 'hybride' })
    expect(flux!.fin.type).toBe('succes')
    expect(api.appel).toHaveBeenCalledTimes(2)

    const [premier, second] = api.lus()
    const erreurExacte = 'Question 2 : option « chaque JOUR » en double.'
    expect(second.messages.slice(0, 1)).toEqual(premier.messages)
    expect(second.messages[1]).toEqual({ role: 'assistant', content: JSON.stringify(fautif) })
    expect(second.messages[2].role).toBe('user')
    expect(second.messages[2].content).toContain(`Le serveur a refusé ce questionnaire : ${erreurExacte}`)
    // Le second essai garde le même préfixe : consigne et contexte mis en cache.
    const fin = api.corps[0].indexOf(',"messages":')
    expect(api.corps[1].slice(0, fin)).toBe(api.corps[0].slice(0, fin))

    const crees = await questionnairesDu(id)
    expect(crees).toHaveLength(1)
    expect(crees[0].id).toBe((flux!.fin as unknown as SuccesGeneration).questionnaire_id)
  })

  it('corrige aussi une sortie hors du schéma (trop d\'options), avec le détail de l\'erreur', async () => {
    const id = await nouveauProjet()
    const fautif = structuredClone(hybrideValide)
    fautif.contenu.questions[1].options = Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`)
    const api = apiSimulee(() => reponseJson(fautif), () => reponseJson(hybrideValide))
    const { flux } = await lancer(repondreGeneration, id, api, { public_vise: 'Comptables', mode: 'hybride' })
    expect(flux!.fin.type).toBe('succes')
    expect(api.lus()[1].messages[2].content).toContain('contenu.questions.1.options')
    expect(await questionnairesDu(id)).toHaveLength(1)
  })

  it("après deux sorties invalides, répond par une ligne d'erreur et ne crée aucun brouillon", async () => {
    const id = await nouveauProjet()
    const fautif = structuredClone(hybrideValide)
    ;(fautif.contenu.questions[0] as Record<string, unknown>).options = ['Oui', 'Non']
    const api = apiSimulee(() => reponseJson(fautif), () => reponseJson(fautif), () => reponseJson(hybrideValide))
    const { flux } = await lancer(repondreGeneration, id, api, { public_vise: 'Comptables', mode: 'hybride' })
    expect(flux!.fin.type).toBe('erreur')
    expect(flux!.fin.type === 'erreur' && flux!.fin.message).toBe(
      "Le questionnaire produit par l'IA reste invalide après correction : Question 1 : pas d'options pour une question de type texte. Rien n'a été enregistré.",
    )
    expect(api.appel).toHaveBeenCalledTimes(2)
    expect(await questionnairesDu(id)).toEqual([])
  })

  it('ne refait pas l\'appel après un refus ou une réponse tronquée, et ne crée rien', async () => {
    for (const [reponse, motif] of [
      [() => reponseSse(['Je ne peux pas.'], 'refusal'), /refusé/],
      [() => reponseSse(['{"introduction":"'], 'max_tokens'), /tronquée/],
    ] as const) {
      const id = await nouveauProjet()
      const api = apiSimulee(reponse)
      const { flux } = await lancer(repondreGeneration, id, api, { public_vise: 'Comptables', mode: 'hybride' })
      expect(flux!.fin.type === 'erreur' && flux!.fin.message).toMatch(motif)
      expect(api.appel).toHaveBeenCalledTimes(1)
      expect(await questionnairesDu(id)).toEqual([])
    }
  })

  it('expose les deux routes en flux', () => {
    for (const module of [publics, generer]) expect(typeof module.onRequestPost).toBe('function')
  })
})
