import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerRegistration from './sw-register'
import { BASE_PATH } from '../base-path.mjs'

export const metadata: Metadata = {
  title: 'Garden Journal',
  description: 'Personal garden journal',
  manifest: BASE_PATH + '/manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4a7c59',
  interactiveWidget: 'resizes-visual',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Garden Journal" />
        <link rel="apple-touch-icon" href={BASE_PATH + '/icon-192.png'} />
      </head>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  )
}
