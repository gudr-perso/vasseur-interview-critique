-- Numéro de pseudonyme (« Répondant n ») attribué une fois pour toutes quand le répondant commence.
-- Il ne dépend plus du rang parmi les répondants existants : une suppression ne renumérote personne.
ALTER TABLE repondants ADD COLUMN numero INTEGER;

-- Répondants déjà commencés : numéros dans l'ordre utilisé jusqu'ici (commence_le, puis id), par projet.
-- Un commence_le nul passait en premier, comme dans ORDER BY.
UPDATE repondants SET numero = (
  SELECT COUNT(*) FROM repondants r2 JOIN questionnaires q2 ON q2.id = r2.questionnaire_id
  WHERE q2.projet_id = (SELECT q.projet_id FROM questionnaires q WHERE q.id = repondants.questionnaire_id)
    AND r2.statut <> 'invite'
    AND (COALESCE(r2.commence_le, '') < COALESCE(repondants.commence_le, '')
      OR (COALESCE(r2.commence_le, '') = COALESCE(repondants.commence_le, '') AND r2.id <= repondants.id))
) WHERE statut <> 'invite';

-- Registre des numéros attribués : il porte le projet, que repondants n'a pas, pour garantir l'unicité par projet
-- (clé primaire). Une ligne reste après la suppression du répondant : son numéro n'est jamais réattribué.
CREATE TABLE numeros_repondants (
  projet_id TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  repondant_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (projet_id, numero)
);

INSERT INTO numeros_repondants (projet_id, numero, repondant_id)
  SELECT q.projet_id, r.numero, r.id FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
  WHERE r.numero IS NOT NULL;
