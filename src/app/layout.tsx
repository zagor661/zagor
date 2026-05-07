import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegistration } from './sw-register'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'KitchenOps',
  description: 'System operacyjny Twojej restauracji',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KitchenOps',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
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
      <body className="bg-stone-50 text-gray-900 min-h-screen pb-20">
        {children}
        <BottomNav />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
