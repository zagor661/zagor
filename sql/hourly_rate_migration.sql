-- Add hourly_rate column to profiles for schedule cost tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(6,2) DEFAULT 0;
