-- Nature de chaque message du dialogue de cadrage, enregistrée plutôt que devinée d'après le texte :
-- question ou conclusion de l'IA, réponse de l'admin. Une conclusion dit, même après rechargement, que l'IA a fini.
-- SQLite ne sait pas ajouter une colonne NOT NULL sans défaut ni une contrainte entre colonnes : la table est refaite.
CREATE TABLE cadrage_messages_type (
  id TEXT PRIMARY KEY,
  projet_id TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ia', 'admin')),
  type TEXT NOT NULL CHECK (type IN ('question', 'reponse', 'conclusion')),
  contenu TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  CHECK ((role = 'admin') = (type = 'reponse'))
);

-- Lignes existantes : un message de l'admin est une réponse ; un message de l'IA est une question s'il finit par
-- un point d'interrogation (la règle appliquée jusqu'ici pour compter les questions), une conclusion sinon.
-- L'ordre d'insertion suit l'ancien rowid, qui départage les messages de même date.
INSERT INTO cadrage_messages_type (id, projet_id, role, type, contenu, cree_le)
  SELECT id, projet_id, role,
    CASE WHEN role = 'admin' THEN 'reponse'
         WHEN rtrim(contenu, ' ' || char(9) || char(10) || char(13) || ')]»"''”’') LIKE '%?' THEN 'question'
         ELSE 'conclusion' END,
    contenu, cree_le
  FROM cadrage_messages ORDER BY rowid;

DROP TABLE cadrage_messages;

ALTER TABLE cadrage_messages_type RENAME TO cadrage_messages;

CREATE INDEX idx_cadrage_projet ON cadrage_messages(projet_id, cree_le);
