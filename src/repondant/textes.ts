// Tous les textes vus par le répondant, regroupés pour être relus et modifiés en un seul endroit.

export const TEXTES = {
  titrePage: 'Votre avis nous intéresse',

  accueil: {
    titre: 'Votre avis nous intéresse',
    introductionParDefaut:
      'Nous préparons une évolution d\'un logiciel que vous utilisez et souhaitons connaître votre pratique.',
    duree: (minutes: number) => `Environ ${minutes} minute${minutes > 1 ? 's' : ''}`,
    reprise: 'Vous pouvez vous interrompre à tout moment : vos réponses sont enregistrées au fur et à mesure.',
    donnees:
      'Vos coordonnées et vos réponses sont utilisées uniquement pour ce projet, par l\'équipe qui vous a transmis ce lien. '
      + 'Elles ne sont ni publiées ni transmises à des tiers. Vous pouvez demander leur suppression à cette équipe.',
    invitation: 'Vérifiez vos coordonnées, corrigez-les si besoin, puis commencez.',
  },

  identite: {
    titre: 'Vos coordonnées',
    nom: 'Nom',
    prenom: 'Prénom',
    entreprise: 'Entreprise',
    poste: 'Poste',
    mail: 'Adresse mail',
    facultatif: 'facultatif',
    commencer: 'Commencer',
    nomObligatoire: 'Le nom est obligatoire.',
    prenomObligatoire: 'Le prénom est obligatoire.',
    entrepriseObligatoire: 'L\'entreprise est obligatoire.',
  },

  question: {
    progression: (numero: number, total: number) => `Question ${numero} sur ${total}`,
    rappel: 'Vous avez répondu :',
    plusieurs: 'Plusieurs réponses possibles',
    echelleMin: 'Pas du tout',
    echelleMax: 'Tout à fait',
    commentaire: 'Un commentaire ? (facultatif)',
    suivant: 'Suivant',
    patienter: 'Un instant…',
    patienterLong: 'Nous préparons la question suivante.',
    reessayer: 'Réessayer',
  },

  etats: {
    invalideTitre: 'Lien invalide',
    invalide: 'Cette adresse ne correspond à aucun questionnaire. Vérifiez le lien reçu.',
    closTitre: 'Questionnaire clos',
    clos: 'Ce questionnaire est clos. Merci de votre intérêt.',
    termineTitre: 'Merci !',
    termine: 'Vos réponses ont bien été enregistrées. Vous pouvez fermer cette page.',
    interrompuTitre: 'Entretien interrompu',
    interrompu: 'Un problème technique interrompt l\'entretien. Vos réponses sont enregistrées.',
    reessayer: 'Réessayer',
    terminer: 'Terminer l\'entretien',
    persiste: 'Le problème persiste. Réessayez dans un moment, ou terminez l\'entretien.',
    confirmerTerminer: 'Terminer l\'entretien maintenant ? Les réponses déjà données sont conservées.',
    epuise: 'Le problème persiste. Vos réponses sont enregistrées : vous pouvez terminer l\'entretien.',
    attenteTitre: 'Un instant…',
  },

  partage: {
    pasVous: (prenom: string) => `Vous n'êtes pas ${prenom} ?`,
    nouvelle: 'Commencer une nouvelle participation',
  },

  erreurs: {
    reseau: 'Connexion impossible. Vérifiez votre réseau : votre saisie est conservée.',
    inattendue: 'Un problème est survenu. Réessayez dans un instant.',
  },
} as const
