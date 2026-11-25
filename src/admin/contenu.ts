import type { Contenu, ContenuHybride, Mode, Question, Theme, TypeQuestion } from '../../shared/interviews'

export function estHybride(contenu: Contenu): contenu is ContenuHybride {
  return 'questions' in contenu
}

function identifiantLibre(existants: { id: string }[], prefixe: string): string {
  const pris = new Set(existants.map(e => e.id))
  let n = 1
  while (pris.has(`${prefixe}${n}`)) n++
  return `${prefixe}${n}`
}

export function nouvelleQuestion(existantes: { id: string }[]): Question {
  return { id: identifiantLibre(existantes, 'q'), type: 'texte', libelle: '', objectif: '' }
}

export function nouveauTheme(existants: { id: string }[]): Theme {
  return { id: identifiantLibre(existants, 't'), titre: '', objectif: '' }
}

export function contenuVide(mode: Mode): Contenu {
  return mode === 'hybride'
    ? { questions: [nouvelleQuestion([])] }
    : { question_ouverture: '', themes: [nouveauTheme([])] }
}

/** Copie de la liste avec l'élément `index` décalé de `sens` (-1 ou 1) ; inchangée hors bornes. */
export function deplacer<T>(liste: T[], index: number, sens: -1 | 1): T[] {
  const cible = index + sens
  if (cible < 0 || cible >= liste.length) return liste
  const copie = [...liste]
  ;[copie[index], copie[cible]] = [copie[cible], copie[index]]
  return copie
}

const A_CHOIX: TypeQuestion[] = ['choix_unique', 'choix_multiple']

export function changerType(question: Question, type: TypeQuestion): Question {
  if (A_CHOIX.includes(type)) {
    return { ...question, type, options: question.options?.length ? question.options : ['', ''] }
  }
  const { options: _options, ...reste } = question
  return { ...reste, type }
}

/** Contenu tel qu'on l'envoie : sans les lignes d'option laissées vides dans l'éditeur. */
export function pretPourEnvoi(contenu: Contenu): Contenu {
  if (!estHybride(contenu)) return contenu
  return {
    questions: contenu.questions.map(q =>
      q.options ? { ...q, options: q.options.filter(o => o.trim() !== '') } : q),
  }
}
