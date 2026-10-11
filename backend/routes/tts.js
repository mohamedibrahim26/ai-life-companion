/**
 * ElevenLabs TTS — Gender-aware voices + emotion-tuned settings.
 *
 * Male users   → warm feminine voice (Rachel) — feels like the most caring woman he knows
 * Female users → warm masculine voice (Josh)  — feels like a steady, understanding man
 * Unknown      → Rachel (universal default)
 *
 * Emotion detection adjusts stability/style so the voice sounds genuinely soft
 * when comforting and bright when celebrating — not the same flat tone every time.
 */

import { Router } from 'express';
import db from '../db.js';

const router = Router();

// ── ElevenLabs Voice IDs ──────────────────────────────────────────────────────
const VOICES = {
  warm_female:      '21m00Tcm4TlvDq8ikWAM', // Rachel — warm, conversational, caring
  warm_male:        'TxGEqnHWrfWFTfGW9XjX', // Josh   — deep, calm, warm
  soft_female:      '21m00Tcm4TlvDq8ikWAM',
  deep_male:        'TxGEqnHWrfWFTfGW9XjX',
  calm_neutral:     'AZnzlk1XvdvUeBnXmlld', // Domi
  energetic_female: 'EXAVITQu4vr4xnSDxMaL', // Bella
};

// ── Emotion-tuned voice settings ─────────────────────────────────────────────
// Lower stability = more expressive natural pitch variation (sounds human, not flat)
const SETTINGS = {
  emotional: {       // Sadness, depression, anxiety → extra soft and warm
    stability:         0.32,
    similarity_boost:  0.78,
    style:             0.68,
    use_speaker_boost: true,
  },
  supportive: {      // Normal conversation, encouragement
    stability:         0.45,
    similarity_boost:  0.82,
    style:             0.52,
    use_speaker_boost: true,
  },
  energetic: {       // Wins, excitement, motivation
    stability:         0.58,
    similarity_boost:  0.85,
    style:             0.60,
    use_speaker_boost: true,
  },
};

function detectEmotion(text) {
  const lower = text.toLowerCase();
  if (/\b(sad|depress|cry|alone|lonely|hurt|pain|anxious|scared|overwhelm|lost|struggling|hard|tough|difficult|exhausted|tired|broken|failing|hopeless|worthless|stress|worry|afraid|grief|miss|low|down)\b/.test(lower)) return 'emotional';
  if (/\b(amazing|incredible|proud|wow|yes|win|achieved|nailed|love|excited|celebrate|success|awesome|congrats|happy|great job|did it)\b/.test(lower)) return 'energetic';
  return 'supportive';
}

function pickVoice(userGender, personaOverride) {
  if (personaOverride && VOICES[personaOverride]) return VOICES[personaOverride];
  if (userGender === 'female') return VOICES.warm_male;
  return VOICES.warm_female; // male / unknown / other → warm feminine
}

router.post('/speak', async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey || apiKey === 'your_key_here') {
    return res.status(503).json({ error: 'ElevenLabs not configured', useFallback: true });
  }

  const { text, persona } = req.body;
  const userId = req.userId; // from the login token, never from the request body
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });

  // Look up user gender + language for voice selection
  let userGender   = null;
  let userLanguage = 'en-US';
  if (userId) {
    try {
      const user = db.prepare('SELECT gender, language FROM users WHERE id = ?').get(userId);
      userGender   = user?.gender   || null;
      userLanguage = user?.language || 'en-US';
    } catch {}
  }

  const voiceId  = pickVoice(userGender, persona);
  const emotion  = detectEmotion(text);
  const settings = SETTINGS[emotion];

  // English → turbo v2.5 (fastest, cheapest)
  // 32 supported non-English langs → Flash v2.5 (~75ms latency, best multilingual)
  // Unsupported langs → return useFallback so browser TTS handles it
  const isEnglish = userLanguage.startsWith('en');

  // Languages NOT in ElevenLabs Flash v2.5 — falls back to browser TTS
  // (Browser TTS on Chrome/Android supports 100+ langs incl. all Indian regional)
  const ELEVEN_UNSUPPORTED = ['te', 'kn', 'ml', 'bn', 'mr', 'gu', 'pa', 'ur'];
  const langPrefix = userLanguage.split('-')[0].toLowerCase();
  if (!isEnglish && ELEVEN_UNSUPPORTED.includes(langPrefix)) {
    return res.status(200).json({ useFallback: true, reason: 'lang_unsupported' });
  }

  const modelId = isEnglish ? 'eleven_turbo_v2_5' : 'eleven_flash_v2_5';

  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n+/g, ' ')
    .slice(0, 400);

  try {
    const elResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text:           cleanText,
        model_id:       modelId,
        voice_settings: settings,
      }),
    });

    if (!elResp.ok) {
      const err = await elResp.text();
      console.error('[TTS] ElevenLabs error:', elResp.status, err);
      return res.status(502).json({ error: 'TTS service error', useFallback: true });
    }

    res.set({
      'Content-Type':      'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control':     'no-store',
    });

    const reader = elResp.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      return pump();
    };
    await pump();
  } catch (err) {
    console.error('[TTS] Error:', err);
    res.status(500).json({ error: 'TTS failed', useFallback: true });
  }
});

export default router;
