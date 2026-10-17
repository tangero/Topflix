-- Kliky na „Pustit“ (web i newsletter) jako denní součty. Bez IP adres,
-- cookies a čehokoli, co by identifikovalo návštěvníka.
-- watch: direct = přímý odkaz na titul, search = vyhledávání ve službě.

CREATE TABLE IF NOT EXISTS watch_clicks_daily (
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  section TEXT NOT NULL,
  watch TEXT NOT NULL CHECK(watch IN ('direct', 'search')),
  provider TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, page, section, watch, provider, tmdb_id, type)
);

CREATE INDEX IF NOT EXISTS idx_watch_clicks_title ON watch_clicks_daily(tmdb_id, type);
