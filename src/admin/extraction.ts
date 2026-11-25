import { LIMITES } from '../../shared/interviews'

export const EXTENSIONS_ACCEPTEES = '.txt,.md,.pdf'

const PDF_INDISPONIBLE = 'Lecture des PDF indisponible : rechargez la page et réessayez.'
const PDF_ILLISIBLE = 'Ce PDF est illisible (fichier protégé ou endommagé).'

/** Charge pdf.js et son worker ; un échec ici vient de l'application (réseau, version déployée), pas du fichier. */
async function chargerPdfjs() {
  try {
    // Chargé à la demande : pdf.js pèse lourd et ne sert qu'ici.
    const pdfjs = await import('pdfjs-dist')
    const { default: urlTravailleur } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = urlTravailleur
    return pdfjs
  } catch {
    throw new Error(PDF_INDISPONIBLE)
  }
}

/** Le worker n'a pas pu démarrer : pdf.js le signale par un `Error` ordinaire qui le nomme. */
function echecDuWorker(erreur: unknown): boolean {
  return erreur instanceof Error && !/Exception$|FormatError/.test(erreur.name) && /worker/i.test(erreur.message)
}

async function extrairePdf(fichier: File): Promise<string> {
  const pdfjs = await chargerPdfjs()
  const tache = pdfjs.getDocument({ data: await fichier.arrayBuffer() })
  try {
    const document = await tache.promise
    const pages: string[] = []
    for (let numero = 1; numero <= document.numPages; numero++) {
      const contenu = await (await document.getPage(numero)).getTextContent()
      // Les fins de ligne du PDF sont gardées : sans elles, paragraphes et listes se fondent en un bloc.
      pages.push(contenu.items.map(element => ('str' in element ? element.str + (element.hasEOL ? '\n' : '') : '')).join(''))
    }
    return pages.join('\n\n').trim()
  } catch (erreur) {
    throw new Error(echecDuWorker(erreur) ? PDF_INDISPONIBLE : PDF_ILLISIBLE)
  } finally {
    // Libère le document et le worker, qui garderaient sinon le fichier en mémoire.
    void tache.destroy()
  }
}

/** Décode en UTF-8 ; un texte enregistré sous Windows (Windows-1252) y donnerait des « � » : il est relu dans son codage. */
function decoder(octets: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(octets)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(octets) : utf8
}

/** Texte d'un fichier `.txt`, `.md` ou `.pdf`. Lève une erreur au message affichable. */
export async function extraireTexte(fichier: File): Promise<string> {
  const nom = fichier.name.toLowerCase()
  let texte: string
  if (nom.endsWith('.pdf')) {
    texte = await extrairePdf(fichier)
    if (!texte) throw new Error('Ce PDF ne contient pas de texte (document scanné ?). Collez le texte à la main.')
  } else if (nom.endsWith('.txt') || nom.endsWith('.md')) {
    texte = decoder(await fichier.arrayBuffer()).trim()
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
