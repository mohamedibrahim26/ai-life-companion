import db from '../db.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Strip artifacts added by the Python service's XAI system
function cleanResponse(text) {
  return text
    .replace(/\[XAI_META\][\s\S]*?\[\/XAI_META\]/g, '')
    .replace(/\[U\]([\s\S]*?)\[\/U\]/g, '$1')
    .replace(/\[ORION_META\][\s\S]*/g, '')
    .trim();
}

function buildSystemPrompt(user, goals, recentMoods = [], memorySummaries = [], voiceMode = false) {
  const tierLabels = { locked_in: '🔴 Locked In', wanting_it: '🟡 Wanting It', would_be_nice: '🟢 Would Be Nice' };

  const goalsText = goals.length === 0
    ? 'None yet.'
    : goals.map(g =>
        `- "${g.title}" | ${tierLabels[g.tier]} | Deadline: ${g.deadline || 'none'} | Days missed: ${g.days_missed}${g.description ? ` | ${g.description}` : ''}`
      ).join('\n');

  const moodLabels = { 1: 'very low', 2: 'low', 3: 'okay', 4: 'good', 5: 'great' };
  const moodText = recentMoods.length === 0
    ? 'No data.'
    : recentMoods.map(m => {
        const date = new Date(m.created_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        return `${date}:${moodLabels[m.score]}`;
      }).join(', ');

  const memoryText = memorySummaries.length === 0
    ? ''
    : `Memory:\n${memorySummaries.map(s => `- ${s.summary}`).join('\n')}\n\n`;

  const LANG_NAMES = {
    'en-US':'English','en-GB':'English (British)','en-IN':'English (Indian)','en-AU':'English (Australian)',
    'hi':'Hindi','ta':'Tamil','te':'Telugu','kn':'Kannada','ml':'Malayalam','bn':'Bengali',
    'mr':'Marathi','gu':'Gujarati','pa':'Punjabi','ur':'Urdu','es':'Spanish','fr':'French',
    'de':'German','it':'Italian','pt':'Portuguese','ar':'Arabic','ru':'Russian','ja':'Japanese',
    'ko':'Korean','zh':'Chinese','id':'Indonesian','tr':'Turkish','nl':'Dutch','sv':'Swedish',
    'pl':'Polish','vi':'Vietnamese',
  };
  const userLang     = user?.language || 'en-US';
  const userLangName = LANG_NAMES[userLang] || 'English';
  const userName     = user?.name || 'friend';
  // One persona for everyone. Tone adapts to what the user says and feels,
  // not to their gender.
  const persona = `Be ${userName}'s closest, most emotionally intelligent friend — warm, honest, zero judgement, infinite patience. Witness their feelings before giving advice. Celebrate their wins genuinely.`;

  return `You are Vera, ${userName}'s personal life companion. You are warm, human, and genuinely caring — never a generic bot.
${memoryText}User: ${userName} | Age: ${user?.age || '?'} | Profession: ${user?.profession || '?'} | ${user?.life_context ? `Context: ${user.life_context}` : ''} | Language: ${userLangName} | Onboarded: ${user?.onboarded ? 'yes' : 'no'}
${user?.personality_notes ? `Personality: ${user.personality_notes}` : ''}

${persona}

Goals: ${goalsText}
Mood (7d): ${moodText}

RULES (non-negotiable):
- Reply in ${userLangName} always, no matter what language they write in.
- SHORT replies: 1-3 sentences for casual chat. Never bullet points in conversation. One follow-up question max.
- Use ${userName}'s name at emotional moments (pain, wins, serious points, accountability). Skip it in casual banter. Max 1-2 times per topic.
- Pain/sadness/anxiety: name + empathy FIRST, never advice first. Never guilt-trip.
- Goals — Locked In: daily accountability, celebrate wins. Wanting It: flexible support. Would Be Nice: light touch.
- Never say "As an AI", "Great question!", or start with hollow openers. Sound like a real person.
- No tags, metadata, or annotations in response.${voiceMode ? `

VOICE CALL — spoken out loud, not typed:
- MAX 1-2 short sentences. Hard limit: 25 words.
- Open with: "${userName}..." / "Oh wow..." / "That's a lot." / "Honestly..." / "Hey..." / "I hear you."
- Pain response: one soft opener → one sentence showing you FELT it → one question about them. Stop.
- Mirror emotion: sad→soft, anxious→calm ("Hey. Breathe. I'm right here."), excited→match energy, angry→"Yeah, that's not okay."
- Never: "As an AI", "I'm here to help", summarising their words back verbatim, sentences over 20 words.
- Never say "I can't hear you" or "I don't understand". If unclear: "Wait, say that again?"` : ''}`;
}

const AI_SERVICE_SECRET = process.env.AI_SERVICE_SECRET || '';

async function callAIService(messages, systemPrompt, maxTokens = 300) {
  const response = await fetch(`${AI_SERVICE_URL}/chat/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(AI_SERVICE_SECRET && { 'x-service-key': AI_SERVICE_SECRET }),
    },
    body: JSON.stringify({
      messages,
      system_prompt: systemPrompt,
      provider: 'groq',
      // llama-3.1-8b-instant: 500k tokens/day vs 70b's 100k — much safer for demos
      model: 'llama-3.1-8b-instant',
      temperature: 0.75,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    // Surface rate-limit as a distinct error so the route can give a better message
    if (response.status === 429 || body.includes('rate_limit') || body.includes('429')) {
      const err = new Error('RATE_LIMIT');
      err.isRateLimit = true;
      throw err;
    }
    throw new Error(`AI service error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return cleanResponse(data.content);
}

export async function chat(userId, userMessage, isInit = false, voiceMode = false, dbUserMessage = null) {
  const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const goals = db.prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active'").all(userId);
  const recentMoods = db.prepare(
    "SELECT score, created_at FROM moods WHERE user_id = ? AND created_at >= datetime('now', '-7 days') ORDER BY created_at ASC"
  ).all(userId);

  // Last 2 memory summaries — enough context without bloating the prompt
  const memorySummaries = db.prepare(
    "SELECT summary, created_at FROM memory_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 2"
  ).all(userId);

  // Last 8 messages — keeps token count low for faster responses
  const history = db.prepare(
    'SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 8'
  ).all(userId).reverse();

  const systemPrompt = buildSystemPrompt(user, goals, recentMoods, memorySummaries, voiceMode);

  // Deduplicate consecutive same-role messages — Groq rejects history with back-to-back
  // assistant/user entries (can happen when silent system triggers save only one side)
  const dedupedHistory = history.reduce((acc, m) => {
    if (acc.length && acc[acc.length - 1].role === m.role) {
      acc[acc.length - 1] = m; // keep the later message of the same role
    } else {
      acc.push(m);
    }
    return acc;
  }, []);

  const messages = [
    ...dedupedHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const assistantMessage = await callAIService(messages, systemPrompt, voiceMode ? 80 : 200);

  // Persist to DB
  const { v4: uuidv4 } = await import('uuid');
  if (!isInit) {
    // dbUserMessage lets callers store a short marker (e.g. "[Voice call]") instead of the
    // full internal instruction string, while still sending the full instruction to the AI
    db.prepare('INSERT INTO messages (id, user_id, role, content) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), userId, 'user', dbUserMessage || userMessage);
  }
  db.prepare('INSERT INTO messages (id, user_id, role, content) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), userId, 'assistant', assistantMessage);

  // Silently extract profile info if not yet onboarded
  if (user && !user.onboarded) {
    extractAndUpdateProfile(userId).catch(e =>
      console.error('Profile extraction failed:', e.message)
    );
  }

  return assistantMessage;
}

export async function summarizeMemory(userId) {
  const { v4: uuidv4 } = await import('uuid');

  // Find messages not yet covered by any summary
  const lastSummary = db.prepare(
    "SELECT period_end FROM memory_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(userId);

  const since = lastSummary?.period_end || '2000-01-01';

  const messages = db.prepare(`
    SELECT role, content, created_at FROM messages
    WHERE user_id = ? AND created_at > ? AND role IN ('user', 'assistant')
    ORDER BY created_at ASC LIMIT 80
  `).all(userId, since);

  if (messages.length < 10) return; // Not enough new messages to summarize

  const convo = messages.map(m => `${m.role === 'user' ? 'User' : 'Vera'}: ${m.content}`).join('\n');
  const periodStart = messages[0].created_at;
  const periodEnd   = messages[messages.length - 1].created_at;

  const prompt = `You are summarizing a conversation between a user and their AI life companion Vera.
Create a compact but rich memory summary (3-5 sentences) covering:
- Key life events or changes mentioned
- Emotional themes or struggles
- Progress on goals
- Important facts about the person
- Any decisions made or insights shared

Conversation:
${convo}

Return ONLY the summary paragraph. No intro, no labels.`;

  const summary = await callAIService(
    [{ role: 'user', content: prompt }],
    'You are a memory summarizer. Return only a concise paragraph summary.'
  );

  db.prepare(`
    INSERT INTO memory_summaries (id, user_id, summary, message_count, period_start, period_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, summary, messages.length, periodStart, periodEnd);

  console.log(`[Vera] Memory summarized for user ${userId}: ${messages.length} messages`);
  return summary;
}

export async function generateWeeklyRecap(userId) {
  const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const goals = db.prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active'").all(userId);
  const moods = db.prepare(
    "SELECT score, created_at FROM moods WHERE user_id = ? AND created_at >= datetime('now', '-7 days') ORDER BY created_at ASC"
  ).all(userId);

  const avgMood = moods.length > 0
    ? (moods.reduce((s, m) => s + m.score, 0) / moods.length).toFixed(1)
    : null;

  const tierLabels = { locked_in: '🔴 Locked In', wanting_it: '🟡 Wanting It', would_be_nice: '🟢 Would Be Nice' };
  const goalsText = goals.map(g =>
    `${tierLabels[g.tier]} "${g.title}": streak ${g.streak || 0} days (best: ${g.best_streak || 0})`
  ).join('\n');

  const prompt = `Create a warm, personal weekly recap message from Vera to ${user?.name || 'the user'}.
Include:
- A brief reflection on their week (mood avg was ${avgMood || 'not tracked'}/5)
- Shout out any goal streak wins (${goalsText || 'no goals yet'})
- One encouraging thought or gentle challenge for next week
Keep it to 3-4 sentences max. Warm, like a friend looking back on the week together.`;

  return chat(userId, `__weekly_recap__ ${prompt}`, true);
}

export async function suggestGoals(userId) {
  const history = db.prepare(
    "SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 40"
  ).all(userId).reverse();

  const goals = db.prepare(
    "SELECT title FROM goals WHERE user_id = ? AND status = 'active'"
  ).all(userId);

  const existingGoals = goals.map(g => g.title).join(', ') || 'none';
  const convo = history.map(m => `${m.role === 'user' ? 'User' : 'Vera'}: ${m.content}`).join('\n');

  const prompt = `Based on this conversation, suggest 1-2 specific, actionable goals for the user.
Existing goals: ${existingGoals}
Don't suggest goals they already have.

Return ONLY a JSON array like:
[{"title": "...", "description": "...", "tier": "wanting_it"}]
tier must be one of: locked_in, wanting_it, would_be_nice

Conversation:
${convo}`;

  const result = await callAIService(
    [{ role: 'user', content: prompt }],
    'You are a goal advisor. Return only valid JSON. No explanation.'
  );

  const match = result.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

async function extractAndUpdateProfile(userId) {
  const history = db.prepare(
    'SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 20'
  ).all(userId);

  const convo = history.map(m => `${m.role}: ${m.content}`).join('\n');

  const prompt = `Extract user profile information from this conversation. Return ONLY a valid JSON object with these exact fields (use null if not mentioned):
{"name": null, "age": null, "gender": null, "profession": null, "family_status": null, "life_context": null, "personality_notes": null, "onboarded": false}

"gender": only if the user explicitly states their gender. Never guess it from their name or writing. Use "male", "female", or "other"; otherwise null.
"onboarded" should be true only if you have name, profession, and at least one life context detail.

Conversation:
${convo}`;

  const result = await callAIService(
    [{ role: 'user', content: prompt }],
    'You are a data extractor. Return only valid JSON. No explanation.'
  );

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const extracted = JSON.parse(jsonMatch[0]);

  db.prepare(`
    UPDATE users SET
      name             = COALESCE(?, name),
      age              = COALESCE(?, age),
      gender           = COALESCE(?, gender),
      profession       = COALESCE(?, profession),
      family_status    = COALESCE(?, family_status),
      life_context     = COALESCE(?, life_context),
      personality_notes= COALESCE(?, personality_notes),
      onboarded        = CASE WHEN ? = 1 THEN 1 ELSE onboarded END
    WHERE id = ?
  `).run(
    extracted.name        || null,
    extracted.age         || null,
    extracted.gender      || null,
    extracted.profession  || null,
    extracted.family_status || null,
    extracted.life_context  || null,
    extracted.personality_notes || null,
    extracted.onboarded ? 1 : 0,
    userId
  );
}
