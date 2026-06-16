import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Garden Journal',
  description: 'Personal garden journal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/garden-journal/manifest.json" />
        <meta name="theme-color" content="#4a7c59" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Garden Journal" />
        <link rel="apple-touch-icon" href="/garden-journal/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
