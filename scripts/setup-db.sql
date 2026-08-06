-- CardLister database setup
-- Run with: psql -U postgres -d cardlister -f scripts/setup-db.sql

-- Enums
CREATE TYPE IF NOT EXISTS holo_type AS ENUM ('standard', 'holo', 'reverse_holo');
CREATE TYPE IF NOT EXISTS card_status AS ENUM ('pending', 'reviewed', 'listed');
CREATE TYPE IF NOT EXISTS listing_status AS ENUM ('draft', 'active', 'sold', 'ended');

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
  id             SERIAL PRIMARY KEY,
  image_url      TEXT,
  image_url_back TEXT,
  card_name   TEXT,
  set_name    TEXT,
  card_number TEXT,
  year        TEXT,
  quality     TEXT,
  holo_type   holo_type,
  language    TEXT,
  rarity      TEXT,
  notes       TEXT,
  status      card_status NOT NULL DEFAULT 'pending',
  suggested_price REAL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Listings table
CREATE TABLE IF NOT EXISTS listings (
  id               SERIAL PRIMARY KEY,
  card_id          INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  ebay_listing_id  TEXT,
  title            TEXT,
  description      TEXT,
  price            REAL,
  status           listing_status NOT NULL DEFAULT 'draft',
  ebay_url         TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Migration: add image_url_back if upgrading an existing install
ALTER TABLE cards ADD COLUMN IF NOT EXISTS image_url_back TEXT;

-- eBay tokens table
CREATE TABLE IF NOT EXISTS ebay_tokens (
  id            SERIAL PRIMARY KEY,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  username      TEXT,
  expires_at    TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

SELECT 'Tables created successfully.' AS status;
