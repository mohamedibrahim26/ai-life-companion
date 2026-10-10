import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { ownUserParam } from '../middleware/auth.js';

const router = Router();

// Every :userId route below only works for the logged-in user's own ID.
router.param('userId', ownUserParam);

// Get all goals for user
router.get('/:userId', (req, res) => {
  const goals = db.prepare(
    "SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC"
  ).all(req.params.userId);
  res.json({ goals });
});

// Create a goal
router.post('/:userId', (req, res) => {
  const { title, description, tier, deadline } = req.body;
  if (!title || !tier) return res.status(400).json({ error: 'Title and tier required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO goals (id, user_id, title, description, tier, deadline)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.userId, title, description || null, tier, deadline || null);

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  res.json({ goal });
});

// Update a goal
router.patch('/:userId/:goalId', (req, res) => {
  const { title, description, tier, deadline, status, progress_notes, days_missed } = req.body;

  db.prepare(`
    UPDATE goals SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      tier = COALESCE(?, tier),
      deadline = COALESCE(?, deadline),
      status = COALESCE(?, status),
      progress_notes = COALESCE(?, progress_notes),
      days_missed = COALESCE(?, days_missed),
      last_checkin = CURRENT_DATE
    WHERE id = ? AND user_id = ?
  `).run(title, description, tier, deadline, status, progress_notes, days_missed,
         req.params.goalId, req.params.userId);

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.goalId);
  res.json({ goal });
});

// Check-in on a goal (increments streak)
router.post('/:userId/:goalId/checkin', (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
    .get(req.params.goalId, req.params.userId);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const today = new Date().toISOString().split('T')[0];
  const lastDate = goal.last_streak_date;

  let newStreak = goal.streak || 0;

  if (lastDate === today) {
    // Already checked in today — no change
  } else if (lastDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    newStreak = lastDate === yesterdayStr ? newStreak + 1 : 1;
  } else {
    newStreak = 1;
  }

  const newBest = Math.max(newStreak, goal.best_streak || 0);

  db.prepare(`
    UPDATE goals SET
      streak = ?,
      best_streak = ?,
      last_streak_date = ?,
      last_checkin = CURRENT_DATE
    WHERE id = ? AND user_id = ?
  `).run(newStreak, newBest, today, req.params.goalId, req.params.userId);

  const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.goalId);
  res.json({ goal: updated });
});

// Delete a goal
router.delete('/:userId/:goalId', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?')
    .run(req.params.goalId, req.params.userId);
  res.json({ ok: true });
});

export default router;
