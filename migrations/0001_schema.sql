-- Schéma initial de l'outil d'interview utilisateurs.
CREATE TABLE logiciels (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  contexte TEXT NOT NULL DEFAULT '',
  cree_le TEXT NOT NULL,
  maj_le TEXT NOT NULL
);

CREATE TABLE projets (
  id TEXT PRIMARY KEY,
  titre TEXT NOT NULL,
  type_demande TEXT NOT NULL CHECK (type_demande IN ('evolution_simple', 'amelioration', 'nouvelle_fonctionnalite')),
  description TEXT NOT NULL DEFAULT '',
  note_cadrage TEXT NOT NULL DEFAULT '',
  resume_contexte TEXT NOT NULL DEFAULT '',
  modele_cadrage TEXT NOT NULL,
  modele_interview TEXT NOT NULL,
  modele_analyse TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'cadre', 'en_cours', 'clos')),
  cree_le TEXT NOT NULL,
  maj_le TEXT NOT NULL
);

CREATE TABLE projet_logiciels (
  projet_id TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  logiciel_id TEXT NOT NULL REFERENCES logiciels(id) ON DELETE CASCADE,
  PRIMARY KEY (projet_id, logiciel_id)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  projet_id TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  contenu TEXT NOT NULL,
  cree_le TEXT NOT NULL
);

CREATE TABLE cadrage_messages (
  id TEXT PRIMARY KEY,
  projet_id TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ia', 'admin')),
  contenu TEXT NOT NULL,
  cree_le TEXT NOT NULL
);

CREATE TABLE questionnaires (
  id TEXT PRIMARY KEY,
  projet_id TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  public_vise TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('hybride', 'entretien')),
  introduction TEXT NOT NULL DEFAULT '',
  duree_estimee_min INTEGER NOT NULL DEFAULT 10,
  contenu TEXT NOT NULL,
  relances_max_par_question INTEGER NOT NULL DEFAULT 1,
  tours_max INTEGER NOT NULL DEFAULT 12,
  code TEXT NOT NULL UNIQUE,
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'ouvert', 'clos')),
  cree_le TEXT NOT NULL,
  maj_le TEXT NOT NULL
);

CREATE TABLE repondants (
  id TEXT PRIMARY KEY,
  questionnaire_id TEXT NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  jeton TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL DEFAULT '',
  prenom TEXT NOT NULL DEFAULT '',
  poste TEXT NOT NULL DEFAULT '',
  entreprise TEXT NOT NULL DEFAULT '',
  mail TEXT NOT NULL DEFAULT '',
  origine TEXT NOT NULL CHECK (origine IN ('invitation', 'lien_generique')),
  statut TEXT NOT NULL DEFAULT 'invite' CHECK (statut IN ('invite', 'commence', 'termine')),
  commence_le TEXT,
  termine_le TEXT
);

CREATE TABLE tours (
  id TEXT PRIMARY KEY,
  repondant_id TEXT NOT NULL REFERENCES repondants(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  question_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('question', 'relance')),
  question TEXT NOT NULL,
  reponse TEXT,
  cree_le TEXT NOT NULL,
  UNIQUE (repondant_id, ordre)
);

CREATE TABLE analyses (
  id TEXT PRIMARY KEY,
  projet_id TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  questionnaire_id TEXT REFERENCES questionnaires(id) ON DELETE CASCADE,
  repondant_id TEXT REFERENCES repondants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('fiche_repondant', 'synthese', 'expression_besoin')),
  contenu TEXT NOT NULL,
  source TEXT NOT NULL,
  nb_entretiens INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL
);

CREATE INDEX idx_documents_projet ON documents(projet_id);
CREATE INDEX idx_cadrage_projet ON cadrage_messages(projet_id, cree_le);
CREATE INDEX idx_questionnaires_projet ON questionnaires(projet_id);
CREATE INDEX idx_repondants_questionnaire ON repondants(questionnaire_id);
CREATE INDEX idx_tours_repondant ON tours(repondant_id, ordre);
CREATE INDEX idx_analyses_projet ON analyses(projet_id, cree_le);
