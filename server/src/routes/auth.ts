import { Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  endLoginSession,
  registerUser,
  registerWithInvitation,
  signupsEnabled,
  startLoginSession,
  userForToken,
} from '../services/authService';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../middleware/auth';
import { authGlobalLimit, authIpLimit } from '../middleware/rateLimit';
import { getRepository } from '../db';

const router = Router();

// Personal code from before login existed (XXXX-XXXX-XXXX-XXXX or similar).
// User IDs start with "u_", which this pattern can't match, so a user's data
// can never be claimed through it.
const LEGACY_CLIENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
  /** Optional: the browser's old personal code, to move its data to the account. */
  legacyClientId: z.string().regex(LEGACY_CLIENT_ID_RE).optional(),
});

async function claimLegacy(legacyClientId: string | undefined, userId: string) {
  if (legacyClientId) await getRepository().claimLegacyClientData(legacyClientId, userId);
}

// POST /api/auth/register { email, password, inviteToken?, legacyClientId? }
// With an invitation (the normal way): creates that invitation's account, if
// the email typed matches the one it was sent to. Without one: only when
// SIGNUPS_ENABLED=true.
const RegisterSchema = CredentialsSchema.extend({
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).optional(),
});

router.post('/register', authIpLimit, authGlobalLimit, async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters.' });
      return;
    }
    const { email, password, inviteToken, legacyClientId } = parsed.data;

    let user;
    if (inviteToken) {
      const result = await registerWithInvitation(inviteToken, email, password);
      if (!result.ok) {
        res.status(result.reason === 'email_taken' ? 409 : 400).json({
          error:
            result.reason === 'email_taken'
              ? 'That email is already registered. Log in instead.'
              : 'This invitation is invalid or expired, or it was sent to a different email.',
        });
        return;
      }
      user = result.user;
    } else {
      if (!signupsEnabled()) {
        res.status(403).json({ error: 'Sign-up is by invitation only.' });
        return;
      }
      user = await registerUser(email, password);
      if (!user) {
        res.status(409).json({ error: 'That email is already registered. Log in instead.' });
        return;
      }
    }

    await claimLegacy(legacyClientId, user.id);
    setSessionCookie(req, res, await startLoginSession(user.id));
    res.status(201).json({ email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login { email, password, legacyClientId? }
router.post('/login', authIpLimit, authGlobalLimit, async (req, res, next) => {
  try {
    const parsed = CredentialsSchema.safeParse(req.body);
    const user = parsed.success ? await authenticate(parsed.data.email, parsed.data.password) : null;
    if (!parsed.success || !user) {
      // Same message for unknown email and wrong password.
      res.status(401).json({ error: 'Wrong email or password.' });
      return;
    }
    await claimLegacy(parsed.data.legacyClientId, user.id);
    setSessionCookie(req, res, await startLoginSession(user.id));
    res.json({ email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const token = readSessionToken(req);
    if (token) await endLoginSession(token);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — who is logged in (401 if nobody).
router.get('/me', async (req, res, next) => {
  try {
    const token = readSessionToken(req);
    const user = token ? await userForToken(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Not logged in', signupsEnabled: signupsEnabled() });
      return;
    }
    res.json({ email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
