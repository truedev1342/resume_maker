// Authentication: exactly 3 hardcoded accounts, no signup, no database.
// huy is an admin; tony and phan are regular users.
import crypto from 'node:crypto';

const SHARED_PASSWORD = 'qwe123QWE!@#';

// Stored as salted SHA-256 so the plaintext isn't sitting in memory comparisons.
function hash(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

const SALT = 'resume-maker-static-salt-v1';

const ACCOUNTS = [
  { id: 'huy', username: 'huy', role: 'admin', name: 'Huy' },
  { id: 'tony', username: 'tony', role: 'user', name: 'Tony' },
  { id: 'phan', username: 'phan', role: 'user', name: 'Phan' },
].map((a) => ({ ...a, passwordHash: hash(SHARED_PASSWORD, SALT) }));

export function verifyCredentials(username, password) {
  const account = ACCOUNTS.find(
    (a) => a.username.toLowerCase() === String(username || '').trim().toLowerCase()
  );
  if (!account) return null;
  const candidate = hash(String(password || ''), SALT);
  // constant-time comparison
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(account.passwordHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return publicUser(account);
}

export function publicUser(account) {
  if (!account) return null;
  const { id, username, role, name } = account;
  return { id, username, role, name, isAdmin: role === 'admin' };
}

export function listAccounts() {
  return ACCOUNTS.map(publicUser);
}

export function getAccount(id) {
  return publicUser(ACCOUNTS.find((a) => a.id === id));
}

// ── Express middleware ────────────────────────────────────────────────────────
export function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
}

export function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
}
