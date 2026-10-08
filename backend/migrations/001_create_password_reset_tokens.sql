-- ============================================================
-- MIGRATION: Create password_reset_tokens table
-- Run this once in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL,          -- SHA-256 hash of the raw token
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ DEFAULT NULL,  -- NULL = unused; set when consumed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookups by hash
CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens (token_hash);

-- Fast cleanup of old tokens per user
CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens (user_id);

-- Row-Level Security: backend uses the service-role key, so RLS is bypassed.
-- Enabling RLS here just prevents accidental public API exposure.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Deny all direct client access (backend service key bypasses this)
CREATE POLICY "No direct client access" ON password_reset_tokens
  FOR ALL USING (false);
