-- AI Monitor alerts table
CREATE TABLE IF NOT EXISTS ai_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'price_increase',    -- cena składnika wzrosła
    'price_decrease',    -- cena składnika spadła
    'fc_warning',        -- food cost przekroczył próg
    'sales_drop',        -- spadek sprzedaży produktu
    'sales_spike',       -- skok sprzedaży produktu
    'cost_anomaly',      -- anomalia w kosztach
    'invoice_new',       -- nowa faktura z alertem
    'labor_high',        -- wysoki koszt pracy
    'daily_summary'      -- dzienny raport podsumowujący
  )),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_ai_alerts_location ON ai_alerts(location_id);
CREATE INDEX idx_ai_alerts_created ON ai_alerts(created_at DESC);
CREATE INDEX idx_ai_alerts_unread ON ai_alerts(location_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_ai_alerts_type ON ai_alerts(type);

-- RLS
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alerts for their location"
  ON ai_alerts FOR SELECT
  USING (location_id IN (
    SELECT location_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Service role can insert alerts"
  ON ai_alerts FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Users can mark alerts as read"
  ON ai_alerts FOR UPDATE
  USING (location_id IN (
    SELECT location_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (location_id IN (
    SELECT location_id FROM profiles WHERE id = auth.uid()
  ));
