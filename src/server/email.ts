export interface EmailDeliveryResult {
  delivered: boolean;
  provider: 'resend' | 'webhook' | 'preview';
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailDeliveryResult> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();
  const fromAddress =
    process.env.EMAIL_FROM?.trim() || 'AI QUIZ MASTER <onboarding@resend.dev>';

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.to],
          subject: params.subject,
          text: params.text,
          html: params.html,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return { delivered: true, provider: 'resend' };
      }
      console.warn('Resend email delivery returned non-OK status:', res.status);
    } catch (err) {
      console.warn('Resend email delivery failed, falling back to preview mode:', err);
    }
  }

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddress,
          to: params.to,
          subject: params.subject,
          text: params.text,
          html: params.html,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return { delivered: true, provider: 'webhook' };
      }
      console.warn('Email webhook returned non-OK status:', res.status);
    } catch (err) {
      console.warn('Email webhook delivery failed, falling back to preview mode:', err);
    }
  }

  return { delivered: false, provider: 'preview' };
}
