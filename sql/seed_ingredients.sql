-- ============================================================
-- SEED: Składniki z WOKI WOKI Food Cost
-- Wyciągnięte z WOKI_WOKI_FoodCost_UPDATED.xlsx
-- Ceny w PLN za kg (null = do uzupełnienia)
-- ============================================================

INSERT INTO ingredients (name, unit, price_per_unit, category) VALUES
-- Makarony / Ryż
('Makaron Udon', 'kg', 14.00, 'makarony'),
('Makaron Soba', 'kg', 12.77, 'makarony'),
('Makaron Sojowy', 'kg', 5.53, 'makarony'),
('Makaron Ryżowy', 'kg', 21.33, 'makarony'),
('Makaron Ramen', 'kg', 13.64, 'makarony'),
('Ryż', 'kg', 0.00, 'makarony'),

-- Mięso
('Pierś z Kurczaka', 'kg', 23.32, 'mieso'),
('Udko z Kury', 'kg', 9.61, 'mieso'),
('Pierś z Kaczki', 'kg', 52.37, 'mieso'),
('Rostbef Wołowy', 'kg', 58.59, 'mieso'),
('Polędwiczka Wieprzowa', 'kg', 31.55, 'mieso'),

-- Ryby / Owoce morza
('Łosoś', 'kg', 73.22, 'owoce_morza'),
('Krewetka 16/20', 'kg', 0.00, 'owoce_morza'),

-- Warzywa
('Marchewka', 'kg', 3.25, 'warzywa'),
('Cebula Czerwona', 'kg', 6.29, 'warzywa'),
('Por', 'kg', 13.14, 'warzywa'),
('Pieczarka', 'kg', 0.00, 'warzywa'),
('Papryka', 'kg', 31.03, 'warzywa'),
('Mango', 'kg', 13.04, 'warzywa'),
('Cukinia', 'kg', 14.77, 'warzywa'),
('Szpinak Baby', 'kg', 0.00, 'warzywa'),
('Kolendra', 'kg', 12.56, 'warzywa'),
('Cebulka Dymka', 'kg', 0.00, 'warzywa'),
('Limonka', 'kg', 0.00, 'warzywa'),
('Imbir', 'kg', 25.06, 'warzywa'),
('Czosnek', 'kg', 22.06, 'warzywa'),
('Papryczka Chilli', 'kg', 38.83, 'warzywa'),
('Pędy Bambusa', 'kg', 20.40, 'warzywa'),
('Mini Kukurydza', 'kg', 5.24, 'warzywa'),
('Mini Brokuł', 'kg', 0.00, 'warzywa'),
('Fasola Cięta', 'kg', 0.00, 'warzywa'),
('Kiełki F.Mung', 'kg', 0.00, 'warzywa'),
('Kiełki Lucerny', 'kg', 0.00, 'warzywa'),
('Pak-Choi', 'kg', 30.53, 'warzywa'),
('Ananas Puszka', 'kg', 19.42, 'warzywa'),
('Jabłko', 'kg', 0.00, 'warzywa'),
('Banany', 'kg', 0.00, 'warzywa'),
('Edamame', 'kg', 23.98, 'warzywa'),

-- Azjatyckie (sosy/pasty/przyprawy)
('Kikkoman', 'l', 0.00, 'sosy'),
('Mirin', 'l', 0.00, 'sosy'),
('Suehiro', 'l', 0.00, 'sosy'),
('Sriracha Zielona', 'l', 0.00, 'sosy'),
('Sos Rybny', 'l', 0.00, 'sosy'),
('Pasta Tom-Ka', 'kg', 0.00, 'sosy'),
('Pasta Curry Zielona', 'kg', 0.00, 'sosy'),
('Pasta Miso Jasna', 'kg', 0.00, 'sosy'),
('Pasta Gochujang', 'kg', 0.00, 'sosy'),
('Gochugaru', 'kg', 0.00, 'sosy'),
('Oshinko', 'kg', 21.60, 'sosy'),
('Tofu', 'kg', 0.00, 'sosy'),
('Tahini', 'kg', 0.00, 'sosy'),
('Olej Sezamowy', 'l', 0.00, 'sosy'),
('Mleko Kokosowe', 'l', 0.00, 'sosy'),
('Tempura', 'kg', 0.00, 'sosy'),
('Kim-Chi (gotowe)', 'kg', 0.00, 'sosy'),
('Matcha', 'kg', 0.00, 'sosy'),
('Dashi', 'kg', 0.00, 'sosy'),
('Wakame', 'kg', 0.00, 'sosy'),

-- Przyprawy / Orzechy / Nasiona
('Sezam Biały', 'kg', 0.00, 'suche'),
('Sezam Czarny', 'kg', 0.00, 'suche'),
('Orzeszki Ziemne', 'kg', 0.00, 'suche'),
('Orzech Nerkowca', 'kg', 0.00, 'suche'),
('Słonecznik Łuskany', 'kg', 0.00, 'suche'),
('Płatki Migdałów', 'kg', 0.00, 'suche'),
('Pestki Dyni', 'kg', 0.00, 'suche'),
('Tymianek', 'kg', 0.00, 'suche'),
('Rozmaryn', 'kg', 0.00, 'suche'),
('Mięta', 'kg', 0.00, 'suche'),

-- Inne
('Sok Pomarańczowy', 'l', 0.00, 'napoje'),
('Olej', 'l', 0.00, 'inne'),
('Cukier', 'kg', 0.00, 'inne'),
('Jajka K1', 'szt', 0.00, 'inne'),
('Mąka', 'kg', 0.00, 'inne'),
('Sól', 'kg', 0.00, 'inne'),
('Woda Niegazowana', 'l', 0.00, 'napoje'),
('Pulpa Mango', 'kg', 0.00, 'inne'),
('Magia (Ajinomoto)', 'kg', 0.00, 'inne'),
('Worki Wakum', 'szt', 0.00, 'opakowania'),

-- Opakowania
('Box', 'szt', 0.00, 'opakowania'),
('Torba Papierowa', 'szt', 0.00, 'opakowania'),
('Pałeczki', 'szt', 0.00, 'opakowania'),
('Serwetka Box', 'szt', 0.00, 'opakowania'),
('Widelczyk', 'szt', 0.00, 'opakowania'),
('Łyżki', 'szt', 0.00, 'opakowania'),
('Miso opakowanie', 'szt', 0.00, 'opakowania'),
('Zupa opakowanie', 'szt', 0.00, 'opakowania')

ON CONFLICT DO NOTHING;

-- Weryfikacja
SELECT category, COUNT(*) as count FROM ingredients GROUP BY category ORDER BY category;
