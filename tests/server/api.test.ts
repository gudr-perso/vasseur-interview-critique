import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { lireCorps, route } from '../../server/api'
import { ErreurMetier } from '../../server/erreurs'
import { schemaCreationProjet, schemaQuestionnaire } from '../../server/schemas'

function requete(corps: string): Request {
  return new Request('https://exemple.test/api/admin/x', { method: 'POST', body: corps })
}

describe('route', () => {
  it('renvoie la réponse du traitement', async () => {
    const reponse = await route(async () => new Response('ok'))({} as never)
    expect(await reponse.text()).toBe('ok')
  })

  it("traduit une erreur métier en réponse JSON à son statut", async () => {
    const reponse = await route(async () => { throw new ErreurMetier('Introuvable', 404) })({} as never)
    expect(reponse.status).toBe(404)
    expect(await reponse.json()).toEqual({ error: { message: 'Introuvable' } })
  })

  it("cache une erreur inattendue derrière un 500 générique et la journalise", async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reponse = await route(async () => { throw new Error('D1_ERROR: détail interne') })({} as never)
    expect(reponse.status).toBe(500)
    expect(await reponse.json()).toEqual({ error: { message: 'Erreur interne du serveur.' } })
    expect(journal).toHaveBeenCalled()
    journal.mockRestore()
  })
})

describe('lireCorps', () => {
  const schema = z.object({ nom: z.string().min(1) })

  it('renvoie le corps validé', async () => {
    expect(await lireCorps(requete('{"nom":"a"}'), schema)).toEqual({ nom: 'a' })
  })

  it('refuse un JSON illisible et des données invalides, en nommant le champ', async () => {
    await expect(lireCorps(requete('pas du json'), schema)).rejects.toThrow('Corps de requête JSON invalide.')
    await expect(lireCorps(requete('{"nom":""}'), schema)).rejects.toThrow(/Données invalides — nom/)
  })
})

describe('schémas', () => {
  it('accepte un projet minimal et refuse un type inconnu', () => {
    expect(schemaCreationProjet.safeParse({ titre: 'T', type_demande: 'amelioration' }).success).toBe(true)
    expect(schemaCreationProjet.safeParse({ titre: 'T', type_demande: 'autre' }).success).toBe(false)
  })

  it('exige public, mode et contenu pour un questionnaire', () => {
    expect(schemaQuestionnaire.safeParse({ public_vise: 'P', mode: 'hybride', contenu: {} }).success).toBe(true)
    expect(schemaQuestionnaire.safeParse({ public_vise: 'P', mode: 'hybride' }).success).toBe(false)
  })
})
