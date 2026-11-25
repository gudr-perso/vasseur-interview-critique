import { z } from '../zod'
import { ErreurMetier } from '../erreurs'
import { ETAPES_GUIDE, lireGuide } from '../guides'
import { caracteres } from '../texte'
import { enregistrerLogiciel, lireLogiciel, listerLogiciels } from '../services/logiciels'
import {
  STATUTS_PROJET, TYPES_DEMANDE, ajouterDocument, creerProjet, lireDocument, lireProjet, listerProjets, modifierProjet,
} from '../services/projets'
import { MODES, enregistrerQuestionnaire, lireQuestionnaire, publierQuestionnaire } from '../services/questionnaires'
import { LIMITES_ANALYSE, TYPES_ANALYSE } from '../../shared/analyses'
import { enregistrerAnalyse, lireAnalyse, listerAnalysesPseudonymisees } from '../services/analyses'
import {
  construireCorpus, decouper, entretienPseudonymise, listerRepondantsPseudonymises,
} from '../services/corpus'

export interface Contexte {
  db: D1Database
  /** Origine du site (https://hôte), pour construire l'adresse des questionnaires. */
  origine: string
}

export interface ResultatOutil {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export interface Outil {
  nom: string
  description: string
  lectureSeule: boolean
  schema: z.ZodObject
  /** Renvoie une chaîne (rendue telle quelle) ou une valeur (rendue en JSON). */
  executer: (ctx: Contexte, args: never) => Promise<unknown>
}

/** Lie le type des arguments au schéma, puis oublie ce type pour ranger l'outil dans une liste. */
function outil<S extends z.ZodObject>(definition: {
  nom: string
  description: string
  lectureSeule: boolean
  schema: S
  executer: (ctx: Contexte, args: z.infer<S>) => Promise<unknown>
}): Outil {
  return definition as unknown as Outil
}

const TAILLE_MORCEAU_MAX = 20_000

const idProjet = z.string().describe('Identifiant du projet, tel que renvoyé par creer_projet ou lister_projets')
const idQuestionnaire = z.string().describe('Identifiant du questionnaire')
const debutMorceau = z.number().int().min(0).default(0).describe('Position du premier caractère à lire (0 par défaut)')
const longueurMorceau = z.number().int().min(1).max(LIMITES_ANALYSE.morceau_mcp).default(LIMITES_ANALYSE.morceau_mcp)
  .describe('Nombre de caractères à lire (20 000 au plus, 20 000 par défaut)')

export const OUTILS: Outil[] = [
  outil({
    nom: 'lire_guide',
    description:
      "Renvoie la méthode à suivre pour une étape : « cadrage » (interroger le porteur du projet et rédiger la note de cadrage), « questionnaire » (rédiger, enregistrer et publier un questionnaire), « fiche_repondant » (résumer un entretien), « synthese » (synthèse transversale des entretiens) ou « expression_besoin » (besoin prêt à transmettre pour une spécification). À lire avant de commencer l'étape.",
    lectureSeule: true,
    schema: z.object({ etape: z.enum(ETAPES_GUIDE) }),
    executer: async (_ctx, { etape }) => lireGuide(etape),
  }),
  outil({
    nom: 'lister_logiciels',
    description: "Liste les logiciels du référentiel avec leur identifiant et leur fiche de contexte. À consulter pour rattacher un projet à un logiciel.",
    lectureSeule: true,
    schema: z.object({}),
    executer: async ctx => listerLogiciels(ctx.db),
  }),
  outil({
    nom: 'lire_logiciel',
    description: "Renvoie la fiche d'un logiciel : nom et contexte (description, vocabulaire métier, publics).",
    lectureSeule: true,
    schema: z.object({ logiciel_id: z.string() }),
    executer: async (ctx, { logiciel_id }) => lireLogiciel(ctx.db, logiciel_id),
  }),
  outil({
    nom: 'enregistrer_logiciel',
    description:
      "Crée un logiciel dans le référentiel, ou met à jour sa fiche. Sans logiciel_id, un nom déjà connu met à jour la fiche existante. Le contexte est réutilisé par tous les projets rattachés : description du logiciel, vocabulaire métier, publics.",
    lectureSeule: false,
    schema: z.object({
      logiciel_id: z.string().optional().describe('À fournir pour renommer un logiciel existant'),
      nom: z.string().min(1),
      contexte: z.string().optional().describe('Omis : le contexte existant est conservé'),
    }),
    executer: async (ctx, { logiciel_id, nom, contexte }) => enregistrerLogiciel(ctx.db, { id: logiciel_id, nom, contexte }),
  }),
  outil({
    nom: 'lister_projets',
    description: 'Liste les projets d\'interview, du plus récemment modifié au plus ancien, avec filtre facultatif par logiciel ou par statut. Sert à retrouver un projet existant.',
    lectureSeule: true,
    schema: z.object({
      logiciel_id: z.string().optional(),
      statut: z.enum(STATUTS_PROJET).optional(),
    }),
    executer: async (ctx, filtre) => listerProjets(ctx.db, filtre),
  }),
  outil({
    nom: 'lire_projet',
    description:
      "Renvoie le contexte d'un projet : description, type de demande, logiciels et leur fiche, note de cadrage, liste des questionnaires et liste des documents joints (identifiant, nom et taille en caractères, sans leur contenu : lire ceux qui sont utiles avec lire_document). À appeler avant tout cadrage ou toute rédaction de questionnaire.",
    lectureSeule: true,
    schema: z.object({ projet_id: idProjet }),
    executer: async (ctx, { projet_id }) => {
      const projet = await lireProjet(ctx.db, projet_id)
      // Les documents peuvent peser 200 000 caractères chacun : on n'en donne que l'entête.
      return { ...projet, documents: projet.documents.map(d => ({ id: d.id, nom: d.nom, taille: caracteres(d.contenu).length })) }
    },
  }),
  outil({
    nom: 'lire_document',
    description:
      "Lit le texte d'un document joint à un projet, par morceaux de 20 000 caractères au plus. Renvoie { id, nom, taille, debut, texte, suite } : suite est la position de début du morceau suivant (à passer en debut pour le lire), ou null quand le document est lu en entier. Les identifiants des documents viennent de lire_projet.",
    lectureSeule: true,
    schema: z.object({
      document_id: z.string().describe('Identifiant du document, tel que renvoyé par lire_projet'),
      debut: z.number().int().min(0).default(0).describe('Position du premier caractère à lire (0 par défaut)'),
      longueur: z.number().int().min(1).max(TAILLE_MORCEAU_MAX).default(TAILLE_MORCEAU_MAX)
        .describe('Nombre de caractères à lire (20 000 au plus, 20 000 par défaut)'),
    }),
    executer: async (ctx, { document_id, debut, longueur }) => {
      const document = await lireDocument(ctx.db, document_id)
      const lettres = caracteres(document.contenu)
      const fin = debut + longueur
      return {
        id: document.id, nom: document.nom, taille: lettres.length, debut,
        texte: lettres.slice(debut, fin).join(''),
        suite: fin < lettres.length ? fin : null,
      }
    },
  }),
  outil({
    nom: 'creer_projet',
    description:
      "Crée un projet d'interview en brouillon. type_demande règle la profondeur du cadrage : evolution_simple (on sait quoi demander), amelioration, nouvelle_fonctionnalite (besoin à préciser). Après création, lire le guide de cadrage.",
    lectureSeule: false,
    schema: z.object({
      titre: z.string().min(1),
      type_demande: z.enum(TYPES_DEMANDE),
      description: z.string().optional().describe('La demande telle que le porteur du projet la formule'),
      logiciel_ids: z.array(z.string()).optional().describe('Identifiants issus de lister_logiciels'),
    }),
    executer: async (ctx, saisie) => creerProjet(ctx.db, saisie),
  }),
  outil({
    nom: 'modifier_projet',
    description:
      "Met à jour un projet ; seuls les champs fournis changent. C'est ici qu'on enregistre la note de cadrage (note_cadrage, en Markdown) et le résumé de contexte (resume_contexte). logiciel_ids remplace la liste des logiciels.",
    lectureSeule: false,
    schema: z.object({
      projet_id: idProjet,
      titre: z.string().min(1).optional(),
      type_demande: z.enum(TYPES_DEMANDE).optional(),
      description: z.string().optional(),
      note_cadrage: z.string().optional(),
      resume_contexte: z.string().optional(),
      statut: z.enum(STATUTS_PROJET).optional(),
      logiciel_ids: z.array(z.string()).optional(),
    }),
    executer: async (ctx, { projet_id, ...modifs }) => modifierProjet(ctx.db, projet_id, modifs),
  }),
  outil({
    nom: 'ajouter_document',
    description: "Joint au projet un document de contexte sous forme de texte (extrait de documentation, compte rendu, spécification). Le document sert au cadrage et à la rédaction des questions.",
    lectureSeule: false,
    schema: z.object({
      projet_id: idProjet,
      nom: z.string().min(1).describe('Nom lisible, par exemple « Guide de saisie des temps »'),
      contenu: z.string().min(1).max(200_000),
    }),
    executer: async (ctx, { projet_id, nom, contenu }) => ajouterDocument(ctx.db, projet_id, { nom, contenu }),
  }),
  outil({
    nom: 'enregistrer_questionnaire',
    description:
      "Crée un questionnaire en brouillon pour un public donné, ou remplace un brouillon existant si questionnaire_id est fourni. Au remplacement, les champs facultatifs omis (introduction, duree_estimee_min, relances_max_par_question, tours_max) conservent leur valeur actuelle ; seul tours_max suit le défaut du nouveau mode quand le mode change et qu'il est omis. Le format de « contenu » dépend du mode et est décrit dans le guide « questionnaire ». Ne publie rien.",
    lectureSeule: false,
    schema: z.object({
      questionnaire_id: idQuestionnaire.optional().describe('À fournir pour remplacer un brouillon'),
      projet_id: idProjet,
      public_vise: z.string().min(1).describe('Par exemple « Comptables de CUMA »'),
      mode: z.enum(MODES),
      contenu: z.record(z.string(), z.unknown()).describe('Hybride : { questions: [...] }. Entretien : { question_ouverture, themes: [...] }'),
      introduction: z.string().optional().describe("Texte d'accueil montré au répondant"),
      duree_estimee_min: z.number().int().optional().describe('De 1 à 120 ; 10 par défaut'),
      relances_max_par_question: z.number().int().optional().describe('Mode hybride, de 0 à 3 ; 1 par défaut'),
      tours_max: z.number().int().optional().describe('Plafond de relances au total (hybride, 12 par défaut) ou de questions (entretien, 15 par défaut)'),
    }),
    executer: async (ctx, { questionnaire_id, ...saisie }) =>
      enregistrerQuestionnaire(ctx.db, { id: questionnaire_id, ...saisie }),
  }),
  outil({
    nom: 'lire_questionnaire',
    description: 'Renvoie un questionnaire complet : public, mode, introduction, contenu, plafonds, statut et code d\'URL.',
    lectureSeule: true,
    schema: z.object({ questionnaire_id: idQuestionnaire }),
    executer: async (ctx, { questionnaire_id }) => lireQuestionnaire(ctx.db, questionnaire_id),
  }),
  outil({
    nom: 'publier_questionnaire',
    description:
      "Ouvre un questionnaire aux répondants et renvoie son adresse publique. Action visible de l'extérieur et sans retour par cet outil : à n'appeler qu'après validation explicite du porteur du projet. Un questionnaire publié ne peut plus être remplacé.",
    lectureSeule: false,
    schema: z.object({ questionnaire_id: idQuestionnaire }),
    executer: async (ctx, { questionnaire_id }) => {
      const { questionnaire, url } = await publierQuestionnaire(ctx.db, questionnaire_id, ctx.origine)
      return { url, statut: questionnaire.statut, questionnaire_id: questionnaire.id, public_vise: questionnaire.public_vise }
    },
  }),

  // Analyse des entretiens. Aucun de ces outils ne renvoie le nom, le prénom, le mail ou le jeton d'un répondant :
  // les personnes y sont désignées par leur pseudonyme (« Répondant n »).
  outil({
    nom: 'lister_repondants',
    description:
      "Liste les répondants d'un questionnaire, sans leur identité : repondant_id, pseudonyme (« Répondant n », le même dans tout le projet), poste, entreprise, statut (invite, commence, termine), nombre de réponses et dates. Sert à choisir l'entretien à résumer avec lire_entretien. Un invité qui n'a pas commencé n'a ni pseudonyme ni entretien.",
    lectureSeule: true,
    schema: z.object({ questionnaire_id: idQuestionnaire }),
    executer: async (ctx, { questionnaire_id }) => listerRepondantsPseudonymises(ctx.db, questionnaire_id),
  }),
  outil({
    nom: 'lire_entretien',
    description:
      "Lit l'entretien d'un seul répondant, pseudonymisé, en Markdown, par morceaux de 20 000 caractères au plus. Renvoie { projet_id, questionnaire_id, repondant_id, pseudonyme, nb_entretiens, taille, debut, texte, suite } : suite est la position du morceau suivant (à passer en debut), ou null quand tout est lu. Lire d'abord le guide « fiche_repondant ».",
    lectureSeule: true,
    schema: z.object({
      repondant_id: z.string().describe('Identifiant du répondant, tel que renvoyé par lister_repondants ou lire_reponses'),
      debut: debutMorceau,
      longueur: longueurMorceau,
    }),
    executer: async (ctx, { repondant_id, debut, longueur }) => {
      const { projet_id, questionnaire_id, pseudonyme, corpus } = await entretienPseudonymise(ctx.db, repondant_id)
      return { projet_id, questionnaire_id, repondant_id, pseudonyme, nb_entretiens: corpus.nb_entretiens, ...decouper(corpus.texte, debut, longueur) }
    },
  }),
  outil({
    nom: 'lire_reponses',
    description:
      "Lit les entretiens d'un projet entier, ou d'un seul questionnaire, pseudonymisés, en Markdown, par morceaux de 20 000 caractères au plus coupés de préférence entre deux entretiens. Par défaut, les entretiens terminés seulement ; inclure_en_cours ajoute ceux qui sont commencés, marqués « entretien inachevé ». Renvoie { nb_entretiens, taille, debut, texte, suite, repondants } : passer suite en debut jusqu'à ce qu'elle soit nulle, et ne rien conclure avant d'avoir tout lu ; repondants associe chaque pseudonyme à son repondant_id. Lire d'abord le guide « synthese » ou « expression_besoin ».",
    lectureSeule: true,
    schema: z.object({
      projet_id: idProjet,
      questionnaire_id: idQuestionnaire.optional().describe('Pour ne lire que les entretiens de ce questionnaire'),
      inclure_en_cours: z.boolean().default(false).describe('Ajouter les entretiens commencés mais pas terminés (non par défaut)'),
      debut: debutMorceau,
      longueur: longueurMorceau,
    }),
    executer: async (ctx, { debut, longueur, ...portee }) => {
      const corpus = await construireCorpus(ctx.db, portee)
      return {
        nb_entretiens: corpus.nb_entretiens,
        ...decouper(corpus.texte, debut, longueur),
        repondants: corpus.repondants.map(r => ({ pseudonyme: r.pseudonyme, repondant_id: r.id })),
      }
    },
  }),
  outil({
    nom: 'enregistrer_analyse',
    description:
      "Enregistre une analyse rédigée en Markdown, avec la source « mcp » ; rien n'est écrasé, chaque enregistrement s'ajoute à l'historique du projet. Types : fiche_repondant (exige repondant_id), synthese et expression_besoin (sans repondant_id, avec questionnaire_id si l'analyse porte sur un seul questionnaire). nb_entretiens est le nombre d'entretiens couverts, tel que renvoyé par lire_reponses ou lire_entretien. À n'appeler qu'après accord explicite du porteur du projet sur le texte.",
    lectureSeule: false,
    schema: z.object({
      projet_id: idProjet,
      type: z.enum(TYPES_ANALYSE),
      contenu: z.string().min(1).max(LIMITES_ANALYSE.contenu).describe("Texte de l'analyse, en Markdown"),
      questionnaire_id: idQuestionnaire.optional().describe("Questionnaire couvert, si l'analyse n'en porte que sur un"),
      repondant_id: z.string().optional().describe('Répondant de la fiche (fiche_repondant uniquement)'),
      nb_entretiens: z.number().int().min(0).describe("Nombre d'entretiens couverts"),
    }),
    executer: async (ctx, saisie) => {
      const { contenu, ...analyse } = await enregistrerAnalyse(ctx.db, { ...saisie, source: 'mcp' })
      return { ...analyse, taille: caracteres(contenu).length }
    },
  }),
  outil({
    nom: 'lister_analyses',
    description:
      "Liste les analyses enregistrées d'un projet, les plus récentes d'abord, sans leur contenu : type, portée (projet entier, questionnaire, ou pseudonyme du répondant pour une fiche), source, nombre d'entretiens, date et taille. Filtres facultatifs par questionnaire, répondant ou type. Le texte se lit avec lire_analyse.",
    lectureSeule: true,
    schema: z.object({
      projet_id: idProjet,
      questionnaire_id: idQuestionnaire.optional(),
      repondant_id: z.string().optional(),
      type: z.enum(TYPES_ANALYSE).optional(),
    }),
    executer: async (ctx, filtre) => listerAnalysesPseudonymisees(ctx.db, filtre),
  }),
  outil({
    nom: 'lire_analyse',
    description:
      "Lit une analyse enregistrée, par morceaux de 20 000 caractères au plus. Renvoie ses informations (type, portée, source, nombre d'entretiens, date) et { taille, debut, texte, suite } : suite est la position du morceau suivant (à passer en debut), ou null quand tout est lu. Les identifiants viennent de lister_analyses.",
    lectureSeule: true,
    schema: z.object({
      analyse_id: z.string().describe("Identifiant de l'analyse, tel que renvoyé par lister_analyses"),
      debut: debutMorceau,
      longueur: longueurMorceau,
    }),
    executer: async (ctx, { analyse_id, debut, longueur }) => {
      const { contenu, ...analyse } = await lireAnalyse(ctx.db, analyse_id)
      return { ...analyse, ...decouper(contenu, debut, longueur) }
    },
  }),
]

const MESSAGE_ERREUR_INTERNE = 'Erreur interne du serveur. Réessayez ; si le problème persiste, consultez les journaux.'

function enErreur(message: string): ResultatOutil {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Exécute un outil sur des arguments déjà validés ; une erreur métier devient un résultat d'erreur lisible. */
export async function executerOutil(ctx: Contexte, outilChoisi: Outil, args: unknown): Promise<ResultatOutil> {
  try {
    const valeur = await outilChoisi.executer(ctx, args as never)
    const text = typeof valeur === 'string' ? valeur : JSON.stringify(valeur, null, 2)
    return { content: [{ type: 'text', text }] }
  } catch (e) {
    if (e instanceof ErreurMetier) return enErreur(e.message)
    // Le détail (par exemple une erreur D1) reste dans les journaux : il n'a rien à faire dans la conversation.
    console.error(`MCP : erreur inattendue dans l'outil ${outilChoisi.nom}`, e)
    return enErreur(MESSAGE_ERREUR_INTERNE)
  }
}

/** Point d'entrée hors SDK (tests, futurs appels internes) : trouve l'outil et valide les arguments. */
export async function appelerOutil(ctx: Contexte, nom: string, args: unknown): Promise<ResultatOutil> {
  const outilChoisi = OUTILS.find(o => o.nom === nom)
  if (!outilChoisi) return enErreur(`Outil inconnu : ${nom}`)
  const analyse = outilChoisi.schema.safeParse(args ?? {})
  if (!analyse.success) {
    const details = analyse.error.issues.map(i => `${i.path.join('.') || 'arguments'} : ${i.message}`).join(' ; ')
    return enErreur(`Arguments invalides — ${details}`)
  }
  return executerOutil(ctx, outilChoisi, analyse.data)
}
