import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import userRoutes from './routes/user.js';
import chatRoutes from './routes/chat.js';
import goalRoutes from './routes/goals.js';
import adminRoutes from './routes/admin.js';
import moodRoutes from './routes/mood.js';
import authRoutes from './routes/auth.js';
import progressRoutes from './routes/progress.js';
import inviteRoutes from './routes/invites.js';
import insightRoutes from './routes/insights.js';
import ttsRoutes from './routes/tts.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';

const app = express();

// Railway (and most hosts) sit behind one proxy; needed for correct client IPs in rate limiting.
app.set('trust proxy', 1);

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(s => s.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '100kb' }));

// ── Rate limits ───────────────────────────────────────────────────────────────
const isTest = process.env.NODE_ENV === 'test';

// Slows down password guessing on login / register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

// Protects paid APIs (LLM, ElevenLabs) from being drained.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId, // always set: requireAuth runs first
  message: { error: 'RATE_LIMIT' },
});

// ── Public routes ─────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'Vera is alive' }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/invites', inviteRoutes); // per-route auth inside (validate is public)

// ── Logged-in routes (each router also checks :userId belongs to the caller) ──
app.use('/api/user',     requireAuth, userRoutes);
app.use('/api/chat',     requireAuth, aiLimiter, chatRoutes);
app.use('/api/goals',    requireAuth, goalRoutes);
app.use('/api/mood',     requireAuth, moodRoutes);
app.use('/api/progress', requireAuth, progressRoutes);
app.use('/api/insights', requireAuth, aiLimiter, insightRoutes);
app.use('/api/tts',      requireAuth, aiLimiter, ttsRoutes);

// ── Admin routes ──────────────────────────────────────────────────────────────
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);

export default app;
