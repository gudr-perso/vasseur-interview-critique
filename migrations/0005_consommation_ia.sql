-- Consommation de l'API Anthropic, une ligne par requête qui a consommé des jetons.
-- Aucun texte ni donnée personnelle. Pas de clé étrangère : la dépense d'un projet supprimé reste dans le total.
-- Coût en micro-dollars, NULL si le modèle n'avait pas de tarif.
CREATE TABLE consommation_ia (
  id TEXT PRIMARY KEY,
  cree_le TEXT NOT NULL,
  poste TEXT NOT NULL CHECK (poste IN ('cadrage', 'interview', 'analyse', 'interview_critique')),
  projet_id TEXT,
  modele TEXT NOT NULL,
  jetons_entree INTEGER NOT NULL,
  jetons_sortie INTEGER NOT NULL,
  cache_lecture INTEGER NOT NULL,
  cache_ecriture INTEGER NOT NULL,
  cout_micro_usd INTEGER
);

CREATE INDEX idx_consommation_projet ON consommation_ia(projet_id, poste);
CREATE INDEX idx_consommation_date ON consommation_ia(cree_le);
