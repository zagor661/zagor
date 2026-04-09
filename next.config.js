/** @type {import('next').NextConfig} */
module.exports = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Wymuszamy włączenie plików fontów do bundla lambdy Vercel,
  // żeby SanepidPDF mógł odczytać TTF runtime przez fs.
  experimental: {
    outputFileTracingIncludes: {
      '/api/sanepid/generate': [
        './public/fonts/Roboto-Regular.ttf',
        './public/fonts/Roboto-Bold.ttf',
      ],
    },
  },
}
