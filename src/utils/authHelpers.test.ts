import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFirebaseAuthError, shouldFallbackToRedirect } from './authHelpers';

test('shouldFallbackToRedirect detects popup-blocked and unsupported iframe environments', () => {
  assert.equal(shouldFallbackToRedirect({ code: 'auth/popup-blocked' }), true);
  assert.equal(
    shouldFallbackToRedirect({ code: 'auth/operation-not-supported-in-this-environment' }),
    true
  );
  assert.equal(shouldFallbackToRedirect({ code: 'auth/popup-closed-by-user' }), false);
  assert.equal(shouldFallbackToRedirect(new Error('Random failure')), false);
});

test('formatFirebaseAuthError maps unauthorized-domain and popup errors to clear messages', () => {
  const domainMsg = formatFirebaseAuthError(
    { code: 'auth/unauthorized-domain' },
    'ais-dev-example.run.app'
  );
  assert.match(domainMsg, /ais-dev-example\.run\.app/);
  assert.match(domainMsg, /Authorized domains/i);

  const cancelledMsg = formatFirebaseAuthError(
    new Error('Firebase: Error (auth/popup-closed-by-user).')
  );
  assert.match(cancelledMsg, /cancelled/i);
});
