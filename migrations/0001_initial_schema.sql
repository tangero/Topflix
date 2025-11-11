-- ============================================
-- Topflix D1 Database - Initial Schema
-- Migration: 0001_initial_schema
-- Created: 2025-11-11
-- ============================================

-- Main content table (denormalized for performance)
CREATE TABLE content (
  -- Primary identification
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'series')),

  -- Titles and metadata
  title TEXT NOT NULL,
  title_original TEXT,
  year INTEGER,
  genre TEXT,

  -- Ratings (most important for queries)
  avg_rating INTEGER,
  tmdb_rating REAL,
  csfd_rating INTEGER,
  quality_tier TEXT CHECK(quality_tier IN ('excellent', 'good', 'average', 'below_average', 'poor')),

  -- Visual and descriptive data
  poster_url TEXT,
  description TEXT,
  runtime INTEGER,
  number_of_seasons INTEGER,
  number_of_episodes INTEGER,

  -- Origin and localization
  origin_country TEXT,
  is_regional INTEGER DEFAULT 0,

  -- Tracking and statistics
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  appearances INTEGER DEFAULT 1,
  last_rank INTEGER,
  last_source TEXT CHECK(last_source IN ('top10', 'netflix_new')),

  -- Metadata
  tmdb_url TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  PRIMARY KEY (tmdb_id, type)
);

-- Appearance history table (normalized)
CREATE TABLE appearance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('top10', 'netflix_new')),
  rank INTEGER,
  rating INTEGER NOT NULL,

  FOREIGN KEY (tmdb_id, type) REFERENCES content(tmdb_id, type)
);

-- ============================================
-- INDEXES - Optimized for common queries
-- ============================================

-- 1. Main index for "Quality Archive"
CREATE INDEX idx_quality_content ON content(avg_rating DESC, last_seen DESC)
WHERE avg_rating >= 70;

-- 2. Index for "Best All Time"
CREATE INDEX idx_best_all_time ON content(avg_rating DESC, appearances DESC)
WHERE avg_rating >= 80;

-- 3. Index for "Recently Added"
CREATE INDEX idx_recent ON content(first_seen DESC, avg_rating DESC)
WHERE avg_rating >= 70;

-- 4. Composite index for filtering by type
CREATE INDEX idx_type_rating ON content(type, avg_rating DESC, last_seen DESC);

-- 5. Index for title search
CREATE INDEX idx_title ON content(title);

-- 6. Index for popularity tracking
CREATE INDEX idx_appearances ON content(appearances DESC, avg_rating DESC)
WHERE appearances > 1;

-- 7. History indexes
CREATE INDEX idx_history_content ON appearance_history(tmdb_id, type, date DESC);
CREATE INDEX idx_history_date ON appearance_history(date DESC, source);

-- ============================================
-- VIEWS - For easier queries
-- ============================================

-- Quality content (>=70%)
CREATE VIEW v_quality_content AS
SELECT * FROM content
WHERE avg_rating >= 70
ORDER BY avg_rating DESC, last_seen DESC;

-- Recent quality (last 30 days)
CREATE VIEW v_recent_quality AS
SELECT * FROM content
WHERE avg_rating >= 70
  AND last_seen >= date('now', '-30 days')
ORDER BY avg_rating DESC;

-- Frequent in Top 10
CREATE VIEW v_top10_frequent AS
SELECT * FROM content
WHERE last_source = 'top10' AND appearances > 1
ORDER BY appearances DESC, avg_rating DESC;
