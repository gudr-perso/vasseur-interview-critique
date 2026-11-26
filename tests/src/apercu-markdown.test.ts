import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ApercuMarkdown } from '../../src/admin/ApercuMarkdown'

const rendre = (texte: string) => renderToStaticMarkup(createElement(ApercuMarkdown, { texte }))

describe('ApercuMarkdown', () => {
  it("n'affiche aucune image : une image distante est remplacée par son texte alternatif", () => {
    const html = rendre('Avant ![extrait du corpus](https://exemple.test/x.png?q=Repondant%201) après\n\n![](https://exemple.test/y.png)')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('exemple.test')
    expect(html).toContain('extrait du corpus')
    expect(html).toContain('Avant')
    expect(html).toContain('après')
  })

  it('remplace aussi une image en référence et garde le reste du Markdown', () => {
    const html = rendre('## Titre\n\n![logo][l]\n\n[l]: https://exemple.test/logo.png\n\n**gras**')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('exemple.test')
    expect(html).toContain('logo')
    expect(html).toContain('<h2>Titre</h2>')
    expect(html).toContain('<strong>gras</strong>')
  })
})
