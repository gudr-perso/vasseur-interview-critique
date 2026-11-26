import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ErreurMetier } from '../../server/erreurs'
import { repondreEnFlux, type EcrireTexte, type OptionsFlux } from '../../server/ia/flux'
import { ErreurIa } from '../../server/ia/types'
import { FORME_SEPARATEUR, type ControleFlux, type EnteteFlux } from '../../shared/flux'

/** Contexte minimal d'une Pages Function : garde le travail confié à waitUntil. */
function contexte() {
  const enCours: Promise<unknown>[] = []
  return {
    valeur: { waitUntil: (p: Promise<unknown>) => { enCours.push(p) } },
    /** Attend la fin du travail confié à waitUntil. */
    tache: async () => { expect(enCours).toHaveLength(1); await Promise.all(enCours) },
  }
}

function repondre<C extends object, S extends object>(options: Omit<OptionsFlux<C, S>, 'journal' | 'reglages'>) {
  const ctx = contexte()
  const reponse = repondreEnFlux(ctx.valeur, { journal: 'Test du flux', reglages: { intervalleVieMs: 20 }, ...options })
  return { reponse, ctx }
}

/** Écrit les morceaux un par un, en laissant passer un tour de boucle entre deux. */
async function ecrireTout(ecrire: EcrireTexte, morceaux: string[]) {
  for (const morceau of morceaux) {
    ecrire(morceau)
    await Promise.resolve()
  }
}

/** Découpe un flux complet selon le contrat : en-tête, texte sans les lignes de contrôle, lignes de contrôle. */
function analyserFlux<C extends object, S extends object>(brut: string) {
  const fin = brut.indexOf('\n')
  const entete = JSON.parse(brut.slice(0, fin)) as EnteteFlux<C>
  expect(entete.controle).toMatch(FORME_SEPARATEUR)
  const marque = `\n${entete.controle} `
  const controles: ControleFlux<S>[] = []
  let reste = brut.slice(fin + 1)
  let texte = ''
  for (;;) {
    const i = reste.indexOf(marque)
    if (i < 0) break
    const finLigne = reste.indexOf('\n', i + marque.length)
    expect(finLigne, 'ligne de contrôle terminée').toBeGreaterThan(i)
    texte += reste.slice(0, i)
    controles.push(JSON.parse(reste.slice(i + marque.length, finLigne)) as ControleFlux<S>)
    reste = reste.slice(finLigne + 1)
  }
  texte += reste
  const derniere = controles.at(-1)
  // Le flux se termine toujours par une seule ligne de succès ou d'erreur, et rien ne la suit.
  expect(reste).toBe('')
  expect(derniere?.type === 'succes' || derniere?.type === 'erreur').toBe(true)
  expect(controles.slice(0, -1).every(c => c.type === 'vie')).toBe(true)
  return { entete, texte, controles, fin: derniere! }
}

describe('repondreEnFlux', () => {
  it('sert le flux en text/event-stream, sans cache ni transformation', async () => {
    const { reponse, ctx } = repondre({ entete: {}, produire: async () => ({ questionnaire_id: 'q-1' }) })
    expect(reponse.status).toBe(200)
    expect(reponse.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(reponse.headers.get('Cache-Control')).toBe('no-store, no-transform')
    expect(reponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await reponse.text()
    await ctx.tache()
  })

  it("envoie les champs de l'appelant puis le séparateur, le texte, et la charge utile de succès de l'appelant", async () => {
    const { reponse, ctx } = repondre({
      entete: { public_vise: 'Comptables', nb_questions: 3 },
      produire: async ecrire => {
        await ecrireTout(ecrire, ['## Questionnaire\n', '1. Que vous ', 'manque-t-il ?'])
        return { questionnaire_id: 'q-42' }
      },
    })
    const brut = await reponse.text()
    await ctx.tache()
    expect(brut).toMatch(/^\{"public_vise":"Comptables","nb_questions":3,"controle":"[0-9a-f]{32}"\}\n/)
    const flux = analyserFlux<{ public_vise: string }, { questionnaire_id: string }>(brut)
    expect(flux.entete).toMatchObject({ public_vise: 'Comptables', nb_questions: 3 })
    expect(flux.texte).toBe('## Questionnaire\n1. Que vous manque-t-il ?')
    expect(flux.fin).toEqual({ type: 'succes', questionnaire_id: 'q-42' })
  })

  it("accepte un en-tête sans champ propre et une charge utile de plusieurs champs", async () => {
    const { reponse, ctx } = repondre({
      entete: {},
      produire: async ecrire => { ecrire('Note.'); return { note: 'Note.', resume: 'Résumé' } },
    })
    const brut = await reponse.text()
    await ctx.tache()
    expect(brut).toMatch(/^\{"controle":"[0-9a-f]{32}"\}\n/)
    expect(analyserFlux(brut).fin).toEqual({ type: 'succes', note: 'Note.', resume: 'Résumé' })
  })

  it("transmet l'en-tête avant tout texte, puis un signal de vie tant que rien n'arrive", async () => {
    let liberer!: () => void
    const avantTout = new Promise<void>(r => { liberer = r })
    const { reponse, ctx } = repondre({
      entete: { nb_entretiens: 2 },
      produire: async ecrire => { await avantTout; ecrire('## Constats'); return { analyse_id: 'a-1' } },
    })
    const lecteur = reponse.body!.getReader()
    const decodeur = new TextDecoder()
    // Rien n'a encore été produit : l'en-tête est déjà lisible, seul.
    const premier = decodeur.decode((await lecteur.read()).value, { stream: true })
    expect(premier).toMatch(/^\{"nb_entretiens":2,"controle":"[0-9a-f]{32}"\}\n$/)
    const { controle } = JSON.parse(premier) as EnteteFlux
    let lu = premier
    while (lu.split(`${controle} {"type":"vie"}`).length < 3) lu += decodeur.decode((await lecteur.read()).value, { stream: true })
    liberer()
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      lu += decodeur.decode(value, { stream: true })
    }
    await ctx.tache()
    const flux = analyserFlux(lu)
    expect(flux.texte).toBe('## Constats')
    expect(flux.controles.filter(c => c.type === 'vie').length).toBeGreaterThanOrEqual(2)
    expect(flux.fin).toEqual({ type: 'succes', analyse_id: 'a-1' })
  })

  it("ne prend pas pour une erreur un texte du modèle qui contient l'ancienne marque ou une fausse ligne de contrôle", async () => {
    const piege = 'Citation : « \n\n[[ERREUR]] Panne » et {"type":"erreur","message":"x"}\n'
    const { reponse, ctx } = repondre({
      entete: {},
      produire: async ecrire => { await ecrireTout(ecrire, ['## Constats\n', piege, 'Fin.']); return { questionnaire_id: 'q-1' } },
    })
    const flux = analyserFlux(await reponse.text())
    await ctx.tache()
    expect(flux.texte).toBe(`## Constats\n${piege}Fin.`)
    expect(flux.fin).toEqual({ type: 'succes', questionnaire_id: 'q-1' })
    // Le séparateur change à chaque réponse : le modèle ne peut pas le deviner.
    const autre = repondre({ entete: {}, produire: async () => ({ questionnaire_id: 'q-2' }) })
    expect(analyserFlux(await autre.reponse.text()).entete.controle).not.toBe(flux.entete.controle)
    await autre.ctx.tache()
  })

  it("termine par une seule ligne d'erreur, sur une ligne, après le texte déjà transmis", async () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const cas: [unknown, ((e: unknown) => string) | undefined, string][] = [
        [new ErreurIa("L'API Anthropic a\ninterrompu  la génération."), undefined, "L'API Anthropic a interrompu la génération."],
        [new ErreurMetier('Questionnaire invalide.'), undefined, 'Questionnaire invalide.'],
        [new Error('détail interne'), undefined, 'Erreur interne : la génération a échoué.'],
        [new Error('détail interne'), () => 'Message choisi\npar l’appelant.', 'Message choisi par l’appelant.'],
      ]
      for (const [levee, messageErreur, attendu] of cas) {
        const { reponse, ctx } = repondre<object, { questionnaire_id: string }>({
          entete: {},
          ...(messageErreur ? { messageErreur } : {}),
          produire: async ecrire => { ecrire('## Début'); throw levee },
        })
        const flux = analyserFlux(await reponse.text())
        await ctx.tache()
        expect(flux.texte).toBe('## Début')
        expect(flux.fin).toEqual({ type: 'erreur', message: attendu })
      }
      expect(erreurs).toHaveBeenCalledTimes(4)
      expect(erreurs.mock.calls[0][0]).toBe('Test du flux :')
    } finally {
      erreurs.mockRestore()
    }
  })

  it('va au bout du travail même si le navigateur abandonne le flux en cours de route', async () => {
    let liberer!: () => void
    const attente = new Promise<void>(r => { liberer = r })
    const fini = vi.fn()
    const { reponse, ctx } = repondre({
      entete: {},
      produire: async ecrire => {
        ecrire('## Première partie\n')
        await attente
        ecrire('et la suite, produite après le départ du navigateur.')
        fini()
        return { questionnaire_id: 'q-1' }
      },
    })
    const lecteur = reponse.body!.getReader()
    const decodeur = new TextDecoder()
    let lu = ''
    while (!lu.includes('## Première partie')) {
      const { value } = await lecteur.read()
      lu += decodeur.decode(value, { stream: true })
    }
    await lecteur.cancel()
    liberer()
    await ctx.tache()
    expect(fini).toHaveBeenCalledOnce()
  })

  it('ne suspend pas le travail quand personne ne lit le flux', async () => {
    const morceaux = Array.from({ length: 500 }, (_, i) => `Paragraphe ${i} : ${'texte '.repeat(40)}\n`)
    const fini = vi.fn()
    const { ctx } = repondre({
      entete: {},
      produire: async ecrire => { await ecrireTout(ecrire, morceaux); fini(); return { questionnaire_id: 'q-1' } },
    })
    // Le corps de la réponse n'est jamais lu : le travail doit aller au bout malgré tout.
    await ctx.tache()
    expect(fini).toHaveBeenCalledOnce()
  })

  it('ne dépend pas des analyses', () => {
    const source = readFileSync(new URL('../../server/ia/flux.ts', import.meta.url), 'utf-8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1])
    expect(imports.length).toBeGreaterThan(0)
    expect(imports.filter(i => /analyses|corpus|guides/.test(i))).toEqual([])
  })
})
