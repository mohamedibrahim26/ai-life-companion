import { Router } from 'express';
import db from '../db.js';
import { publicUser } from '../middleware/auth.js';

const router = Router();

// ── Overview stats ────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const totalUsers    = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const onboarded     = db.prepare('SELECT COUNT(*) as n FROM users WHERE onboarded = 1').get().n;
  const totalMessages = db.prepare('SELECT COUNT(*) as n FROM messages').get().n;
  const totalGoals    = db.prepare('SELECT COUNT(*) as n FROM goals').get().n;
  const activeGoals   = db.prepare("SELECT COUNT(*) as n FROM goals WHERE status = 'active'").get().n;
  const completedGoals= db.prepare("SELECT COUNT(*) as n FROM goals WHERE status = 'completed'").get().n;

  const lockedIn    = db.prepare("SELECT COUNT(*) as n FROM goals WHERE tier = 'locked_in' AND status = 'active'").get().n;
  const wantingIt   = db.prepare("SELECT COUNT(*) as n FROM goals WHERE tier = 'wanting_it' AND status = 'active'").get().n;
  const wouldBeNice = db.prepare("SELECT COUNT(*) as n FROM goals WHERE tier = 'would_be_nice' AND status = 'active'").get().n;

  const todayMessages = db.prepare(
    "SELECT COUNT(*) as n FROM messages WHERE date(created_at) = date('now')"
  ).get().n;

  res.json({
    users: { total: totalUsers, onboarded },
    messages: { total: totalMessages, today: todayMessages },
    goals: {
      total: totalGoals,
      active: activeGoals,
      completed: completedGoals,
      byTier: { locked_in: lockedIn, wanting_it: wantingIt, would_be_nice: wouldBeNice }
    }
  });
});

// ── All users with summary counts ─────────────────────────────────────────────
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT
      u.*,
      COUNT(DISTINCT g.id)  AS goal_count,
      COUNT(DISTINCT m.id)  AS message_count,
      MAX(m.created_at)     AS last_active
    FROM users u
    LEFT JOIN goals    g ON g.user_id = u.id AND g.status = 'active'
    LEFT JOIN messages m ON m.user_id = u.id
    GROUP BY u.id
    ORDER BY last_active DESC NULLS LAST
  `).all();

  res.json({ users: users.map(publicUser) });
});

// ── Single user detail — profile + goals + recent messages ────────────────────
router.get('/users/:userId', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const goals = db.prepare(
    'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.params.userId);

  const messages = db.prepare(
    'SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.params.userId).reverse();

  const stats = db.prepare(`
    SELECT
      COUNT(CASE WHEN role = 'user' THEN 1 END)      AS user_messages,
      COUNT(CASE WHEN role = 'assistant' THEN 1 END)  AS vera_messages,
      MIN(created_at)                                  AS first_message,
      MAX(created_at)                                  AS last_message
    FROM messages WHERE user_id = ?
  `).get(req.params.userId);

  res.json({ user: publicUser(user), goals, messages, stats });
});

// ── All goals across all users ────────────────────────────────────────────────
router.get('/goals', (req, res) => {
  const goals = db.prepare(`
    SELECT g.*, u.name AS user_name
    FROM goals g
    LEFT JOIN users u ON u.id = g.user_id
    ORDER BY g.created_at DESC
  `).all();

  res.json({ goals });
});

// ── Recent activity feed ──────────────────────────────────────────────────────
router.get('/activity', (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, u.name AS user_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC
    LIMIT 100
  `).all();

  res.json({ messages });
});

// ── Alerts — at-risk users ────────────────────────────────────────────────────
router.get('/alerts', (req, res) => {
  // Users with mood ≤ 2 in last 3 days
  const lowMoodUsers = db.prepare(`
    SELECT u.id, u.name, u.email,
           AVG(m.score) as avg_mood,
           COUNT(m.id) as mood_count,
           MIN(m.score) as min_mood
    FROM users u
    JOIN moods m ON m.user_id = u.id
    WHERE m.created_at >= datetime('now', '-3 days')
    GROUP BY u.id
    HAVING avg_mood <= 2
    ORDER BY avg_mood ASC
  `).all();

  // Goals with no activity for 7+ days (Locked In only)
  const abandonedGoals = db.prepare(`
    SELECT g.*, u.name as user_name, u.email as user_email
    FROM goals g
    JOIN users u ON u.id = g.user_id
    WHERE g.tier = 'locked_in'
      AND g.status = 'active'
      AND (g.last_checkin IS NULL OR g.last_checkin < date('now', '-7 days'))
    ORDER BY g.created_at ASC
  `).all();

  // Users with no messages in last 7 days (churning)
  const inactiveUsers = db.prepare(`
    SELECT u.id, u.name, u.email,
           MAX(m.created_at) as last_active
    FROM users u
    LEFT JOIN messages m ON m.user_id = u.id
    GROUP BY u.id
    HAVING last_active IS NULL OR last_active < datetime('now', '-7 days')
    ORDER BY last_active ASC
    LIMIT 20
  `).all();

  res.json({ lowMoodUsers, abandonedGoals, inactiveUsers });
});

// ── Clear all messages for a user (or all users) ─────────────────────────────
router.delete('/messages', (req, res) => {
  const { userId } = req.query;
  if (userId) {
    const result = db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId);
    res.json({ deleted: result.changes, userId });
  } else {
    const result = db.prepare('DELETE FROM messages').run();
    res.json({ deleted: result.changes });
  }
});

export default router;
