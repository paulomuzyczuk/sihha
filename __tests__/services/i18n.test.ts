import {
  DICTIONARIES,
  en,
  LOCALES,
  pt,
  translate,
} from '../../lib/i18n/dictionaries';

describe('i18n dictionaries', () => {
  it('en mirrors pt key for key (no missing or extra keys)', () => {
    const ptKeys = Object.keys(pt).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(ptKeys);
  });

  it('has no empty translations in any locale', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
        expect(`${locale}:${key}:${value.trim() === '' ? 'EMPTY' : 'ok'}`).toBe(
          `${locale}:${key}:ok`,
        );
      }
    }
  });

  it('keeps interpolation tokens consistent between locales', () => {
    const tokensOf = (template: string) =>
      (template.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(pt) as Array<keyof typeof pt>) {
      expect({ key, tokens: tokensOf(en[key]) }).toEqual({
        key,
        tokens: tokensOf(pt[key]),
      });
    }
  });
});

describe('translate', () => {
  it('resolves keys per locale', () => {
    expect(translate('pt', 'common.signOut')).toBe('Sair');
    expect(translate('en', 'common.signOut')).toBe('Sign out');
  });

  it('interpolates {name} tokens', () => {
    expect(translate('en', 'invite.sent', { email: 'a@b.com' })).toBe(
      'Invite sent to a@b.com.',
    );
    expect(translate('pt', 'notes.label', { count: 42 })).toBe(
      'Observações (42/1000)',
    );
  });

  it('leaves literal braces untouched when no matching var exists', () => {
    // The JSON example inside this label must survive interpolation
    expect(translate('en', 'metric.configLabel')).toContain(
      '{"min": 0, "max": 10}',
    );
    expect(translate('en', 'metric.configLabel', { unrelated: 'x' })).toContain(
      '{"min": 0, "max": 10}',
    );
  });
});
