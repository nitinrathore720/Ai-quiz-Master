function extractFirebaseCode(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const maybeCode = (err as { code?: unknown }).code;
  if (typeof maybeCode === 'string') return maybeCode;
  const msg = err instanceof Error ? err.message : '';
  const match = msg.match(/\((auth\/[a-z0-9-]+)\)/i);
  return match ? match[1].toLowerCase() : '';
}

export function shouldFallbackToRedirect(err: unknown): boolean {
  const code = extractFirebaseCode(err);
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment'
  );
}

export function formatFirebaseAuthError(err: unknown, currentHost?: string): string {
  const code = extractFirebaseCode(err);
  const hostLabel = currentHost || 'this app domain';

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google Sign-In was cancelled before completion. Please try again or sign in with email.';
    case 'auth/popup-blocked':
      return 'Browser blocked the Google Sign-In popup. Redirecting or allow popups for this site.';
    case 'auth/unauthorized-domain':
      return `Google Sign-In is not authorized for ${hostLabel} in Firebase Auth settings yet. Please add this domain in Firebase Console -> Authentication -> Settings -> Authorized domains, or sign in with email/password.`;
    case 'auth/network-request-failed':
      return 'Network error contacting Google Authentication. Please check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Google Sign-In is not enabled in Firebase Authentication for this project.';
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'Google Sign-In could not be completed.';
  }
}
