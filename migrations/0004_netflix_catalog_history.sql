-- ============================================
-- Topflix D1 Database - Netflix CZ catalog snapshots and Top 10 history
-- Migration: 0004_netflix_catalog_history
-- Created: 2026-10-15
-- ============================================

-- Katalog Netflixu v ČR podle TMDB. Každá synchronizace posune last_seen.
-- Titul, který při synchronizaci přibyde, dostane first_seen = den synchronizace.
-- Řádky z první (výchozí) synchronizace mají baseline = 1 a nejsou to přírůstky.
CREATE TABLE netflix_catalog (
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'series')),

  title TEXT,
  title_original TEXT,
  year INTEGER,
  poster_url TEXT,
  popularity REAL,
  vote_count INTEGER,
  original_language TEXT,

  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  baseline INTEGER NOT NULL DEFAULT 0,
  removed_at TEXT,

  -- Doplněno jen u přírůstků (detail TMDB + OMDb)
  enriched_at TEXT,
  description TEXT,
  genre TEXT,
  runtime INTEGER,
  number_of_seasons INTEGER,
  number_of_episodes INTEGER,
  series_status TEXT,
  episode_runtime INTEGER,
  origin_country TEXT,
  imdb_id TEXT,
  tmdb_rating REAL,
  imdb_rating REAL,
  rotten_tomatoes_rating INTEGER,
  metacritic_rating INTEGER,
  avg_rating INTEGER,

  PRIMARY KEY (tmdb_id, type)
);

CREATE INDEX idx_catalog_added ON netflix_catalog(baseline, first_seen DESC);
CREATE INDEX idx_catalog_removed ON netflix_catalog(removed_at DESC) WHERE removed_at IS NOT NULL;
CREATE INDEX idx_catalog_last_seen ON netflix_catalog(type, last_seen);

-- Průběh synchronizací (pro kontrolu a pro hlídání hromadného "zmizení")
CREATE TABLE netflix_catalog_runs (
  run_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'series')),
  baseline INTEGER NOT NULL DEFAULT 0,
  pages INTEGER DEFAULT 0,
  seen INTEGER DEFAULT 0,
  added INTEGER DEFAULT 0,
  removed INTEGER DEFAULT 0,
  finished_at TEXT,
  note TEXT,
  PRIMARY KEY (run_date, type)
);

-- Netflix Top 10 pro ČR přesně tak, jak ji Netflix zveřejňuje (od 2021)
CREATE TABLE netflix_top10_weeks (
  week TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('Films', 'TV')),
  rank INTEGER NOT NULL,
  show_title TEXT NOT NULL,
  season_title TEXT,
  weeks_in_top10 INTEGER,
  PRIMARY KEY (week, category, rank)
);

CREATE INDEX idx_top10_weeks_title ON netflix_top10_weeks(show_title, category);

-- Napárování názvů z Top 10 na TMDB (tmdb_id NULL = nenalezeno)
CREATE TABLE netflix_title_map (
  show_title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'series')),
  tmdb_id INTEGER,
  matched_at TEXT NOT NULL,
  PRIMARY KEY (show_title, type)
);

CREATE INDEX idx_title_map_tmdb ON netflix_title_map(tmdb_id, type);
