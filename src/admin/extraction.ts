import { LIMITES } from '../../shared/interviews'

export const EXTENSIONS_ACCEPTEES = '.txt,.md,.pdf'

async function extrairePdf(fichier: File): Promise<string> {
  // Chargé à la demande : pdf.js pèse lourd et ne sert qu'ici.
  const pdfjs = await import('pdfjs-dist')
  const { default: urlTravailleur } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = urlTravailleur

  const document = await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise
  const pages: string[] = []
  for (let numero = 1; numero <= document.numPages; numero++) {
    const contenu = await (await document.getPage(numero)).getTextContent()
    pages.push(contenu.items.map(element => ('str' in element ? element.str : '')).join(' '))
  }
  return pages.join('\n\n').trim()
}

/** Texte d'un fichier `.txt`, `.md` ou `.pdf`. Lève une erreur au message affichable. */
export async function extraireTexte(fichier: File): Promise<string> {
  const nom = fichier.name.toLowerCase()
  let texte: string
  if (nom.endsWith('.pdf')) {
    try {
      texte = await extrairePdf(fichier)
    } catch {
      throw new Error('Ce PDF est illisible (fichier protégé ou endommagé).')
    }
    if (!texte) throw new Error('Ce PDF ne contient pas de texte (document scanné ?). Collez le texte à la main.')
  } else if (nom.endsWith('.txt') || nom.endsWith('.md')) {
    texte = (await fichier.text()).trim()
    if (!texte) throw new Error('Ce fichier est vide.')
  } else {
    throw new Error('Format non pris en charge : utilisez un fichier .txt, .md ou .pdf.')
  }
  if (texte.length > LIMITES.contenu_document) {
    throw new Error(
      `Document trop long : ${texte.length.toLocaleString('fr-FR')} caractères pour ${LIMITES.contenu_document.toLocaleString('fr-FR')} au plus. Gardez les passages utiles.`,
    )
  }
  return texte
}
