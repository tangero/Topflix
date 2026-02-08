-- ============================================
-- Topflix D1 Database - Deduplicate appearance_history
-- Migration: 0002_deduplicate_history
-- Created: 2026-02-08
-- ============================================

-- Add UNIQUE constraint to prevent duplicate entries per day+source
-- SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we recreate the table

-- Step 1: Create new table with UNIQUE constraint
CREATE TABLE appearance_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('top10', 'netflix_new')),
  rank INTEGER,
  rating INTEGER NOT NULL,

  UNIQUE(tmdb_id, type, date, source),
  FOREIGN KEY (tmdb_id, type) REFERENCES content(tmdb_id, type)
);

-- Step 2: Copy data, keeping only first occurrence per (tmdb_id, type, date, source)
INSERT OR IGNORE INTO appearance_history_new (tmdb_id, type, date, source, rank, rating)
SELECT tmdb_id, type, date, source, rank, rating
FROM appearance_history
ORDER BY id ASC;

-- Step 3: Drop old table
DROP TABLE appearance_history;

-- Step 4: Rename new table
ALTER TABLE appearance_history_new RENAME TO appearance_history;

-- Step 5: Recreate indexes
CREATE INDEX idx_history_content ON appearance_history(tmdb_id, type, date DESC);
CREATE INDEX idx_history_date ON appearance_history(date DESC, source);
