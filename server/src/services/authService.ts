import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from 'crypto';
import { getRepository, type InvitationRow, type UserRow, type UserRole } from '../db';
import { emailConfigured, sendEmail } from './emailService';

// scrypt parameters (OWASP minimum is N=2^17,r=8,p=1 ≈ 128 MiB; N=2^15 keeps
// memory at ~32 MiB per hash, which suits a small Heroku dyno).
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions;
const KEY_LEN = 64;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = 'rq_session';
// Invitation magic links: single use, expire after 1 hour, and only work
// together with the email address they were sent to.
export const INVITATION_TTL_MS = 60 * 60 * 1000; // 1 hour

function scryptAsync(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash" (base64url), so parameters can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64url'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Verified against when the email doesn't exist, so a login takes the same
// time either way and doesn't reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const newUserId = () => `u_${randomUUID()}`;

/** Open sign-up (only when SIGNUPS_ENABLED=true). Null if the email exists. */
export async function registerUser(email: string, password: string): Promise<UserRow | null> {
  const user: UserRow = {
    id: newUserId(),
    email: normalizeEmail(email),
    passwordHash: await hashPassword(password),
    role: 'user',
    createdAt: Date.now(),
  };
  return (await getRepository().createUser(user)) ? user : null;
}

/** Creates a one-time sign-up link token for `email` (only its hash is stored). */
export async function createInvitation(
  email: string,
  role: UserRole,
  invitedBy: string | null,
): Promise<{ token: string; invitation: InvitationRow }> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const invitation: InvitationRow = {
    id: randomUUID(),
    email: normalizeEmail(email),
    role,
    invitedBy,
    createdAt: now,
    expiresAt: now + INVITATION_TTL_MS,
    usedAt: null,
  };
  await getRepository().createInvitation(invitation, sha256(token));
  return { token, invitation };
}

export async function getPendingInvitation(token: string): Promise<InvitationRow | null> {
  return getRepository().getPendingInvitation(sha256(token));
}

export type InvitedSignupResult =
  | { ok: true; user: UserRow }
  | { ok: false; reason: 'invalid_invitation' | 'email_taken' };

/**
 * Creates the account an invitation is for (its email and role), once. The
 * person must also type the email it was sent to, so a forwarded or leaked
 * link alone isn't enough; a mismatch doesn't use up the invitation.
 */
export async function registerWithInvitation(
  token: string,
  email: string,
  password: string,
): Promise<InvitedSignupResult> {
  const repo = getRepository();
  const userId = newUserId();
  const tokenHash = sha256(token);
  const pending = await repo.getPendingInvitation(tokenHash);
  if (!pending || pending.email !== normalizeEmail(email)) return { ok: false, reason: 'invalid_invitation' };
  const invitation = await repo.consumeInvitation(tokenHash, userId); // atomic: one use only
  if (!invitation) return { ok: false, reason: 'invalid_invitation' };
  const user: UserRow = {
    id: userId,
    email: invitation.email,
    passwordHash: await hashPassword(password),
    role: invitation.role,
    createdAt: Date.now(),
  };
  if (!(await repo.createUser(user))) {
    await repo.releaseInvitation(tokenHash);
    return { ok: false, reason: 'email_taken' };
  }
  return { ok: true, user };
}

export async function authenticate(email: string, password: string): Promise<UserRow | null> {
  const user = await getRepository().getUserByEmail(normalizeEmail(email));
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

/** Creates a login session; returns the cookie token (only its hash is stored). */
export async function startLoginSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await getRepository().createLoginSession(sha256(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

export async function userForToken(token: string): Promise<UserRow | null> {
  return getRepository().getUserByLoginSession(sha256(token));
}

export async function endLoginSession(token: string): Promise<void> {
  await getRepository().deleteLoginSession(sha256(token));
}

/** Open sign-up without an invitation. Off unless SIGNUPS_ENABLED=true. */
export function signupsEnabled(): boolean {
  const v = (process.env.SIGNUPS_ENABLED ?? 'false').trim().toLowerCase();
  return ['true', '1', 'on', 'yes'].includes(v);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Creates an invitation and emails its magic link to the invited address. The
 * link is never returned to the inviter. Without email configured, it is only
 * printed to the server console outside production (for local development).
 */
export async function inviteByEmail(
  email: string,
  role: UserRole,
  invitedBy: string | null,
  appUrl: string,
): Promise<InvitationRow> {
  if (!emailConfigured() && process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('Email is not configured on the server (RESEND_API_KEY / EMAIL_FROM).'), {
      status: 503,
      expose: true,
    });
  }
  const { token, invitation } = await createInvitation(email, role, invitedBy);
  const link = `${appUrl.replace(/\/+$/, '')}/?invite=${encodeURIComponent(token)}`;

  if (!emailConfigured()) {
    console.warn(`[invite] email not configured — dev link for ${invitation.email}: ${link}`);
    return invitation;
  }
  const text =
    `Te invitaron a Random Questions.\n\n` +
    `Crea tu cuenta con este enlace (vence en 1 hora y solo funciona una vez):\n${link}\n\n` +
    `Al abrirlo tendrás que escribir este correo (${invitation.email}). No compartas este enlace.\n` +
    `Si no esperabas esta invitación, ignora este correo.`;
  const html =
    `<p>Te invitaron a <strong>Random Questions</strong>.</p>` +
    `<p><a href="${escapeHtml(link)}">Crear mi cuenta</a></p>` +
    `<p>El enlace vence en <strong>1 hora</strong> y solo funciona una vez. ` +
    `Al abrirlo tendrás que escribir este correo (${escapeHtml(invitation.email)}). No lo compartas.</p>` +
    `<p style="color:#888">Si no esperabas esta invitación, ignora este correo.</p>`;
  try {
    await sendEmail({ to: invitation.email, subject: 'Tu invitación a Random Questions', text, html });
  } catch (err) {
    await getRepository().deleteInvitation(invitation.id); // don't leave an undeliverable invite
    console.error('[invite] email failed:', err);
    throw Object.assign(new Error('The invitation email could not be sent. Please try again.'), {
      status: 502,
      expose: true,
    });
  }
  return invitation;
}

/** Base URL for links in emails: APP_URL, else the URL of the current request. */
export function appUrlFrom(req: { protocol: string; get(name: string): string | undefined }): string {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}
