// Questionnaires préparés par l'API, dans l'admin : proposition des publics à interroger, puis rédaction du
// questionnaire d'un public, enregistré en brouillon. La méthode est celle du guide « questionnaire », que Claude
// suit aussi via le MCP.

import type Anthropic from '@anthropic-ai/sdk'
import {
  CONSIGNES_GENERATION_MAX, type EnteteGeneration, type SuccesGeneration, type SuccesPublics,
} from '../../shared/generation'
import { LIMITES, MODES, TYPES_QUESTION, type Mode, type QuestionnaireResume } from '../../shared/interviews'
import { lireCorps, parametre } from '../api'
import type { Env } from '../env'
import { ErreurMetier } from '../erreurs'
import { consigneSansOutils } from '../guides'
import { erreur } from '../http'
import { schemaGenerationQuestionnaire } from '../schemas'
import { contexteCadrage } from '../services/cadrage'
import { estInvisible, verifierLongueur } from '../services/limites'
import { lireProjet } from '../services/projets'
import { enregistrerQuestionnaire, validerContenu } from '../services/questionnaires'
import { z } from '../zod'
import { ErreurSortie, genererStructure, type DemandeIa } from './appel'
import type { OptionsAppelIa } from './cadrage'
import { repondreEnFlux } from './flux'
import { ErreurIa } from './types'

type Contexte = EventContext<Env, 'id', Record<string, unknown>>

// ─── Consigne ────────────────────────────────────────────────────────────────

/** Ce que l'admin ajoute au guide : il remplace la section « Avec les outils », propre au MCP. */
export const SECTION_ADMIN = `## Dans l'admin

Ici, tu n'as aucun outil : le contexte du projet (description, logiciels et leur fiche, note de cadrage, texte des documents) suit cette consigne. Chaque demande dit ce qu'elle attend : proposer les publics à interroger, ou rédiger le questionnaire d'un public. Réponds dans le format JSON demandé. Un questionnaire rédigé est enregistré en brouillon, puis relu et corrigé par la personne qui pilote le projet avant toute publication. Si le serveur le refuse, il te renvoie son message d'erreur : corrige exactement ce qu'il signale, sans rien changer d'autre.`

/** Consigne système des deux appels : le guide sans les outils, puis la section propre à l'admin. */
export function consigneQuestionnaire(): string {
  return `${consigneSansOutils('questionnaire')}\n\n${SECTION_ADMIN}`
}

// ─── Schémas des sorties ─────────────────────────────────────────────────────
//
// Les sorties structurées n'imposent ni longueur, ni nombre d'éléments au-delà d'un minimum de 0 ou 1 : le SDK les
// reporte dans la description du champ, que le modèle lit. Les bornes sont donc rappelées au modèle, vérifiées à la
// lecture par Zod, puis par `validerContenu` (règles du serveur, doublons d'options compris) avant l'enregistrement.

const QUESTIONS_MAX = 40
const THEMES_MAX = 12
const PUBLICS_MAX = 6
const JUSTIFICATION_MAX = 1_000

export const schemaPublics = z.object({
  publics: z.array(z.object({
    public_vise: z.string().min(1).max(LIMITES.public_vise).describe('le public, dans les mots du métier'),
    mode: z.enum(MODES),
    justification: z.string().min(1).max(JUSTIFICATION_MAX).describe('pourquoi ce public, et pourquoi ce mode'),
  })).min(1).max(PUBLICS_MAX),
})

const schemaHybride = z.object({
  questions: z.array(z.object({
    type: z.enum(TYPES_QUESTION),
    libelle: z.string().min(1).max(LIMITES.libelle),
    options: z.array(z.string().min(1).max(LIMITES.option)).min(2).max(10)
      .describe('uniquement pour choix_unique et choix_multiple ; absent pour texte et echelle').optional(),
    objectif: z.string().min(1).max(LIMITES.objectif),
  })).min(1).max(QUESTIONS_MAX),
})

const schemaEntretien = z.object({
  question_ouverture: z.string().min(1).max(LIMITES.question_ouverture),
  themes: z.array(z.object({
    titre: z.string().min(1).max(LIMITES.titre_theme),
    objectif: z.string().min(1).max(LIMITES.objectif),
  })).min(1).max(THEMES_MAX),
})

export function schemaQuestionnaireGenere(mode: Mode) {
  return z.object({
    introduction: z.string().min(1).max(LIMITES.introduction).describe('le premier écran que voit le répondant'),
    duree_estimee_min: z.number().int().min(1).max(120),
    contenu: mode === 'hybride' ? schemaHybride : schemaEntretien,
  })
}

export const AUCUN_PUBLIC = "L'IA n'a proposé aucun public exploitable. Relancez la proposition."

/**
 * Propositions nettoyées : un public fait d'espaces passe le schéma (au moins un caractère) mais ne désigne personne,
 * et le client refuserait toute la liste ; il est écarté. Une liste devenue vide est refusée.
 */
export function publicsRetenus(publics: z.infer<typeof schemaPublics>['publics']) {
  const retenus = publics
    .filter(p => !estInvisible(p.public_vise))
    .map(p => ({ ...p, public_vise: p.public_vise.trim(), justification: p.justification.trim() }))
  if (retenus.length === 0) throw new ErreurIa(AUCUN_PUBLIC)
  return retenus
}

/** Refus à renvoyer au modèle pour une introduction faite d'espaces (le premier écran du répondant serait vide). */
export const INTRODUCTION_VIDE = "L'introduction est vide : écris le premier écran que voit le répondant."

// ─── Messages ────────────────────────────────────────────────────────────────

function listeExistants(questionnaires: QuestionnaireResume[]): string {
  if (questionnaires.length === 0) return "Le projet n'a encore aucun questionnaire."
  return [
    'Questionnaires déjà existants dans ce projet :',
    ...questionnaires.map(q => `- ${q.public_vise} (${q.mode}, ${q.statut})`),
  ].join('\n')
}

export function messagePublics(questionnaires: QuestionnaireResume[]): string {
  return [
    "Propose les publics à interroger pour ce projet, de 1 à 6, d'après la note de cadrage : pour chacun, le public, le mode (hybride ou entretien) et, en une ou deux phrases, pourquoi ce public et ce mode.",
    listeExistants(questionnaires),
    questionnaires.length > 0 ? 'Ne repropose pas un public qui a déjà son questionnaire.' : '',
  ].filter(Boolean).join('\n\n')
}

export function messageGeneration(
  publicVise: string, mode: Mode, consignes: string | undefined, questionnaires: QuestionnaireResume[],
): string {
  const format = mode === 'hybride'
    ? 'contenu au format du mode hybride (questions avec type, libellé, options pour les seuls types à choix, objectif)'
    : "contenu au format du mode entretien (question d'ouverture, thèmes avec titre et objectif)"
  return [
    `Rédige le questionnaire destiné à ce public : « ${publicVise} », en mode ${mode}, en suivant la consigne.`,
    consignes ? `Consignes de la personne qui pilote le projet :\n${consignes}` : '',
    listeExistants(questionnaires),
    `Réponds dans le format demandé : introduction, duree_estimee_min, et ${format}. N'indique aucun identifiant : ils sont attribués à l'enregistrement.`,
  ].filter(Boolean).join('\n\n')
}

/** Renvoyé au modèle avec sa sortie refusée, pour le second et dernier essai. */
export function messageCorrection(erreurExacte: string): string {
  return `Le serveur a refusé ce questionnaire : ${erreurExacte}\n\nCorrige exactement ce point et renvoie le questionnaire complet, dans le même format.`
}

// ─── Réglages et préparation ─────────────────────────────────────────────────

export const JETONS_MAX_PUBLICS = 8_000
/** Un questionnaire de 40 questions tient largement dans cette borne, réflexion comprise. */
export const JETONS_MAX_QUESTIONNAIRE = 32_000

const SANS_CLE = "Génération par l'API indisponible : clé non configurée. Utilisez Claude avec le connecteur MCP."
export const NOTE_OBLIGATOIRE = 'Rédigez d\'abord la note de cadrage.'

/** Refus à opposer avant tout appel (clé, projet, note), puis ce qu'il faut pour appeler l'IA. */
async function preparer(env: Env, projetId: string) {
  const cleApi = env.ANTHROPIC_API_KEY
  if (!cleApi) return { refus: erreur(SANS_CLE, 503) }
  const projet = await lireProjet(env.DB, projetId)
  if (!projet.note_cadrage.trim()) throw new ErreurMetier(NOTE_OBLIGATOIRE)
  const contexte = await contexteCadrage(env.DB, projetId)
  return { refus: undefined, cleApi, projet, contexte }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** `POST …/questionnaires/publics` : publics proposés par l'IA, en flux. Rien n'est enregistré. */
export async function repondrePublics(contexte: Contexte, options: OptionsAppelIa = {}): Promise<Response> {
  const pret = await preparer(contexte.env, parametre(contexte.params.id))
  if (pret.refus) return pret.refus
  const { cleApi, projet, contexte: ctx } = pret
  const demande: DemandeIa = {
    cleApi,
    modele: projet.modele_cadrage,
    consigne: consigneQuestionnaire(),
    contexte: ctx.texte,
    messages: [{ role: 'user', content: messagePublics(projet.questionnaires) }],
    maxTokens: JETONS_MAX_PUBLICS,
    effort: 'medium',
    fetch: options.fetch,
  }
  const entete: EnteteGeneration = { contexte_tronque: ctx.tronquee }
  return repondreEnFlux(contexte, {
    journal: "Génération par l'API",
    entete,
    reglages: options.reglages,
    produire: async (): Promise<SuccesPublics> => {
      const { sortie } = await genererStructure(demande, schemaPublics)
      return { publics: publicsRetenus(sortie.publics) }
    },
  })
}

/**
 * `POST …/questionnaires/generer` avec `{ public_vise, mode, consignes? }` : l'IA rédige le questionnaire, le serveur
 * le valide (`validerContenu`) et le crée en brouillon (décision 2). Sortie refusée : un second et dernier essai
 * renvoie au modèle le message d'erreur exact ; un nouvel échec n'enregistre rien.
 */
export async function repondreGeneration(contexte: Contexte, options: OptionsAppelIa = {}): Promise<Response> {
  const projetId = parametre(contexte.params.id)
  const saisie = await lireCorps(contexte.request, schemaGenerationQuestionnaire)
  const publicVise = saisie.public_vise.trim()
  if (estInvisible(publicVise)) throw new ErreurMetier('Le public visé est obligatoire.')
  verifierLongueur(publicVise, LIMITES.public_vise, 'Public visé trop long')
  const consignes = saisie.consignes && !estInvisible(saisie.consignes) ? saisie.consignes.trim() : undefined
  if (consignes) verifierLongueur(consignes, CONSIGNES_GENERATION_MAX, 'Consignes trop longues')

  const pret = await preparer(contexte.env, projetId)
  if (pret.refus) return pret.refus
  const { cleApi, projet, contexte: ctx } = pret
  const schema = schemaQuestionnaireGenere(saisie.mode)
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: messageGeneration(publicVise, saisie.mode, consignes, projet.questionnaires) },
  ]
  const entete: EnteteGeneration = { contexte_tronque: ctx.tronquee }
  return repondreEnFlux(contexte, {
    journal: "Génération par l'API",
    entete,
    reglages: options.reglages,
    produire: async (): Promise<SuccesGeneration> => {
      /** Un essai : le brouillon créé, ou la sortie refusée avec le message d'erreur exact à renvoyer au modèle. */
      const essayer = async (): Promise<SuccesGeneration | { brut: string; erreur: string }> => {
        let resultat: Awaited<ReturnType<typeof genererStructure<typeof schema>>>
        try {
          resultat = await genererStructure({
            cleApi,
            modele: projet.modele_cadrage,
            consigne: consigneQuestionnaire(),
            contexte: ctx.texte,
            messages,
            maxTokens: JETONS_MAX_QUESTIONNAIRE,
            effort: 'high',
            fetch: options.fetch,
          }, schema)
        } catch (e) {
          if (e instanceof ErreurSortie) return { brut: e.brut, erreur: e.detail }
          throw e
        }
        if (estInvisible(resultat.sortie.introduction)) return { brut: resultat.brut, erreur: INTRODUCTION_VIDE }
        let contenu: ReturnType<typeof validerContenu>
        try {
          contenu = validerContenu(saisie.mode, resultat.sortie.contenu)
        } catch (e) {
          if (e instanceof ErreurMetier) return { brut: resultat.brut, erreur: e.message }
          throw e
        }
        const questionnaire = await enregistrerQuestionnaire(contexte.env.DB, {
          projet_id: projetId,
          public_vise: publicVise,
          mode: saisie.mode,
          contenu,
          introduction: resultat.sortie.introduction.trim(),
          duree_estimee_min: resultat.sortie.duree_estimee_min,
        })
        return { questionnaire_id: questionnaire.id }
      }

      for (let essai = 1; ; essai++) {
        const issue = await essayer()
        if ('questionnaire_id' in issue) return issue
        if (essai >= 2) {
          throw new ErreurIa(`Le questionnaire produit par l'IA reste invalide après correction : ${issue.erreur} Rien n'a été enregistré.`)
        }
        messages.push({ role: 'assistant', content: issue.brut }, { role: 'user', content: messageCorrection(issue.erreur) })
      }
    },
  })
}
