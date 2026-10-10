import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { ownUserParam } from '../middleware/auth.js';

const router = Router();

// Every :userId route below only works for the logged-in user's own ID.
router.param('userId', ownUserParam);

// Log progress on a goal
router.post('/:userId/:goalId', (req, res) => {
  const { note, minutes } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'Note is required' });

  const goal = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?')
    .get(req.params.goalId, req.params.userId);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const id = uuidv4();
  db.prepare(
    'INSERT INTO progress_logs (id, goal_id, user_id, note, minutes) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.params.goalId, req.params.userId, note.trim(), minutes || null);

  // Also update goal's progress_notes with the latest
  db.prepare("UPDATE goals SET progress_notes = ?, last_checkin = CURRENT_DATE WHERE id = ?")
    .run(note.trim(), req.params.goalId);

  const log = db.prepare('SELECT * FROM progress_logs WHERE id = ?').get(id);
  res.json({ log });
});

// Get progress history for a goal
router.get('/:userId/:goalId', (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM progress_logs WHERE goal_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.params.goalId, req.params.userId);
  res.json({ logs });
});

export default router;
