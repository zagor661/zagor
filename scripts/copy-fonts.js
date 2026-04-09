// Pobiera/kopiuje fonty Roboto (Regular + Bold, subset latin-ext dla polskich znaków)
// do public/fonts/ — używane przez SanepidPDF do renderowania raportu HACCP.
//
// Strategia (próbuje kolejno):
//   1) Jeśli public/fonts/Roboto-*.ttf już istnieje → skip
//   2) Kopia z node_modules/@fontsource/roboto/files/ (jeśli pakiet ma TTF)
//   3) Download z Google Fonts CSS API używając starego User-Agenta (IE6),
//      który wymusza serwowanie TTF zamiast woff2.
//
// Skrypt musi być self-contained (brak deps npm) i uruchamia się na Vercel build.

const fs = require('fs')
const path = require('path')
const https = require('https')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'fonts')
const REQUIRED = [
  { weight: 400, style: 'normal', file: 'Roboto-Regular.ttf' },
  { weight: 700, style: 'normal', file: 'Roboto-Bold.ttf' },
]
const IE6_UA = 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)'

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function httpGet(url, headers = {}, maxRedirect = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      const { statusCode, headers: h } = res
      if (statusCode >= 300 && statusCode < 400 && h.location && maxRedirect > 0) {
        res.resume()
        const nextUrl = h.location.startsWith('http')
          ? h.location
          : new URL(h.location, url).toString()
        return httpGet(nextUrl, headers, maxRedirect - 1).then(resolve, reject)
      }
      if (statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${statusCode} for ${url}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')))
  })
}

function allPresent() {
  return REQUIRED.every(f => {
    const p = path.join(OUT_DIR, f.file)
    return fs.existsSync(p) && fs.statSync(p).size > 10000 // TTF > 10KB
  })
}

function tryLocalCopy() {
  const base = path.join(ROOT, 'node_modules', '@fontsource', 'roboto', 'files')
  if (!fs.existsSync(base)) return false
  const map = {
    '400-normal': 'roboto-latin-ext-400-normal.ttf',
    '700-normal': 'roboto-latin-ext-700-normal.ttf',
  }
  let copied = 0
  for (const f of REQUIRED) {
    const src = path.join(base, map[`${f.weight}-${f.style}`])
    if (!fs.existsSync(src)) continue
    fs.copyFileSync(src, path.join(OUT_DIR, f.file))
    console.log(`[fonts] ✓ kopia z node_modules: ${f.file}`)
    copied++
  }
  return copied === REQUIRED.length
}

async function tryGoogleFontsDownload() {
  console.log('[fonts] Pobieram z Google Fonts CSS API (IE6 UA → TTF)...')
  const cssUrl =
    'https://fonts.googleapis.com/css?family=Roboto:400,700&subset=latin-ext'
  const cssBuf = await httpGet(cssUrl, { 'User-Agent': IE6_UA })
  const css = cssBuf.toString('utf8')

  // Parsuj @font-face bloki
  const blocks = css.split('@font-face').slice(1)
  const ttfByWeight = {}
  for (const block of blocks) {
    const wMatch = block.match(/font-weight:\s*(\d+)/)
    const urlMatch = block.match(/url\((https?:[^)]+\.ttf)\)/)
    if (wMatch && urlMatch) {
      ttfByWeight[wMatch[1]] = urlMatch[1]
    }
  }

  if (!Object.keys(ttfByWeight).length) {
    throw new Error(
      'Nie znaleziono URL-i TTF w odpowiedzi Google Fonts. Pierwsze 300 znaków:\n' +
        css.slice(0, 300)
    )
  }

  for (const f of REQUIRED) {
    const url = ttfByWeight[String(f.weight)]
    if (!url) {
      throw new Error(`Brak URL-a TTF dla wagi ${f.weight}`)
    }
    const buf = await httpGet(url, { 'User-Agent': IE6_UA })
    fs.writeFileSync(path.join(OUT_DIR, f.file), buf)
    console.log(`[fonts] ✓ pobrano ${f.file} (${(buf.length / 1024).toFixed(1)} KB)`)
  }
}

async function main() {
  ensureDir(OUT_DIR)

  if (allPresent()) {
    console.log('[fonts] Wszystkie fonty już są w public/fonts/ — skip.')
    return
  }

  // Etap 1: kopia z node_modules (jeśli @fontsource ma TTF)
  if (tryLocalCopy() && allPresent()) {
    console.log('[fonts] Gotowe (źródło: node_modules).')
    return
  }

  // Etap 2: download z Google Fonts
  try {
    await tryGoogleFontsDownload()
    if (allPresent()) {
      console.log('[fonts] Gotowe (źródło: Google Fonts).')
      return
    }
  } catch (e) {
    console.error('[fonts] Google Fonts download failed:', e.message)
  }

  console.error('[fonts] ❌ NIE UDAŁO SIĘ przygotować fontów.')
  console.error('[fonts] Raport Sanepid PDF nie wyrenderuje polskich znaków!')
  console.error('[fonts] Fallback: ręcznie wrzuć Roboto-Regular.ttf i Roboto-Bold.ttf')
  console.error('[fonts] do public/fonts/ i zrób git commit.')
  // Nie wywalamy buildu — route.ts sam zareaguje błędem.
}

main().catch(err => {
  console.error('[fonts] Nieoczekiwany błąd:', err)
  process.exitCode = 0 // nie wywalaj builda
})
