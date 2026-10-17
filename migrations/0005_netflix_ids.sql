-- Netflix ID titulů (z Wikidat, vlastnost P1874) pro přímé odkazy
-- https://www.netflix.com/title/<netflix_id>. Samostatná tabulka, protože
-- tituly z Top 10 a novinek nemusí být v content ani v netflix_catalog.
-- netflix_id NULL = na Wikidatech zatím není, zkusí se znovu po checked_at.

CREATE TABLE IF NOT EXISTS netflix_ids (
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'series')),
  netflix_id TEXT,
  source TEXT,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (tmdb_id, type)
);

CREATE INDEX IF NOT EXISTS idx_netflix_ids_checked ON netflix_ids(checked_at);
