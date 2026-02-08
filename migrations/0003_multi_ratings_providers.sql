-- ============================================
-- Topflix D1 Database - Multi-source ratings & streaming providers
-- Migration: 0003_multi_ratings_providers
-- Created: 2026-02-08
-- ============================================

-- Add IMDb ID for external lookups
ALTER TABLE content ADD COLUMN imdb_id TEXT;

-- Add individual source ratings
ALTER TABLE content ADD COLUMN imdb_rating REAL;
ALTER TABLE content ADD COLUMN rotten_tomatoes_rating INTEGER;
ALTER TABLE content ADD COLUMN metacritic_rating INTEGER;

-- Add streaming providers (JSON array of provider slugs)
ALTER TABLE content ADD COLUMN streaming_providers TEXT;

-- Index for IMDb ID lookups
CREATE INDEX idx_imdb_id ON content(imdb_id) WHERE imdb_id IS NOT NULL;
