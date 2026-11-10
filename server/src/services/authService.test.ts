import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRepository } from '../db/memoryRepository';
import { setRepository } from '../db';
import {
  authenticate,
  createInvitation,
  hashPassword,
  inviteByEmail,
  registerWithInvitation,
  verifyPassword,
} from './authService';

describe('passwords', () => {
  it('verifies the right password only, with a fresh salt each time', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong horse', a)).toBe(false);
  });
});

describe('invitations', () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
    setRepository(repo);
  });

  it('creates the invited account (with its role) once, only with the invited email', async () => {
    const { token } = await createInvitation('Ana@Example.com', 'admin', null);

    const wrongEmail = await registerWithInvitation(token, 'someone@else.com', 'password123');
    expect(wrongEmail).toEqual({ ok: false, reason: 'invalid_invitation' });

    const ok = await registerWithInvitation(token, 'ana@example.com', 'password123');
    expect(ok.ok && ok.user.role).toBe('admin');
    expect(ok.ok && ok.user.email).toBe('ana@example.com');

    const reused = await registerWithInvitation(token, 'ana@example.com', 'password123');
    expect(reused).toEqual({ ok: false, reason: 'invalid_invitation' });

    expect(await authenticate('ANA@example.com', 'password123')).not.toBeNull();
    expect(await authenticate('ana@example.com', 'nope-nope')).toBeNull();
  });

  it('rejects expired invitations', async () => {
    const { token, invitation } = await createInvitation('old@example.com', 'user', null);
    // expire it
    const all = (repo as unknown as { invitations: Map<string, { inv: { expiresAt: number } }> }).invitations;
    for (const e of all.values()) if (e.inv) e.inv.expiresAt = Date.now() - 1;
    expect(invitation.expiresAt - invitation.createdAt).toBe(60 * 60 * 1000); // 1 hour
    expect(await registerWithInvitation(token, 'old@example.com', 'password123')).toEqual({
      ok: false,
      reason: 'invalid_invitation',
    });
  });

  it('refuses to invite in production when email is not configured', async () => {
    const env = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;
    await expect(inviteByEmail('x@example.com', 'user', null, 'https://app')).rejects.toThrow(/not configured/);
    expect(await repo.listInvitations()).toHaveLength(0);
    process.env = env;
  });
});

describe('claiming pre-login data', () => {
  it('moves banks, quizzes and stats from a personal code to the user', async () => {
    const repo = new MemoryRepository();
    setRepository(repo);
    await repo.createDocument('h'.repeat(64), 'a.pdf', ['t'], 2);
    await repo.linkClient('ABCD-EFGH-JKMN-PQRS', 'h'.repeat(64), 'a.pdf', 'owner');
    await repo.recordQuestionStat('ABCD-EFGH-JKMN-PQRS', { question: 'Q', correctAnswer: 'A', source: null, passed: false });
    await repo.recordQuestionStat('u_1', { question: 'Q', correctAnswer: 'A', source: null, passed: true });

    await repo.claimLegacyClientData('ABCD-EFGH-JKMN-PQRS', 'u_1');

    expect(await repo.getClientRole('u_1', 'h'.repeat(64))).toBe('owner');
    expect(await repo.listClientDocuments('ABCD-EFGH-JKMN-PQRS')).toHaveLength(0);
    const [stat] = await repo.listQuestionStats('u_1');
    expect([stat.attempts, stat.fails]).toEqual([2, 1]);
  });
});
