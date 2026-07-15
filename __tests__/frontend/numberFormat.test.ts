import { parseDecimal, formatDecimal } from '../../lib/numberFormat';

describe('parseDecimal (comma or dot decimal input)', () => {
  it('accepts a comma as the decimal separator', () => {
    expect(parseDecimal('70,37')).toBe(70.37);
    expect(parseDecimal('0,5')).toBe(0.5);
  });

  it('accepts a dot as the decimal separator', () => {
    expect(parseDecimal('70.37')).toBe(70.37);
    expect(parseDecimal('42')).toBe(42);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseDecimal(' 70,37 ')).toBe(70.37);
  });

  it('rejects text, mixed separators, and thousands grouping', () => {
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1.234,56')).toBeNaN();
    expect(parseDecimal('70,3,7')).toBeNaN();
    expect(parseDecimal('70,')).toBeNaN();
    expect(parseDecimal('')).toBeNaN();
  });
});

describe('formatDecimal (locale-aware display)', () => {
  it('uses a comma for the pt locale', () => {
    expect(formatDecimal(7.5, 'pt')).toBe('7,5');
  });

  it('uses a dot for the en locale', () => {
    expect(formatDecimal(7.5, 'en')).toBe('7.5');
  });

  it('leaves integers without a separator', () => {
    expect(formatDecimal(30, 'pt')).toBe('30');
  });
});
