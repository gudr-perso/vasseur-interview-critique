import { describe, expect, it } from 'vitest'
import { extraireTexte } from '../../src/admin/extraction'
import { LIMITES } from '../../shared/interviews'

const fichier = (contenu: BlobPart, nom: string) => new File([contenu], nom)

describe('extraireTexte', () => {
  it('refuse un format non pris en charge', async () => {
    await expect(extraireTexte(fichier('x', 'note.docx'))).rejects.toThrow('Format non pris en charge')
  })

  it('refuse un fichier vide ou fait de blancs', async () => {
    await expect(extraireTexte(fichier('', 'vide.txt'))).rejects.toThrow('Ce fichier est vide.')
    await expect(extraireTexte(fichier('  \n\t ', 'blanc.md'))).rejects.toThrow('Ce fichier est vide.')
  })

  it('refuse un texte trop long', async () => {
    await expect(extraireTexte(fichier('a'.repeat(LIMITES.contenu_document + 1), 'long.md'))).rejects.toThrow('Document trop long')
  })

  it('lit un .md, sans les blancs autour, extension en majuscules comprise', async () => {
    expect(await extraireTexte(fichier('\n# Titre\n\nTexte\n', 'Notes.MD'))).toBe('# Titre\n\nTexte')
  })

  it('lit un .txt en UTF-8', async () => {
    expect(await extraireTexte(fichier('Été à Noël — 10 €', 'utf8.txt'))).toBe('Été à Noël — 10 €')
  })

  it('lit un .txt en Windows-1252', async () => {
    // « Été 10 € » en Windows-1252 : É = C9, é = E9, € = 80 ; invalide en UTF-8.
    const octets = new Uint8Array([0xc9, 0x74, 0xe9, 0x20, 0x31, 0x30, 0x20, 0x80])
    expect(await extraireTexte(fichier(octets, 'ansi.txt'))).toBe('Été 10 €')
  })
})
