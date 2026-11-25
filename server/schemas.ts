import { z } from 'zod'
import { MODES, STATUTS_PROJET, TYPES_DEMANDE } from '../shared/interviews'

// Ces schémas vérifient la forme ; les règles (longueurs, unicité, statuts) restent dans les services.

const modeles = z.object({
  cadrage: z.string().optional(),
  interview: z.string().optional(),
  analyse: z.string().optional(),
})

export const schemaLogiciel = z.object({
  nom: z.string().min(1),
  contexte: z.string().optional(),
})

export const schemaCreationProjet = z.object({
  titre: z.string().min(1),
  type_demande: z.enum(TYPES_DEMANDE),
  description: z.string().optional(),
  logiciel_ids: z.array(z.string()).optional(),
  modeles: modeles.optional(),
})

export const schemaModificationProjet = z.object({
  titre: z.string().min(1).optional(),
  type_demande: z.enum(TYPES_DEMANDE).optional(),
  description: z.string().optional(),
  note_cadrage: z.string().optional(),
  resume_contexte: z.string().optional(),
  statut: z.enum(STATUTS_PROJET).optional(),
  logiciel_ids: z.array(z.string()).optional(),
  modeles: modeles.optional(),
})

export const schemaDocument = z.object({
  nom: z.string().min(1),
  contenu: z.string().min(1),
})

export const schemaQuestionnaire = z.object({
  public_vise: z.string().min(1),
  mode: z.enum(MODES),
  contenu: z.record(z.string(), z.unknown()),
  introduction: z.string().optional(),
  duree_estimee_min: z.number().int().optional(),
  relances_max_par_question: z.number().int().optional(),
  tours_max: z.number().int().optional(),
})
