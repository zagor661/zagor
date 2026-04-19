-- ============================================================
-- WOKI TALKIE — komunikacja Właściciel ↔ Menager
-- ============================================================
-- Moduł wiadomości głosowych i tekstowych.
-- Widoczny tylko dla ról: owner, manager.
-- Audio przechowywane w Supabase Storage (bucket: woki-talkie).
-- ============================================================

-- 1. Tabela wiadomości
CREATE TABLE IF NOT EXISTS woki_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id),
  sender_id UUID NOT NULL REFERENCES profiles(id),
  receiver_id UUID REFERENCES profiles(id),        -- NULL = broadcast do wszystkich admin
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'voice')) DEFAULT 'text',
  text_content TEXT,                                 -- treść tekstowa
  audio_url TEXT,                                    -- URL do pliku w Storage
  audio_duration_sec INTEGER,                        -- długość nagrania w sekundach
  transcription TEXT,                                -- transkrypcja Whisper (opcjonalnie)
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indeksy
CREATE INDEX IF NOT EXISTS idx_woki_messages_location
  ON woki_messages(location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_woki_messages_receiver
  ON woki_messages(receiver_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_woki_messages_sender
  ON woki_messages(sender_id, created_at DESC);

-- 3. Storage bucket (uruchom w Supabase Dashboard → Storage → New bucket)
-- Nazwa: woki-talkie
-- Public: false (prywatny — dostęp przez signed URLs)
-- File size limit: 5MB
-- Allowed MIME types: audio/webm, audio/ogg, audio/mp4, audio/mpeg

-- 4. RLS (Row Level Security) — opcjonalnie
-- ALTER TABLE woki_messages ENABLE ROW LEVEL SECURITY;
-- Polityki: sender lub receiver widzi swoje wiadomości

-- 5. Weryfikacja
SELECT 'woki_messages created' AS status;
