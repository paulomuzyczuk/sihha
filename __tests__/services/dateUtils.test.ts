import { toIsoDow } from '../../services/dateUtils';

describe('toIsoDow — JS day (Sun=0) to ISO 8601 (Mon=0)', () => {
  it('Sunday  JS 0 → ISO 6', () => expect(toIsoDow(0)).toBe(6));
  it('Monday  JS 1 → ISO 0', () => expect(toIsoDow(1)).toBe(0));
  it('Tuesday JS 2 → ISO 1', () => expect(toIsoDow(2)).toBe(1));
  it('Wednesday JS 3 → ISO 2', () => expect(toIsoDow(3)).toBe(2));
  it('Thursday JS 4 → ISO 3', () => expect(toIsoDow(4)).toBe(3));
  it('Friday  JS 5 → ISO 4', () => expect(toIsoDow(5)).toBe(4));
  it('Saturday JS 6 → ISO 5', () => expect(toIsoDow(6)).toBe(5));
});
