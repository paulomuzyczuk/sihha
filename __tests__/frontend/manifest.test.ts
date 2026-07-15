import { existsSync } from 'fs';
import { join } from 'path';
import manifest from '../../app/manifest';

// Guards the PWA install contract: Chromium requires a manifest with a
// name, standalone display, a start URL and 192/512 icons before it
// offers installation. If any of this drifts, the app silently stops
// being installable — no build error, no runtime error.
describe('web app manifest (installability)', () => {
  const m = manifest();

  it('carries the fields Chromium requires to offer installation', () => {
    expect(m.name).toBe('sihha');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    const sizes = m.icons?.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons?.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('declares brand colors from the Grove tokens', () => {
    expect(m.theme_color).toBe('#4e6151'); // --moss-500
    expect(m.background_color).toBe('#f3ecdf'); // --neutral-100
  });

  it('points at icon files that actually exist', () => {
    const publicDir = join(__dirname, '../../public');
    for (const icon of m.icons ?? []) {
      expect(existsSync(join(publicDir, icon.src))).toBe(true);
    }
    // Next's file conventions: favicon + apple-touch-icon
    expect(existsSync(join(__dirname, '../../app/icon.png'))).toBe(true);
    expect(existsSync(join(__dirname, '../../app/apple-icon.png'))).toBe(true);
  });
});
