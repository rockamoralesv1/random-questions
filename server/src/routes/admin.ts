import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { getRepository } from '../db';
import { appUrlFrom, inviteByEmail, normalizeEmail } from '../services/authService';
import { makeRateLimit } from '../middleware/rateLimit';

const router = Router();

const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admins only.' });
    return;
  }
  next();
};
router.use(requireAdmin);

const inviteLimit = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 30 });

// GET /api/admin/users
router.get('/users', async (_req, res, next) => {
  try {
    const users = await getRepository().listUsers();
    res.json(users.map((u) => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt })));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/invitations — status only; links are never shown.
router.get('/invitations', async (_req, res, next) => {
  try {
    const now = Date.now();
    const invitations = await getRepository().listInvitations();
    res.json(
      invitations.map((i) => ({
        ...i,
        status: i.usedAt ? 'used' : i.expiresAt <= now ? 'expired' : 'pending',
      })),
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/invitations { email, role } — emails a 1-hour, single-use link.
const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['user', 'admin']).default('user'),
});
router.post('/invitations', inviteLimit, async (req, res, next) => {
  try {
    const parsed = InviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid email.' });
      return;
    }
    const email = normalizeEmail(parsed.data.email);
    if (await getRepository().getUserByEmail(email)) {
      res.status(409).json({ error: 'That email already has an account.' });
      return;
    }
    const invitation = await inviteByEmail(email, parsed.data.role, res.locals.userId, appUrlFrom(req));
    res.status(201).json({ ...invitation, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/invitations/:id — revoke an unused invitation.
router.delete('/invitations/:id', async (req, res, next) => {
  try {
    const ok = await getRepository().deleteInvitation(String(req.params.id));
    res.status(ok ? 204 : 404).end();
  } catch (err) {
    next(err);
  }
});

export { router as adminRouter };
