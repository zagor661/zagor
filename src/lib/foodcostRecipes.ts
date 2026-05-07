// Default recipes extracted from WOKI_WOKI_FoodCost_UPDATED.xlsx → sheet "Potrawy"
// Prices from "Cena Sprzedaży" sheet.
// pricePerKg = Cena surowca (zł) / Masa surowca (kg)
// quantity = Masa w daniu — stored in KG (consistent with calcCost: pricePerKg * quantity)

export interface RecipeLine {
  productName: string
  pricePerKg: number   // zł/kg
  quantity: number     // kg per portion
}

export interface Recipe {
  id: string
  name: string
  category: string
  sellingPrice: number // brutto
  portions: number
  lines: RecipeLine[]
  packagingCost?: number // Box + Wyprawka per portion (optional)
}

// Packaging: Box 0.6214 zł + Wyprawka 0.6543 zł = 1.2757 zł per portion
const PKG = 1.28

function r(id: string, name: string, sellingPrice: number, lines: RecipeLine[]): Recipe {
  return { id, name, category: 'main', sellingPrice, portions: 1, lines, packagingCost: PKG }
}

// Helper: pricePerKg from batch → price / (mass_g / 1000)
function ppk(batchPrice: number, batchMassG: number): number {
  return Math.round((batchPrice / (batchMassG / 1000)) * 100) / 100
}

// Helper: grams to kg
function g(grams: number): number {
  return Math.round((grams / 1000) * 10000) / 10000
}

export const DEFAULT_RECIPES: Recipe[] = [
  r('tokio', '01 TOKIO', 47, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(1) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Mini Brokuł',               pricePerKg: ppk(23, 2500),      quantity: g(40) },
    { productName: 'Makaron Udon',              pricePerKg: ppk(2.8, 200),      quantity: g(180) },
    { productName: 'Sos Sezamowy',              pricePerKg: ppk(25.65, 1760),   quantity: g(80) },
    { productName: 'Sos Rybny',                 pricePerKg: ppk(12, 700),       quantity: g(15) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(10) },
    { productName: 'Pierś z Kury (marynat.)',   pricePerKg: ppk(119.01, 4000),  quantity: g(60) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Orzeszki Ziemne',           pricePerKg: ppk(28, 1000),      quantity: g(20) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('yokohama', '02 YOKOHAMA', 50, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(1) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Mango',                     pricePerKg: ppk(3.65, 280),     quantity: g(40) },
    { productName: 'Makaron Soba',              pricePerKg: ppk(30, 2350),      quantity: g(180) },
    { productName: 'Sos Kokosowy',              pricePerKg: ppk(26.44, 1750),   quantity: g(80) },
    { productName: 'Sos Rybny',                 pricePerKg: ppk(12, 700),       quantity: g(15) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(10) },
    { productName: 'Krewetka 16/20',            pricePerKg: ppk(46, 83),        quantity: g(5) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
    { productName: 'Limonka',                   pricePerKg: ppk(23.9, 1000),    quantity: g(25) },
  ]),

  r('osaka', '03 OSAKA', 42, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(1) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Pieczarka',                 pricePerKg: ppk(9.75, 1000),    quantity: g(40) },
    { productName: 'Makaron Sojowy',            pricePerKg: ppk(10.5, 1900),    quantity: g(180) },
    { productName: 'Sos Chilli Teriyaki',       pricePerKg: ppk(24.73, 1775),   quantity: g(80) },
    { productName: 'Sos Rybny',                 pricePerKg: ppk(12, 700),       quantity: g(15) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(10) },
    { productName: 'Pierś z Kaczki (marynat.)', pricePerKg: ppk(226.85, 4000), quantity: g(60) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Płatki Migdałów',           pricePerKg: ppk(22, 500),       quantity: g(10) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('kobe', '04 KOBE', 46, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(1) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Fasola Cięta',              pricePerKg: ppk(18, 2500),      quantity: g(40) },
    { productName: 'Makaron Ryżowy',            pricePerKg: ppk(8, 375),        quantity: g(180) },
    { productName: 'Sos Miso Teriyaki',         pricePerKg: ppk(22.38, 1820),   quantity: g(80) },
    { productName: 'Sos Rybny',                 pricePerKg: ppk(12, 700),       quantity: g(15) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(10) },
    { productName: 'Rostbef (marynowany)',       pricePerKg: ppk(225.76, 4000),  quantity: g(60) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Słonecznik Łuskany',        pricePerKg: ppk(10, 1000),      quantity: g(10) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('sapporo', '05 SAPPORO', 45, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(1) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Papryka',                   pricePerKg: ppk(14.7, 852),     quantity: g(40) },
    { productName: 'Ryż z Zalewą',             pricePerKg: ppk(37.54, 8400),   quantity: g(200) },
    { productName: 'Sos Curry',                 pricePerKg: ppk(23.5, 1000),    quantity: g(150) },
    { productName: 'Sos Rybny',                 pricePerKg: ppk(12, 700),       quantity: g(15) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(5) },
    { productName: 'Polędwiczka (marynat.)',    pricePerKg: ppk(150.45, 4000),  quantity: g(60) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Orzeszki Ziemne',           pricePerKg: ppk(28, 1000),      quantity: g(20) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('nagoja', '06 NAGOJA', 49, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(1) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Mango',                     pricePerKg: ppk(3.65, 280),     quantity: g(40) },
    { productName: 'Makaron Ramen',             pricePerKg: ppk(15, 1100),      quantity: g(180) },
    { productName: 'Sos Kokosowy',              pricePerKg: ppk(26.44, 1750),   quantity: g(80) },
    { productName: 'Sos Rybny',                 pricePerKg: ppk(12, 700),       quantity: g(15) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(5) },
    { productName: 'Pierś z Kury (marynat.)',   pricePerKg: ppk(119.01, 4000),  quantity: g(60) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Sos Mango',                 pricePerKg: ppk(11.85, 940),    quantity: g(10) },
    { productName: 'Orzechy Nerkowca',          pricePerKg: ppk(45, 1000),      quantity: g(35) },
    { productName: 'Limonka',                   pricePerKg: ppk(23.9, 1000),    quantity: g(25) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('wegetarian-san', '07 WEGETARIAN SAN', 38, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(1) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(160) },
    { productName: 'Pędy Bambusa',              pricePerKg: ppk(17, 974.12),    quantity: g(40) },
    { productName: 'Oshinko',                   pricePerKg: ppk(5.4, 250),      quantity: g(40) },
    { productName: 'Kikkoman',                  pricePerKg: ppk(190, 20000),    quantity: g(80) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(10) },
    { productName: 'Ziarna Mix',                pricePerKg: ppk(0.8, 30),       quantity: g(30) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('san-wegan', '08 SAN WEGAN', 38, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Mini Kukurydza',            pricePerKg: ppk(32.2, 950),     quantity: g(40) },
    { productName: 'Cukinia',                   pricePerKg: ppk(10.56, 833),    quantity: g(40) },
    { productName: 'Tofu',                      pricePerKg: ppk(6.8, 300),      quantity: g(60) },
    { productName: 'Makaron Sojowy',            pricePerKg: ppk(10.5, 1900),    quantity: g(180) },
    { productName: 'Sos Mango',                 pricePerKg: ppk(11.85, 940),    quantity: g(80) },
    { productName: 'Kolendra',                  pricePerKg: ppk(11.05, 1000),   quantity: g(10) },
    { productName: 'Ziarna Mix',                pricePerKg: ppk(0.8, 30),       quantity: g(30) },
    { productName: 'Szpinak',                   pricePerKg: ppk(24.35, 1000),   quantity: g(15) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('samon-san', '09 SAMON SAN', 45, [
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Łosoś',                    pricePerKg: ppk(28, 382.39),    quantity: g(60) },
    { productName: 'Por',                       pricePerKg: ppk(4.47, 538),     quantity: g(60) },
    { productName: 'Chilli',                    pricePerKg: ppk(34.95, 900),    quantity: g(20) },
    { productName: 'Teriyaki',                  pricePerKg: ppk(132.08, 12000), quantity: g(80) },
    { productName: 'Ryż z Zalewą',             pricePerKg: ppk(37.54, 8400),   quantity: g(200) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('sendai', '10 SENDAI', 42, [
    { productName: 'Udko Marynowane',           pricePerKg: ppk(34.46, 3000),   quantity: g(150) },
    { productName: 'Teriyaki',                  pricePerKg: ppk(132.08, 12000), quantity: g(80) },
    { productName: 'Ryż z Zalewą',             pricePerKg: ppk(37.54, 8400),   quantity: g(200) },
    { productName: 'Edamame',                   pricePerKg: ppk(11.99, 500),    quantity: g(30) },
    { productName: 'Por',                       pricePerKg: ppk(4.47, 538),     quantity: g(60) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(5) },
    { productName: 'Kiełki Lucerny',            pricePerKg: ppk(8.53, 250),     quantity: g(4) },
  ]),

  r('nara', '11 NARA', 40, [
    { productName: 'Udko Marynowane',           pricePerKg: ppk(34.46, 3000),   quantity: g(120) },
    { productName: 'Olej z Wkładem',           pricePerKg: ppk(24.6, 1800),    quantity: g(35) },
    { productName: 'Jajko',                     pricePerKg: ppk(0.89, 1),       quantity: g(2) },
    { productName: 'Baza Warzywna',             pricePerKg: ppk(60.9, 8000),    quantity: g(80) },
    { productName: 'Kim-Chi (gotowe)',          pricePerKg: ppk(75.44, 8402.5), quantity: g(120) },
    { productName: 'Makaron Udon',              pricePerKg: ppk(2.8, 200),      quantity: g(180) },
    { productName: 'Cebulka Dymka',             pricePerKg: ppk(12.95, 1000),   quantity: g(10) },
    { productName: 'Sezam Biały',               pricePerKg: ppk(16, 1000),      quantity: g(8) },
  ]),
]
