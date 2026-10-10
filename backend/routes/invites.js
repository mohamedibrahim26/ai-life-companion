import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth, ownUserParam } from '../middleware/auth.js';

const router = Router();

// Everything except checking an invite code needs a logged-in user.
// (Runs before router.param below, so req.userId is set when it checks.)
router.use((req, res, next) =>
  req.method === 'GET' && req.path.startsWith('/validate/') ? next() : requireAuth(req, res, next));

router.param('userId', ownUserParam);

// Unambiguous characters only (no 0/O, 1/I). Uses a secure random source.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newInviteCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

// Generate an invite code for a user
router.post('/:userId/generate', (req, res) => {
  const { userId } = req.params;
  const code = newInviteCode();

  db.prepare(
    'INSERT INTO invites (id, user_id, code) VALUES (?, ?, ?)'
  ).run(uuidv4(), userId, code);

  res.json({ code, link: `${req.headers.origin || 'http://localhost:5173'}/?invite=${code}` });
});

// Get all invites for a user
router.get('/:userId', (req, res) => {
  const invites = db.prepare(
    'SELECT * FROM invites WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.params.userId);
  res.json({ invites });
});

// Validate an invite code (called on registration)
router.get('/validate/:code', (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(req.params.code);
  if (!invite) return res.status(404).json({ valid: false, error: 'Invalid invite code' });
  if (invite.used_by) return res.status(400).json({ valid: false, error: 'Invite already used' });
  // Only confirm the code is valid; don't leak who created it.
  res.json({ valid: true });
});

// Mark invite as used
router.post('/use/:code', (req, res) => {
  const usedBy = req.userId;
  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(req.params.code);
  if (!invite) return res.status(404).json({ error: 'Invalid invite code' });
  if (invite.used_by) return res.status(400).json({ error: 'Invite already used' });

  db.prepare(
    "UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE code = ?"
  ).run(usedBy, req.params.code);

  res.json({ ok: true });
});

export default router;
