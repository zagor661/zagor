-- ============================================================
-- FOOD COST — Baza składników + Przepisy + Kalkulacja kosztów
-- ============================================================

-- 1. Składniki (baza surowców)
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',              -- kg, l, szt, opak
  price_per_unit NUMERIC(10,2) NOT NULL,        -- cena za jednostkę (PLN)
  supplier TEXT,                                 -- dostawca (MAKRO, Kuchnia Świata, etc.)
  category TEXT DEFAULT 'inne',                  -- warzywa, mięso, nabiał, suche, sosy, inne
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Przepisy (dania z menu)
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                            -- np. "Pad Thai z kurczakiem"
  category TEXT DEFAULT 'main',                  -- main, starter, soup, dessert, drink, side
  brand TEXT DEFAULT 'woki_woki',                -- woki_woki, nash
  portions INTEGER NOT NULL DEFAULT 1,           -- ile porcji z przepisu
  selling_price NUMERIC(10,2),                   -- cena sprzedaży (PLN)
  photo_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Składniki w przepisie (linie receptury)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity NUMERIC(10,4) NOT NULL,               -- ilość składnika
  unit TEXT NOT NULL DEFAULT 'kg',               -- jednostka (musi pasować do ingredient)
  notes TEXT                                     -- np. "pokrojony w kostkę"
);

-- 4. Indeksy
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);
CREATE INDEX IF NOT EXISTS idx_recipes_brand ON recipes(brand);

-- 5. Weryfikacja
SELECT 'food_cost tables created' AS status;
