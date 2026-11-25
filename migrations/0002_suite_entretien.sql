-- État du calcul de la suite d'un entretien (question suivante, relance ou fin).
-- suite_debut : horodatage du calcul en cours, nul sinon ; un calcul de plus de 60 s est considéré comme abandonné.
-- suite_essais : essais ratés pour l'étape en cours, remis à 0 dès qu'une suite est posée.
-- suite_essai_le : horodatage du début du dernier essai, pour espacer les nouvelles tentatives.
ALTER TABLE repondants ADD COLUMN suite_debut TEXT;
ALTER TABLE repondants ADD COLUMN suite_essais INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repondants ADD COLUMN suite_essai_le TEXT;
