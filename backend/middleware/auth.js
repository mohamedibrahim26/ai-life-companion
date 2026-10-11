import jwt from 'jsonwebtoken';
import db from '../db.js';

// ── Config ────────────────────────────────────────────────────────────────────
// The server refuses to start without a real secret. A hard-coded fallback
// would let anyone who reads the source code forge a login token.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET must be set to a random string of at least 32 characters. ' +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

export const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
}

// Fields that must never leave the server.
const PRIVATE_FIELDS = ['password_hash'];

export function publicUser(user) {
  if (!user) return user;
  const copy = { ...user };
  for (const f of PRIVATE_FIELDS) delete copy[f];
  return copy;
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

// ── Middleware ────────────────────────────────────────────────────────────────

// Verifies the Bearer token and attaches the user to req.user / req.userId.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
  if (!user) return res.status(401).json({ error: 'User no longer exists' });

  req.user = user;
  req.userId = user.id;
  next();
}

// Blocks access when the :userId in the URL is not the logged-in user.
// Prevents one user from reading or changing another user's data (IDOR).
export function requireSelf(req, res, next) {
  if (req.params.userId !== req.userId) {
    return res.status(403).json({ error: 'You can only access your own data' });
  }
  next();
}

// Same check, in the shape Express expects for router.param('userId', ...).
// Registering it on a router protects every route on it that has :userId.
export function ownUserParam(req, res, next, id) {
  if (id !== req.userId) {
    return res.status(403).json({ error: 'You can only access your own data' });
  }
  next();
}

// Admin = logged-in user whose email is listed in ADMIN_EMAILS.
export function requireAdmin(req, res, next) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function isAdmin(user) {
  const email = (user?.email || '').toLowerCase();
  return !!email && adminEmails().includes(email);
}
