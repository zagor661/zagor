import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegistration } from './sw-register'

export const metadata: Metadata = {
  title: 'KitchenOps',
  description: 'System operacyjny restauracji WOKI WOKI',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KitchenOps',
  },
}

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
