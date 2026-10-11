import { Router } from 'express';
import { suggestGoals, summarizeMemory, generateWeeklyRecap } from '../ai/vera.js';
import db from '../db.js';
import { ownUserParam } from '../middleware/auth.js';

const router = Router();

// Every :userId route below only works for the logged-in user's own ID.
router.param('userId', ownUserParam);

// GET /insights/:userId/suggest-goals — AI suggests 1-2 goals based on chat
router.get('/:userId/suggest-goals', async (req, res) => {
  try {
    const suggestions = await suggestGoals(req.params.userId);
    res.json({ suggestions });
  } catch (e) {
    console.error('Goal suggestion failed:', e.message);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// POST /insights/:userId/summarize — Manually trigger memory summarization
router.post('/:userId/summarize', async (req, res) => {
  try {
    const summary = await summarizeMemory(req.params.userId);
    res.json({ summary: summary || 'Not enough messages to summarize yet.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /insights/:userId/memories — Get stored memory summaries
router.get('/:userId/memories', (req, res) => {
  const memories = db.prepare(
    'SELECT * FROM memory_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(req.params.userId);
  res.json({ memories });
});

// POST /insights/:userId/weekly-recap — Manually trigger weekly recap
router.post('/:userId/weekly-recap', async (req, res) => {
  try {
    await generateWeeklyRecap(req.params.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
