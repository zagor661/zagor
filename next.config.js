/** @type {import('next').NextConfig} */
module.exports = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Wymuszamy włączenie plików fontów do bundla lambdy Vercel
  // żeby SanepidPDF mógł odczytać TTF runtime przez fs
  experimental: {
    outputFileTracingIncludes: {
      '/api/sanepid/generate': [
        './public/fonts/**/*',
        './node_modules/@fontsource/roboto/files/roboto-latin-ext-400-normal.ttf',
        './node_modules/@fontsource/roboto/files/roboto-latin-ext-700-normal.ttf',
      ],
    },
  },
}
