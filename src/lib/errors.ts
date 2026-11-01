const GENERIC_FAILURE = 'Something went wrong. Please try again.';

export function getUserMessage(cause: unknown, fallback = GENERIC_FAILURE): string {
  console.error(cause);
  return fallback;
}

export function getAuthMessage(cause: unknown): string {
  console.error(cause);
  const text = cause instanceof Error ? cause.message.toLowerCase() : '';
  if (text.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (text.includes('password should be at least')) return 'Your password does not meet the minimum length.';
  if (text.includes('rate limit') || text.includes('too many')) return 'Too many attempts. Wait a moment and try again.';
  if (text.includes('already registered') || text.includes('already exists')) {
    return 'We could not create that account. Try signing in or use a different email.';
  }
  return GENERIC_FAILURE;
}
