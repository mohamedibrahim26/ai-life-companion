import { Router } from 'express';
import db from '../db.js';
import { ownUserParam } from '../middleware/auth.js';
import { chat } from '../ai/vera.js';

const router = Router();

// Every :userId route below only works for the logged-in user's own ID.
router.param('userId', ownUserParam);

// Get message history
router.get('/:userId', (req, res) => {
  const messages = db.prepare(
    'SELECT * FROM messages WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.params.userId);
  res.json({ messages });
});

// Send a message
router.post('/:userId', async (req, res) => {
  const { message, voiceMode } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const raw = message.trim();

    // Silent system triggers — don't save the trigger message itself to history
    const isInit         = raw === '__vera_init__';
    const isVoiceGreet   = raw.startsWith('__voice_greet__');
    const isDailyCheckin = raw.startsWith('__daily_checkin__');

    let actualMessage = raw;
    if (isInit) {
      actualMessage = 'Please greet me warmly and naturally to start our first conversation. Introduce yourself briefly and ask me one opening question to get to know me.';
    } else if (isVoiceGreet) {
      actualMessage = raw.replace('__voice_greet__', '').trim();
    } else if (isDailyCheckin) {
      actualMessage = raw.replace('__daily_checkin__', '').trim();
    }

    const isVoice   = !!voiceMode || isVoiceGreet;
    // Only __vera_init__ truly suppresses saving a user message (nothing real to save).
    // Voice greet and daily checkin must still save a short marker on the user side so
    // DB history always alternates roles — Groq rejects back-to-back assistant messages.
    const dbUserMessage = isVoiceGreet ? '[Voice call]' : isDailyCheckin ? '[Daily check-in]' : null;
    const reply = await chat(req.params.userId, actualMessage, isInit, isVoice, dbUserMessage);
    res.json({ reply });
  } catch (err) {
    if (err.isRateLimit) {
      console.warn('Groq rate limit hit — returning 429 to client');
      return res.status(429).json({ error: 'RATE_LIMIT', message: "I've hit my hourly limit — give me a minute and try again!" });
    }
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Vera is having a moment. Try again.' });
  }
});

// Search messages
router.get('/:userId/search', (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json({ messages: [] });

  const messages = db.prepare(
    "SELECT * FROM messages WHERE user_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 30"
  ).all(req.params.userId, `%${q}%`);
  res.json({ messages });
});

// Clear chat history (dev helper)
router.delete('/:userId', (req, res) => {
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(req.params.userId);
  res.json({ ok: true });
});

export default router;
