import {
  displayDate,
  maskDisplayDate,
  parseDisplayDate,
  toIsoDow,
} from '../../services/dateUtils';

describe('toIsoDow — JS day (Sun=0) to ISO 8601 (Mon=0)', () => {
  it('Sunday  JS 0 → ISO 6', () => expect(toIsoDow(0)).toBe(6));
  it('Monday  JS 1 → ISO 0', () => expect(toIsoDow(1)).toBe(0));
  it('Tuesday JS 2 → ISO 1', () => expect(toIsoDow(2)).toBe(1));
  it('Wednesday JS 3 → ISO 2', () => expect(toIsoDow(3)).toBe(2));
  it('Thursday JS 4 → ISO 3', () => expect(toIsoDow(4)).toBe(3));
  it('Friday  JS 5 → ISO 4', () => expect(toIsoDow(5)).toBe(4));
  it('Saturday JS 6 → ISO 5', () => expect(toIsoDow(6)).toBe(5));
});

describe('displayDate — the dd/mm/yyyy display standard', () => {
  it('renders an ISO calendar date day-first', () =>
    expect(displayDate('2026-07-14')).toBe('14/07/2026'));
  it('keeps zero padding', () =>
    expect(displayDate('2026-01-02')).toBe('02/01/2026'));
});

describe('maskDisplayDate — progressive dd/mm/yyyy input mask', () => {
  it('inserts slashes as digits accumulate', () => {
    expect(maskDisplayDate('1')).toBe('1');
    expect(maskDisplayDate('14')).toBe('14');
    expect(maskDisplayDate('140')).toBe('14/0');
    expect(maskDisplayDate('1407')).toBe('14/07');
    expect(maskDisplayDate('14072026')).toBe('14/07/2026');
  });
  it('strips non-digits and caps the length', () => {
    expect(maskDisplayDate('14/07/2026')).toBe('14/07/2026');
    expect(maskDisplayDate('14a07b2026999')).toBe('14/07/2026');
    expect(maskDisplayDate('abc')).toBe('');
  });
});

describe('parseDisplayDate — dd/mm/yyyy to ISO with calendar validation', () => {
  it('parses a real date', () =>
    expect(parseDisplayDate('14/07/2026')).toBe('2026-07-14'));
  it('rejects impossible calendar days', () => {
    expect(parseDisplayDate('31/02/2026')).toBeNull();
    expect(parseDisplayDate('00/01/2026')).toBeNull();
    expect(parseDisplayDate('15/13/2026')).toBeNull();
  });
  it('rejects incomplete or malformed text', () => {
    expect(parseDisplayDate('14/07/26')).toBeNull();
    expect(parseDisplayDate('14/07')).toBeNull();
    expect(parseDisplayDate('2026-07-14')).toBeNull();
  });
});
