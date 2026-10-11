import { Router } from 'express';
import db from '../db.js';
import { ownUserParam, publicUser } from '../middleware/auth.js';

const router = Router();

router.param('userId', ownUserParam);

// Returns the logged-in user. Anonymous accounts were removed: before, anyone
// could pass any userId here and get that user's full profile back.
router.post('/init', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Get user profile
router.get('/:userId', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

// Update user profile
router.patch('/:userId', (req, res) => {
  const { name, age, profession, family_status, life_context, personality_notes, onboarded, gender, language } = req.body;

  // Cap field length so one request can't store megabytes in a profile.
  const toVal = v => (v == null ? null : String(v).slice(0, 2000));

  db.prepare(`
    UPDATE users SET
      name              = COALESCE(?, name),
      age               = COALESCE(?, age),
      profession        = COALESCE(?, profession),
      family_status     = COALESCE(?, family_status),
      life_context      = COALESCE(?, life_context),
      personality_notes = COALESCE(?, personality_notes),
      gender            = COALESCE(?, gender),
      language          = COALESCE(?, language)
    WHERE id = ?
  `).run(toVal(name), toVal(age), toVal(profession), toVal(family_status),
         toVal(life_context), toVal(personality_notes),
         toVal(gender), toVal(language),
         req.params.userId);

  if (onboarded != null) {
    db.prepare('UPDATE users SET onboarded = ? WHERE id = ?')
      .run(onboarded ? 1 : 0, req.params.userId);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  res.json({ user: publicUser(user) });
});

// Export everything stored about the user (GDPR right of access).
router.get('/:userId/export', (req, res) => {
  const id = req.params.userId;
  const data = {
    exported_at: new Date().toISOString(),
    user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    messages: db.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at').all(id),
    goals: db.prepare('SELECT * FROM goals WHERE user_id = ?').all(id),
    progress_logs: db.prepare('SELECT * FROM progress_logs WHERE user_id = ?').all(id),
    moods: db.prepare('SELECT * FROM moods WHERE user_id = ?').all(id),
    memory_summaries: db.prepare('SELECT * FROM memory_summaries WHERE user_id = ?').all(id),
    invites: db.prepare('SELECT * FROM invites WHERE user_id = ?').all(id),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="vera-data-export.json"');
  res.json(data);
});

// Permanently delete the account and all data (GDPR right to erasure).
router.delete('/:userId', (req, res) => {
  const id = req.params.userId;
  db.exec('BEGIN');
  try {
    for (const table of ['messages', 'progress_logs', 'goals', 'moods', 'memory_summaries', 'invites']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Account deletion failed:', err.message);
    return res.status(500).json({ error: 'Could not delete account' });
  }
  res.json({ deleted: true });
});

export default router;
