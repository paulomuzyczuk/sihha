import {
  INITIAL_STATE,
  applyAuthEvent,
  getTimeoutNextState,
  resolveAuthEvent,
  validatePasswordUpdate,
} from '../../app/auth/reset-password/logic';

describe('ResetPasswordPage initial state', () => {
  it('starts in loading state on mount', () => {
    expect(INITIAL_STATE).toBe('loading');
  });
});

describe('getTimeoutNextState (5-second timeout with no auth event)', () => {
  it('transitions loading → invalid when timeout fires', () => {
    expect(getTimeoutNextState('loading')).toBe('invalid');
  });

  it('leaves form state unchanged if timeout fires late', () => {
    expect(getTimeoutNextState('form')).toBe('form');
  });

  it('leaves invalid state unchanged if timeout fires after event', () => {
    expect(getTimeoutNextState('invalid')).toBe('invalid');
  });
});

describe('resolveAuthEvent (recovery and invite tokens open the form)', () => {
  it('returns form when PASSWORD_RECOVERY event fires (reset link)', () => {
    expect(resolveAuthEvent('PASSWORD_RECOVERY')).toBe('form');
  });

  it('returns form when SIGNED_IN fires (invite-link acceptance)', () => {
    expect(resolveAuthEvent('SIGNED_IN')).toBe('form');
  });

  it('returns invalid for INITIAL_SESSION event', () => {
    expect(resolveAuthEvent('INITIAL_SESSION')).toBe('invalid');
  });

  it('returns invalid for USER_UPDATED event', () => {
    expect(resolveAuthEvent('USER_UPDATED')).toBe('invalid');
  });

  it('returns invalid for SIGNED_OUT event', () => {
    expect(resolveAuthEvent('SIGNED_OUT')).toBe('invalid');
  });

  it('returns invalid for empty string', () => {
    expect(resolveAuthEvent('')).toBe('invalid');
  });
});

describe('applyAuthEvent (form state is sticky across trailing events)', () => {
  it('keeps the form when a trailing INITIAL_SESSION fires after the token event', () => {
    expect(applyAuthEvent('form', 'INITIAL_SESSION')).toBe('form');
  });

  it('keeps the form when USER_UPDATED fires after the password change', () => {
    expect(applyAuthEvent('form', 'USER_UPDATED')).toBe('form');
  });

  it('upgrades invalid to form when the token event arrives late', () => {
    expect(applyAuthEvent('invalid', 'SIGNED_IN')).toBe('form');
    expect(applyAuthEvent('invalid', 'PASSWORD_RECOVERY')).toBe('form');
  });

  it('resolves normally from the loading state', () => {
    expect(applyAuthEvent('loading', 'PASSWORD_RECOVERY')).toBe('form');
    expect(applyAuthEvent('loading', 'SIGNED_OUT')).toBe('invalid');
  });
});

describe('validatePasswordUpdate', () => {
  it('returns null for valid matching passwords of 8+ characters', () => {
    expect(validatePasswordUpdate('senhaSegura1', 'senhaSegura1')).toBeNull();
  });

  it('returns error when both fields are empty', () => {
    expect(validatePasswordUpdate('', '')).toBeTruthy();
  });

  it('returns error when new password is empty', () => {
    expect(validatePasswordUpdate('', 'senha123')).toBeTruthy();
  });

  it('returns error when confirm password is empty', () => {
    expect(validatePasswordUpdate('senha123', '')).toBeTruthy();
  });

  it('returns error when password is under 8 characters', () => {
    expect(validatePasswordUpdate('abc', 'abc')).toBeTruthy();
  });

  it('returns error when password is exactly 7 characters', () => {
    expect(validatePasswordUpdate('1234567', '1234567')).toBeTruthy();
  });

  it('returns null when password is exactly 8 characters', () => {
    expect(validatePasswordUpdate('exato123', 'exato123')).toBeNull();
  });

  it('returns error when passwords do not match', () => {
    expect(validatePasswordUpdate('senhaUm123', 'senhaDois123')).toBeTruthy();
  });

  it('validation errors are strings', () => {
    const result = validatePasswordUpdate('abc', 'xyz');
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });
});
