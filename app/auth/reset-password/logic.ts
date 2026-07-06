export type ResetState = 'loading' | 'invalid' | 'form' | 'success';

export const INITIAL_STATE: ResetState = 'loading';

export function resolveAuthEvent(event: string): 'form' | 'invalid' {
  // PASSWORD_RECOVERY = reset-link token; SIGNED_IN = invite-link acceptance
  // (Supabase emits a plain SIGNED_IN for type=invite tokens, and this page is
  // the invite redirect target). Anything else means the visitor arrived
  // without a valid emailed token.
  return event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN'
    ? 'form'
    : 'invalid';
}

/**
 * State transition for auth events: once the form is shown it stays shown —
 * Supabase fires trailing events (e.g. INITIAL_SESSION) after the token event,
 * and those must not yank the form away from the user.
 */
export function applyAuthEvent(current: ResetState, event: string): ResetState {
  return current === 'form' ? 'form' : resolveAuthEvent(event);
}

export function getTimeoutNextState(current: ResetState): ResetState {
  return current === 'loading' ? 'invalid' : current;
}

export function validatePasswordUpdate(
  password: string,
  confirm: string,
): string | null {
  if (!password || !confirm) return 'Preencha os dois campos de senha.';
  if (password.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (password !== confirm) return 'As senhas não coincidem.';
  return null;
}
