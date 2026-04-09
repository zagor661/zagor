// Kopiuje fonty Roboto z node_modules do public/fonts/
// żeby Next.js na Vercel miał je w bundlu lambdy (public/ jest zawsze w deploy)
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'node_modules', '@fontsource', 'roboto', 'files')
const dst = path.join(__dirname, '..', 'public', 'fonts')

const files = [
  'roboto-latin-ext-400-normal.ttf',
  'roboto-latin-ext-700-normal.ttf',
]

if (!fs.existsSync(src)) {
  console.log('[copy-fonts] node_modules/@fontsource/roboto nie istnieje (npm install jeszcze nie zakończony?). Skip.')
  process.exit(0)
}

if (!fs.existsSync(dst)) {
  fs.mkdirSync(dst, { recursive: true })
}

let ok = 0
let fail = 0
for (const f of files) {
  const srcFile = path.join(src, f)
  const dstFile = path.join(dst, f)
  if (!fs.existsSync(srcFile)) {
    console.error(`[copy-fonts] BRAK ŹRÓDŁA: ${srcFile}`)
    fail++
    continue
  }
  fs.copyFileSync(srcFile, dstFile)
  console.log(`[copy-fonts] ✓ ${f}`)
  ok++
}

console.log(`[copy-fonts] Skopiowano ${ok}/${files.length} plików do public/fonts/`)
if (fail > 0) {
  console.error(`[copy-fonts] UWAGA: ${fail} plików się nie skopiowało — PDF Sanepid nie będzie renderował polskich znaków!`)
}
