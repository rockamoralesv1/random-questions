import { clearLegacyClientId, getLegacyClientId } from '../lib/clientId';
import type { AuthUser } from '../store/authStore';

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? fallback), { status: res.status });
  }
  return res.json();
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** The logged-in user, or null. */
export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  return json(res, 'Could not check login');
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await json<AuthUser>(
    await post('/api/auth/login', { email, password, legacyClientId: getLegacyClientId() }),
    'Login failed',
  );
  clearLegacyClientId(); // its data now belongs to the account
  return user;
}

export async function register(email: string, password: string, inviteToken?: string): Promise<AuthUser> {
  const user = await json<AuthUser>(
    await post('/api/auth/register', { email, password, inviteToken, legacyClientId: getLegacyClientId() }),
    'Sign-up failed',
  );
  clearLegacyClientId();
  return user;
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout', {});
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: number;
}

export interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  status: 'pending' | 'used' | 'expired';
}

export async function listUsers(): Promise<AdminUser[]> {
  return json(await fetch('/api/admin/users'), 'Could not load users');
}

export async function listInvitations(): Promise<Invitation[]> {
  return json(await fetch('/api/admin/invitations'), 'Could not load invitations');
}

export async function inviteUser(email: string, role: 'admin' | 'user'): Promise<Invitation> {
  return json(await post('/api/admin/invitations', { email, role }), 'Could not send invitation');
}

export async function revokeInvitation(id: string): Promise<void> {
  const res = await fetch(`/api/admin/invitations/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('Could not revoke invitation');
}
