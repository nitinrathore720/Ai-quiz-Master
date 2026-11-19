import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTransactionalEmail } from './email';

test('sendTransactionalEmail falls back to preview mode when no provider env vars exist', async () => {
  const prevResend = process.env.RESEND_API_KEY;
  const prevWebhook = process.env.EMAIL_WEBHOOK_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_WEBHOOK_URL;
  try {
    const res = await sendTransactionalEmail({
      to: 'student@example.com',
      subject: 'Test',
      text: 'Code: 123456',
    });
    assert.deepEqual(res, { delivered: false, provider: 'preview' });
  } finally {
    if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend;
    if (prevWebhook !== undefined) process.env.EMAIL_WEBHOOK_URL = prevWebhook;
  }
});

test('sendTransactionalEmail delivers via Resend when RESEND_API_KEY is configured', async () => {
  const prevResend = process.env.RESEND_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 're_test_key';
  let capturedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    capturedUrl = String(input);
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
  }) as typeof fetch;

  try {
    const res = await sendTransactionalEmail({
      to: 'student@example.com',
      subject: 'Verify',
      text: 'Code: 654321',
    });
    assert.equal(capturedUrl, 'https://api.resend.com/emails');
    assert.deepEqual(res, { delivered: true, provider: 'resend' });
  } finally {
    globalThis.fetch = prevFetch;
    if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend;
    else delete process.env.RESEND_API_KEY;
  }
});
