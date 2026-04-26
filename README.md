# ◈ SkillSense — AI Skill Assessment Agent

> Built by Vishrut Sharma · [Live Demo](#) · [Demo Video](#)

---

## What it does

A résumé tells you what someone *claims* to know — not how well they actually know it.

**SkillSense** is an agentic AI interviewer named **Aria** that takes a Job Description and a candidate's résumé, conversationally assesses real proficiency on each required skill, identifies gaps, and generates a personalised learning plan focused on what the candidate can realistically acquire.

1. **Parses** the JD + résumé to extract and prioritise required skills
2. **Converses** with the candidate — 3 adaptive questions per skill, calibrated to their claimed experience level
3. **Detects low confidence** in real time — hedging language triggers deeper follow-up probing
4. **Scores** each skill 0–10 with rationale, strengths, and critical gaps
5. **Generates** a personalised learning plan with real resources, weekly schedule, 30-day milestones, and interview tips

---

## Features

- 🎙 **Voice input** — speak your answers natively in Chrome
- 🤖 **Named AI persona** — Aria, a warm but incisive senior engineer interviewer
- 📊 **Live radar chart** — skill scores animate as the assessment progresses
- 🗺 **Skill dependency graph** — shows which skills build on which in real time
- 🟢 **Confidence detection** — detects hedging language and probes deeper automatically
- 📋 **Full report** — readiness %, hiring recommendation, learning roadmap, weekly schedule, milestones, interview tips

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    SkillSense Agent                  │
│                                                      │
│  Phase 1: Skill Extraction                           │
│  ├─ Parse JD → required skills (priority ranked)     │
│  └─ Map résumé claims + evidence per skill           │
│                                                      │
│  Phase 2: Conversational Assessment (per skill)      │
│  ├─ Q1: Opening question calibrated to claim level   │
│  ├─ Q2: Follow-up based on actual answer             │
│  ├─ Q3: Probing (deeper if low confidence detected)  │
│  └─ Confidence detector: hedge words → flag          │
│                                                      │
│  Phase 3: Skill Scoring                              │
│  ├─ 0–10 score from full Q&A transcript              │
│  ├─ Level: novice / beginner / intermediate /        │
│  │         advanced / expert                         │
│  ├─ Strengths + critical gaps                        │
│  └─ Adjacent skills to explore                       │
│                                                      │
│  Phase 4: Learning Plan Generation                   │
│  ├─ Gap severity ranking                             │
│  ├─ Per-skill: current → target score                │
│  ├─ Weekly hour estimate + total weeks               │
│  ├─ Real resource URLs (free first)                  │
│  ├─ Weekly AM/PM schedule                            │
│  ├─ 30-day verifiable milestones                     │
│  └─ Interview tips specific to gaps                  │
└──────────────────────────────────────────────────────┘
```

**State machine:**
`LANDING → EXTRACTING → BRIEFING → ASSESSING ↔ SCORING → ANALYZING → REPORT`

**Tech stack:**

| Layer | Tool |
|-------|------|
| UI | React 18 + Vite |
| AI | Groq — Llama 3.3 70B (`llama-3.3-70b-versatile`) |
| Voice | Web Speech API (browser native) |
| Visualisation | Pure SVG — no chart library |
| Deployment | Vercel |

---

## Scoring Logic

### Skill proficiency score (0–10)

Each skill is scored by the AI after 3 Q&A exchanges:

| Range | Level | Meaning |
|-------|-------|---------|
| 0–2 | Novice | No real working knowledge |
| 3–4 | Beginner | Surface familiarity, no applied experience |
| 5–6 | Intermediate | Working knowledge, some production experience |
| 7–8 | Advanced | Deep knowledge, can handle edge cases |
| 9–10 | Expert | Can teach it, has solved hard problems with it |

The scoring prompt instructs the model to weight applied knowledge over theoretical knowledge, penalise shallow answers, and note specific missing concepts as critical gaps.

### Confidence detection

Each answer is checked client-side against hedging phrases:
```
["i think", "maybe", "not sure", "probably", "i believe",
 "might be", "i guess", "sort of", "kind of", "approximately"]
```
If detected → the next question prompt instructs Aria to probe that specific uncertainty deeper.

### Learning plan prioritisation

Skills are prioritised by gap severity (target minus current score), JD requirement level (required weighted over preferred), and reachability.

---

## Local Setup

**Prerequisites:** Node.js 18+, a free Groq API key

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/skillsense.git
cd skillsense

# 2. Install
npm install

# 3. Add API key
cp .env.example .env
# Add your Groq key to .env: VITE_GROQ_KEY=gsk_...

# 4. Run
npm run dev
# Open http://localhost:5173
```

### Get a free Groq API key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign in with Google
3. API Keys → Create API Key
4. Copy the key (`gsk_...`) and add to `.env`

Groq's free tier provides 14,400 requests/day — no credit card needed.

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add `VITE_GROQ_KEY` as an environment variable in the Vercel dashboard, then redeploy.

---

## Project Structure

```
skillsense/
├── src/
│   ├── App.jsx              # Main agent — all phases, UI, AI calls
│   ├── main.jsx             # React entry point
│   └── index.css            # Global reset
├── samples/
│   ├── sample-jd.txt        # Example job description
│   ├── sample-resume.txt    # Example candidate résumé
│   └── sample-output.json   # Example agent output
├── docs/
│   ├── architecture.md      # Architecture deep-dive
│   ├── writeup.md           # Project write-up
│   └── demo-script.md       # Demo video script
├── public/
│   └── favicon.svg
├── .env.example             # Environment variable template
├── index.html
├── vite.config.js
└── package.json
```

---

## Sample Output

**Input:** Senior Frontend Engineer JD + Priya Sharma's résumé (see `samples/`)

**Result:**
- Overall readiness: **54%**
- Hiring recommendation: **hire with plan**
- Time to job-ready: **8–10 weeks**
- Top gap: TypeScript (claimed: familiar, scored: 3/10)
- Top resource: [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/) — free, 20h

Full output in `samples/sample-output.json`.

---

## APIs & Tools

| Tool | Purpose | Cost |
|------|---------|------|
| Groq — Llama 3.3 70B | Skill extraction, assessment, scoring, learning plan | Free (14,400 req/day) |
| Web Speech API | Voice input | Browser-native, free |
| Google Fonts (Syne, JetBrains Mono) | Typography | Free |
| React 18 + Vite | UI framework + build tool | Free / OSS |

---

## License

MIT
