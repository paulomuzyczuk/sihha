import type { MetadataRoute } from 'next';

// PWA install contract: served at /manifest.webmanifest and auto-linked by
// Next. Icons are the mark-sihha sprout (design_system/icons.js) on a
// full-bleed moss-500 field, sized for maskable cropping — regenerate via
// sharp if the mark ever changes. Colors mirror globals.css tokens.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'sihha',
    short_name: 'sihha',
    description:
      'sihha — a safe space for a small care team to care for someone they love and stay in step together.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3ecdf', // --neutral-100 (app surface)
    theme_color: '#4e6151', // --moss-500
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
