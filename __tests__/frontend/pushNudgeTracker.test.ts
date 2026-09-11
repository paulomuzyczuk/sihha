import {
  recordInteraction,
  getInteractionCount,
  resetInteractionCount,
  nudgeShownInMonth,
  markPushNudgeShown,
  PUSH_NUDGE_INTERACTION_THRESHOLD,
  KeyValueStorage,
} from '../../components/pushNudgeTracker';

function fakeStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe('recordInteraction / getInteractionCount', () => {
  it('counts each interaction and returns the running total', () => {
    const s = fakeStorage();
    expect(recordInteraction(s)).toBe(1);
    expect(recordInteraction(s)).toBe(2);
    expect(getInteractionCount(s)).toBe(2);
  });

  it('reaches the nudge threshold after 5 interactions', () => {
    const s = fakeStorage();
    let last = 0;
    for (let i = 0; i < PUSH_NUDGE_INTERACTION_THRESHOLD; i++) {
      last = recordInteraction(s);
    }
    expect(last).toBe(PUSH_NUDGE_INTERACTION_THRESHOLD);
  });

  it('resets the counter to zero so the next month starts fresh', () => {
    const s = fakeStorage();
    recordInteraction(s);
    recordInteraction(s);
    resetInteractionCount(s);
    expect(getInteractionCount(s)).toBe(0);
    expect(recordInteraction(s)).toBe(1);
  });

  it('tolerates corrupted or absent counter content', () => {
    const s = fakeStorage();
    expect(getInteractionCount(s)).toBe(0);
    s.setItem('sihha.pushNudge.interactions', 'not a number');
    expect(getInteractionCount(s)).toBe(0);
    expect(recordInteraction(s)).toBe(1);
  });
});

describe('monthly cap (nudgeShownInMonth / markPushNudgeShown)', () => {
  it('defaults to not shown for the month', () => {
    expect(nudgeShownInMonth(fakeStorage(), '2026-07')).toBe(false);
  });

  it('marks the nudge shown only for the month it fired', () => {
    const s = fakeStorage();
    markPushNudgeShown(s, '2026-07');
    expect(nudgeShownInMonth(s, '2026-07')).toBe(true);
    // A new calendar month is eligible again
    expect(nudgeShownInMonth(s, '2026-08')).toBe(false);
  });
});
