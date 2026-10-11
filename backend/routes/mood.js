import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { ownUserParam } from '../middleware/auth.js';

const router = Router();

// Every :userId route below only works for the logged-in user's own ID.
router.param('userId', ownUserParam);

// Log a mood entry
router.post('/:userId', (req, res) => {
  const { score, note } = req.body;
  if (!score || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Score must be 1-5' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const id = uuidv4();
  db.prepare('INSERT INTO moods (id, user_id, score, note) VALUES (?, ?, ?, ?)')
    .run(id, req.params.userId, score, note || null);

  res.json({ ok: true, id });
});

// Get today's mood (so we know whether to show the picker)
router.get('/:userId/today', (req, res) => {
  const mood = db.prepare(
    "SELECT * FROM moods WHERE user_id = ? AND date(created_at) = date('now') ORDER BY created_at DESC LIMIT 1"
  ).get(req.params.userId);
  res.json({ mood: mood || null });
});

// Get last 7 days of moods
router.get('/:userId/week', (req, res) => {
  const moods = db.prepare(
    "SELECT * FROM moods WHERE user_id = ? AND created_at >= datetime('now', '-7 days') ORDER BY created_at ASC"
  ).all(req.params.userId);
  res.json({ moods });
});

export default router;
