declare const process: any;
declare function fetch(input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ ok: boolean; text(): Promise<string> }>;

import { getPool } from './db.js';

interface EmailInput {
  toEmail: string;
  emailType: 'verification' | 'welcome' | 'payment_success' | 'payment_failed' | 'support_received';
  subject: string;
  payload?: Record<string, unknown> | null;
}

export async function sendProductEmail(input: EmailInput) {
  const pool = getPool();

  const deliveryUrl = process.env.EMAIL_PROVIDER_WEBHOOK_URL || '';
  let status: 'queued' | 'sent' | 'failed' = 'queued';
  let providerResponse: string | null = null;

  if (deliveryUrl) {
    try {
      const response = await fetch(deliveryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: input.toEmail,
          subject: input.subject,
          template: input.emailType,
          payload: input.payload ?? {},
          from: process.env.EMAIL_FROM || 'noreply@zonforge.com',
        }),
      });

      providerResponse = await response.text();
      status = response.ok ? 'sent' : 'failed';
    } catch (error) {
      providerResponse = (error as Error).message;
      status = 'failed';
    }
  } else {
    status = 'queued';
    providerResponse = 'EMAIL_PROVIDER_WEBHOOK_URL not configured; recorded only';
  }

  await pool.query(
    `INSERT INTO email_events (
      to_email,
      email_type,
      subject,
      status,
      payload_json,
      provider_response
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.toEmail,
      input.emailType,
      input.subject,
      status,
      input.payload ? JSON.stringify(input.payload) : null,
      providerResponse,
    ],
  );

  return { status, providerResponse };
}
