import { Router } from 'express';
import { verifyCredentials, requireAuth } from '../lib/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = verifyCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.user = user;
  res.json({ user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('rm.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({ user: req.session?.user || null });
});

// quick auth probe used by the client guard
router.get('/check', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

export default router;
