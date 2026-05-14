-- Notification log — prevents duplicate push notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  location_id UUID NOT NULL,
  tag TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_log_lookup
  ON notification_log (profile_id, tag, created_at DESC);

-- RLS
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service key full access" ON notification_log
  FOR ALL USING (true) WITH CHECK (true);
