<div align="center">

```
 ██╗   ██╗███████╗██████╗  █████╗
 ██║   ██║██╔════╝██╔══██╗██╔══██╗
 ██║   ██║█████╗  ██████╔╝███████║
 ╚██╗ ██╔╝██╔══╝  ██╔══██╗██╔══██║
  ╚████╔╝ ███████╗██║  ██║██║  ██║
   ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝
```

**A personal AI companion that talks with you, tracks your goals, remembers your story, and genuinely keeps you accountable.**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Groq](https://img.shields.io/badge/LLM-Groq%20%7C%20Llama%203.1-F55036?logo=meta&logoColor=white)](https://groq.com)
[![ElevenLabs](https://img.shields.io/badge/TTS-ElevenLabs-000000)](https://elevenlabs.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## What is Vera?

Vera is a full-stack AI life companion. She is not a generic chatbot that forgets you the moment you close the tab. She remembers who you are, what you are working towards, and how you have been feeling lately, and she brings all of that into every conversation.

Here is what that looks like in practice. You open the app in the morning and Vera already knows you have been trying to wake up early this week. She asks how it went. You tell her you missed it again. She does not lecture you, she sits with that for a moment and then asks what got in the way. Later in the day you can call her, literally call her using your microphone and speaker, and have a real back-and-forth conversation. She speaks back to you in a natural voice using ElevenLabs. At the end of the week she has a picture of your mood, your streaks, and what you actually talked about, and she uses all of it when she responds to you.

The difference from a regular AI assistant is that Vera accumulates context over time. Most AI tools start fresh every session. Vera builds a persistent memory from your conversations and uses it to give you responses that feel like they are coming from someone who knows you, not someone you just met.

---

## What can Vera do?

**Voice calls.** You can start a live voice call with Vera directly from the app. She listens to you through the microphone using the Web Speech API, processes your message, and speaks back using ElevenLabs TTS. The call handles silence gracefully and restarts automatically if the mic drops. You can interrupt her mid-sentence by tapping the mic button.

**Goal tracking with real accountability.** You set goals and give each one a priority tier: Locked In (things you are fully committed to), Wanting It (working towards), or Would Be Nice (low pressure). For Locked In goals, Vera tracks your daily streak, counts missed days, and sends you browser reminders at 9 AM and 8 PM if you have not checked in. She also references your goals during conversation so she can actually hold you to them.

**Mood tracking.** Each day you can log how you are feeling on a 1 to 5 scale. Vera pulls in your last 7 days of mood data when she responds to you, so if you have had a rough week she picks up on that without you having to explain it every time.

**Long-term memory.** Vera periodically summarises your older conversations and stores them as memory entries. The next time you talk she has access to those summaries, so she can reference things you told her weeks ago without the conversation history growing too long and slowing down responses.

**Multilingual support.** Vera supports 30+ languages and always replies in the language you have configured in your profile, regardless of what language you type in. Voice recognition also adjusts to your locale automatically.

**Admin dashboard.** There is a built-in admin view that shows all users, their mood trends, goal health, and flags anyone who has logged low mood several days in a row or abandoned a goal they were committed to.

---

## Features at a glance

| Feature | Details |
|---|---|
| Live voice calls | Real-time two-way voice using Web Speech API for input and ElevenLabs for spoken responses |
| Long-term memory | Older conversations are summarised and stored so Vera remembers you across sessions |
| Goal tracking | Three priority tiers with streak tracking, missed-day counters, and daily check-in nudges |
| Mood tracking | Daily mood check-ins on a 1 to 5 scale, with 7-day history fed into Vera's context |
| Push notifications | Browser reminders at 9 AM and 8 PM for Locked In goals not yet checked in |
| 30+ languages | Vera always responds in your configured language, no matter what you type in |
| Adaptive persona | Vera adjusts her tone based on your gender, warmer and nurturing for males, calm and grounding for females |
| Memory panel | View and edit everything Vera knows about you at any time |
| Conversation search | Search through all past messages by keyword |
| Progress log | Add notes to individual goals to track what you actually did |
| Chat export | Download your full conversation history as an HTML file |
| Admin dashboard | Monitor users, mood trends, goal health, and get alerts for at-risk users |
| PWA ready | Installable on desktop and mobile via service worker and web app manifest |
| Dark and light mode | System-aware theme with a manual toggle |

---

## How it works

```
┌─────────────────────────────────────────────┐
│              React Frontend                 │
│        (Vite + Tailwind CSS, port 5173)     │
│                                             │
│  ChatPage  DashboardPage  OnboardingPage    │
│  VoiceCall  GoalModal  MoodCheck  Sidebar   │
└──────────────────┬──────────────────────────┘
                   │ REST API (axios)
┌──────────────────▼──────────────────────────┐
│         Node.js / Express Backend           │
│                 (port 3001)                 │
│                                             │
│  /chat/:id    /goals    /mood    /tts       │
│  /auth        /user     /admin  /insights   │
│                                             │
│  SQLite (node:sqlite, synchronous)          │
│  JWT auth, bcryptjs, node-cron              │
└──────────────────┬──────────────────────────┘
                   │ HTTP (internal)
┌──────────────────▼──────────────────────────┐
│         Python FastAPI AI Service           │
│                 (port 8000)                 │
│                                             │
│  LLM router: Groq, OpenAI, Anthropic,      │
│  Ollama with automatic fallback             │
│                                             │
│  RAG via ChromaDB, safety checks,          │
│  memory summarisation                       │
└─────────────────────────────────────────────┘
```

---

## Tech Stack

**Frontend**
- React 18 with Vite and Tailwind CSS
- Web Speech API for continuous speech recognition with BCP-47 locale support and auto-restart on silence
- ElevenLabs TTS using `eleven_turbo_v2_5` for English and `eleven_flash_v2_5` for other languages
- PWA support via Service Worker and Web App Manifest

**Backend**
- Node.js 22 with Express
- SQLite via the built-in `node:sqlite` module, so there are no extra database dependencies to install
- JWT authentication and bcryptjs for password hashing
- `node-cron` for scheduling daily check-ins and weekly recap messages
- ElevenLabs TTS proxy with a fallback to the browser's built-in Web Speech synthesis

**AI Service (Python)**
- FastAPI with Pydantic schemas
- Groq as the primary LLM provider running `llama-3.1-8b-instant` at 500k tokens per day with no billing required for typical usage
- OpenAI, Anthropic, and Ollama as fallback providers via tenacity retry logic
- ChromaDB with sentence-transformers for retrieval-augmented generation
- Provider-agnostic router so you can switch models without touching any Node.js code

**AI and Prompt Design**
- System prompt tuned for emotional intelligence, kept to roughly 400 tokens to keep response times fast
- Voice mode enforces a 25-word response limit and mirrors the user's emotional tone
- Consecutive message deduplication before Groq API calls to prevent rejection from malformed history
- Long-term memory built by periodically summarising older conversations and storing them in a `memory_summaries` table
- Automated profile extraction that picks up your name, age, profession, gender, and life context from the first few conversations

---

## Getting started

### What you need
- Node.js 22 or higher
- Python 3.11 or higher
- A [Groq API key](https://console.groq.com) (free account, 500k tokens per day on llama-3.1-8b-instant)
- Optionally an [ElevenLabs API key](https://elevenlabs.io) if you want voice. The Starter plan is required for library voices.

### 1. Clone the repo

```bash
git clone https://github.com/mohamedibrahim26/Ai-assitant.git
cd Ai-assitant
```

### 2. Set up the backend

```bash
cd backend
cp .env.example .env
npm install
```

Open `.env` and fill in your values:

```
AI_SERVICE_URL=http://localhost:8000
PORT=3001
ELEVENLABS_API_KEY=your_key_here
```

### 3. Set up the AI service

```bash
cd ../ai-service
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS or Linux
pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and add your GROQ_API_KEY.

### 4. Run everything

On Windows, just double-click `start.bat` and it will open all three services and launch the browser.

If you prefer to run manually:

```bash
# Terminal 1
cd ai-service && python main.py

# Terminal 2
cd backend && npm run dev

# Terminal 3
cd frontend && npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## API Reference

### Chat
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/chat/:userId` | Send a message. Body: `{ message, voiceMode? }` |
| `GET` | `/chat/:userId/history` | Get message history |
| `DELETE` | `/chat/:userId/history` | Clear all messages for a user |

### Goals
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/goals/:userId` | List active goals |
| `POST` | `/goals/:userId` | Create a goal with `{ title, tier, deadline?, description? }` |
| `PATCH` | `/goals/:userId/:goalId/checkin` | Mark today's check-in for a goal |
| `PATCH` | `/goals/:userId/:goalId` | Update a goal |
| `DELETE` | `/goals/:userId/:goalId` | Archive a goal |

### Mood
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/mood/:userId` | Log a mood score from 1 to 5 |
| `GET` | `/mood/:userId` | Get mood history |

### TTS
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/tts` | Convert text to speech. Body: `{ text, language? }`. Returns `audio/mpeg`. |

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register with `{ email, password, name }` |
| `POST` | `/auth/login` | Login with `{ email, password }`, returns `{ token, userId }` |

---

## Database

```sql
users            -- id, email, password_hash, name, age, gender, profession,
                    language, life_context, personality_notes, onboarded

messages         -- id, user_id, role (user or assistant), content, created_at

goals            -- id, user_id, title, description, tier, deadline, status,
                    streak, best_streak, days_missed, last_streak_date

moods            -- id, user_id, score (1 to 5), note, created_at

memory_summaries -- id, user_id, summary, message_count, period_start, period_end

goal_progress    -- id, goal_id, user_id, note, created_at

invites          -- id, inviter_id, invitee_email, status, created_at
```

---

## Voice call pipeline

When you start a voice call, here is what happens under the hood:

```
Microphone
  -> Web Speech API (continuous speech-to-text, locale-aware)
  -> POST /chat with voiceMode: true
  -> Groq Llama 3.1 (response limited to 25 words in voice mode)
  -> POST /tts -> ElevenLabs
  -> AudioBuffer -> Speaker
```

A single AudioContext is reused for the entire call to prevent browser resource exhaustion. If Chrome's speech API gets into a bad state after extended use, the app detects repeated failures and pauses for 10 seconds to let it recover before resuming.

---

## Project structure

```
Ai-assitant/
├── frontend/                   # React + Vite
│   ├── src/
│   │   ├── pages/              # ChatPage, DashboardPage, LoginPage, OnboardingPage, AdminPage
│   │   ├── components/         # VoiceCall, GoalModal, MoodCheck, Sidebar, SearchBar, etc.
│   │   ├── hooks/              # useVoice, useNotifications
│   │   └── api.js              # Axios client
│   ├── public/                 # manifest.json, sw.js (PWA assets)
│   └── vite.config.js
│
├── backend/                    # Node.js + Express
│   ├── routes/                 # chat, goals, mood, tts, auth, user, admin, insights, etc.
│   ├── ai/
│   │   └── vera.js             # Vera's brain: prompt builder, memory, profile extraction
│   ├── scheduler.js            # node-cron jobs for daily check-ins and weekly recaps
│   ├── db.js                   # SQLite setup and schema migrations
│   └── server.js
│
├── ai-service/                 # Python FastAPI
│   ├── services/               # llm_service, rag_service, embedding_service, etc.
│   ├── models/schemas.py       # Pydantic request and response models
│   ├── config.py               # Provider config and fallback chain
│   └── main.py
│
└── start.bat                   # One-click launcher for Windows
```

---

## What is coming next

- Weekly recap every Sunday where Vera reflects on your week with you
- Progress charts showing mood trends and goal streak history over time
- AI-powered goal suggestions based on what you talk about with Vera
- Voice cloning so you can personalise Vera's voice using ElevenLabs IVC
- Mobile PWA with push notifications on iOS and Android
- Invite system so you can share Vera with friends or family


