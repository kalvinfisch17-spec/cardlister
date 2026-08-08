-- CardLister database setup
-- Run with: psql -U postgres -d cardlister -f scripts/setup-db.sql

-- Enums (IF NOT EXISTS is not supported for CREATE TYPE; use DO blocks instead)
DO $$ BEGIN
  CREATE TYPE holo_type AS ENUM ('standard', 'holo', 'reverse_holo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE card_status AS ENUM ('pending', 'reviewed', 'listed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('draft', 'active', 'sold', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

-- Migration: add needs_price_review flag for cards where eBay pricing wasn't found
ALTER TABLE cards ADD COLUMN IF NOT EXISTS needs_price_review BOOLEAN NOT NULL DEFAULT false;

-- Migration: add sale_price and sold_at columns to track actual sale amounts
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sale_price REAL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP;

-- Import jobs table (tracks background CSV import progress)
CREATE TABLE IF NOT EXISTS import_jobs (
  id          TEXT PRIMARY KEY,
  total       INTEGER NOT NULL DEFAULT 0,
  processed   INTEGER NOT NULL DEFAULT 0,
  done        BOOLEAN NOT NULL DEFAULT false,
  imported    INTEGER NOT NULL DEFAULT 0,
  priced      INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  not_priced  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

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
