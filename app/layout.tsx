import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Bitter, Figtree, IBM_Plex_Mono } from 'next/font/google';
import { I18nProvider } from '../lib/i18n/I18nProvider';
import VercelAnalytics from '../components/VercelAnalytics';

// Sihha type ramp (Grove): Bitter for display, Figtree for UI, IBM Plex Mono
// for data. tokens.css consumes these as --font-bitter/--font-figtree/
// --font-plex-mono inside --font-display/--font-body/--font-mono.
const bitter = Bitter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-bitter',
  display: 'swap',
});

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'sihha',
  description:
    'sihha — a safe space for a small care team to care for someone they love and stay in step together.',
  applicationName: 'sihha',
  appleWebApp: { capable: true, title: 'sihha', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4e6151', // --moss-500
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bitter.variable} ${figtree.variable} ${plexMono.variable}`}
    >
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
        <VercelAnalytics />
      </body>
    </html>
  );
}
