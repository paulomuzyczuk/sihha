import './globals.css';
import type { Metadata } from 'next';
import { I18nProvider } from '../lib/i18n/I18nProvider';

export const metadata: Metadata = {
  title: 'Caretaking Platform',
  description:
    '中央介護システム — Caretaking Platform for Medication, Financials, and Behavior tracking.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
