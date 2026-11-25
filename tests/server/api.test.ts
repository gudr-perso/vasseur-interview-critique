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

  it("nomme la surface de l'API dans le journal, sans le chemin (il peut contenir un jeton)", async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
    const echoue = route(async () => { throw new Error('boum') })
    await echoue({ request: new Request('https://exemple.test/api/public/r/JETON-SECRET/suivant') } as never)
    await echoue({ request: new Request('https://exemple.test/api/admin/projets') } as never)
    expect(journal.mock.calls[0][0]).toBe('API publique :')
    expect(journal.mock.calls[1][0]).toBe('API admin :')
    expect(JSON.stringify(journal.mock.calls)).not.toContain('JETON-SECRET')
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

  it('refuse un corps de plus de 64 Ko en 413, annoncé par Content-Length ou réel', async () => {
    const gros = JSON.stringify({ nom: 'é'.repeat(40_000) }) // 80 000 octets
    const annonce = new Request('https://exemple.test/x', {
      method: 'POST', body: '{"nom":"a"}', headers: { 'Content-Length': '100000' },
    })
    await expect(lireCorps(annonce, schema)).rejects.toMatchObject({ statut: 413, message: expect.stringMatching(/64 Ko/) })
    await expect(lireCorps(requete(gros), schema)).rejects.toMatchObject({ statut: 413 })
    // Un flux sans Content-Length est mesuré à la lecture.
    const flux = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(gros)); c.close() } })
    const sansLongueur = new Request('https://exemple.test/x', { method: 'POST', body: flux, duplex: 'half' } as RequestInit)
    await expect(lireCorps(sansLongueur, schema)).rejects.toMatchObject({ statut: 413 })
    // Juste sous la limite : accepté.
    expect(await lireCorps(requete(JSON.stringify({ nom: 'a'.repeat(65_000) })), schema)).toMatchObject({ nom: expect.any(String) })
  })

  it('accepte une limite plus haute quand la route la demande', async () => {
    const gros = JSON.stringify({ nom: 'a'.repeat(100_000) })
    expect(await lireCorps(requete(gros), schema, 1024 * 1024)).toMatchObject({ nom: expect.any(String) })
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
