// Sends transactional email through Resend's HTTP API (https://resend.com).
// Kept behind this one function so another provider can be swapped in.
//   RESEND_API_KEY — API key
//   EMAIL_FROM     — verified sender, e.g. "Random Questions <no-reply@yourdomain.com>"

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<void> {
  if (!emailConfigured()) throw new Error('Email is not configured (RESEND_API_KEY / EMAIL_FROM).');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email provider error ${res.status}: ${detail.slice(0, 200)}`);
  }
}
