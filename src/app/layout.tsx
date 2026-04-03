import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'KitchenOps',
  description: 'System kuchni restauracji',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  )
}
