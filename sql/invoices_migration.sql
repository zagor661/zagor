-- ============================================================
-- MIGRACJA: Moduł Faktur — invoices + invoice_items
-- ============================================================

-- 1. Tabela główna faktur
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES locations(id),
  invoice_number TEXT,
  supplier_name TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  net_total NUMERIC(10,2) DEFAULT 0,
  vat_total NUMERIC(10,2) DEFAULT 0,
  gross_total NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'PLN',
  payment_method TEXT, -- 'przelew', 'gotowka', 'karta'
  status TEXT DEFAULT 'new', -- 'new', 'verified', 'paid', 'disputed'
  image_url TEXT, -- zdjecie oryginalu
  gdrive_file_id TEXT, -- ID pliku na Google Drive
  gdrive_url TEXT, -- link do Google Drive
  ocr_raw JSONB, -- surowe dane z GPT Vision
  notes TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  verified_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Pozycje faktur
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_name_normalized TEXT, -- znormalizowana nazwa do matchowania z food cost
  quantity NUMERIC(10,3),
  unit TEXT, -- 'kg', 'szt', 'l', 'op'
  unit_price NUMERIC(10,2),
  net_amount NUMERIC(10,2),
  vat_rate NUMERIC(4,2), -- np. 23, 8, 5, 0
  vat_amount NUMERIC(10,2),
  gross_amount NUMERIC(10,2),
  -- Porównanie z Food Cost
  foodcost_match TEXT, -- nazwa z FOODCOST_PRODUCTS
  foodcost_price_per_kg NUMERIC(10,2), -- cena referencyjna
  price_per_kg_invoice NUMERIC(10,2), -- przeliczona cena z faktury
  price_diff_pct NUMERIC(6,2), -- % różnicy (+ = drożej, - = taniej)
  price_alert TEXT, -- 'higher', 'lower', 'match', 'no_match'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indeksy
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_location ON invoices(location_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_alert ON invoice_items(price_alert) WHERE price_alert IS NOT NULL;

-- 4. RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_all" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "invoice_items_all" ON invoice_items FOR ALL USING (true) WITH CHECK (true);

-- 5. Powiazanie dostawy z faktura
ALTER TABLE delivery_logs ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id);

-- 6. Weryfikacja
SELECT 'invoices' as tbl, count(*) FROM invoices
UNION ALL
SELECT 'invoice_items', count(*) FROM invoice_items;
