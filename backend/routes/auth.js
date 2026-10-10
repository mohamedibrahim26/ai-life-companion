import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken, publicUser, requireAuth, isAdmin } from '../middleware/auth.js';

const router = Router();
const makeToken = signToken;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (!EMAIL_RE.test(email.trim()) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Account already exists with this email' });

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();

  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, onboarded) VALUES (?, ?, ?, ?, 0)'
  ).run(userId, email.toLowerCase().trim(), passwordHash,
        typeof name === 'string' ? name.trim().slice(0, 100) || null : null);

  const token = makeToken(userId);
  const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({ token, user: publicUser(user) });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = makeToken(user.id);
  res.json({ token, user: publicUser(user) });
});

// Get current user from token
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), isAdmin: isAdmin(req.user) });
});

export default router;
