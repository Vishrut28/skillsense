# ◈ SkillSense — AI Skill Assessment Agent

> **Catalyst Hackathon 2025 — Agentic AI Track**  
> Built by Vishrut Sharma · [Live Demo](#) · [Demo Video](#)

---

## What it does

A résumé tells you what someone *claims* to know — not how well they actually know it.

**SkillSense** is an agentic AI interviewer ("Aria") that:

1. **Parses** a Job Description + candidate résumé to extract required skills
2. **Converses** with the candidate — 3 adaptive questions per skill, calibrated to their claimed level
3. **Detects low confidence** in real time (hedging language → deeper follow-up probing)
4. **Scores** each skill 0–10 with rationale, strengths, and critical gaps
5. **Generates** a hyper-personalised learning plan with real resources, weekly schedule, 30-day milestones, and interview tips

**Features:**
- 🎙 **Voice input** — speak your answers (Web Speech API, Chrome)
- 📡 **Named persona** — Aria, a warm but incisive senior engineer
- 📊 **Live radar chart** — skill scores animate as assessment progresses
- 🗺 **Skill dependency graph** — SVG map showing which skills build on which
- 🟢 **Confidence detection** — hedging language triggers deeper probing
- 📋 **Full report** — readiness %, hiring recommendation, roadmap, schedule, tips
- 🔄 **Dual AI backend** — Anthropic Claude (primary) or Google Gemini (free)

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

**State machine phases:**
`LANDING → EXTRACTING → BRIEFING → ASSESSING ↔ SCORING → ANALYZING → REPORT`

**Tech stack:**
| Layer | Tool |
|-------|------|
| UI | React 18 + Vite |
| AI (primary) | Anthropic Claude Sonnet 4 (`claude-sonnet-4-20250514`) |
| AI (free fallback) | Google Gemini 2.0 Flash |
| Voice | Web Speech API (browser native) |
| Visualisation | Pure SVG (no chart library) |
| Deployment | Vercel / GitHub Pages |

---

## Scoring Logic

### Skill proficiency score (0–10)

Each skill is scored by Claude/Gemini after 3 Q&A exchanges:

| Range | Level | Meaning |
|-------|-------|---------|
| 0–2 | Novice | No real working knowledge |
| 3–4 | Beginner | Surface familiarity, no applied experience |
| 5–6 | Intermediate | Working knowledge, some production experience |
| 7–8 | Advanced | Deep knowledge, can handle edge cases |
| 9–10 | Expert | Can teach it, has solved hard problems with it |

The scoring prompt instructs the model to:
- Weight **applied knowledge** (can you use it?) over theoretical knowledge
- Penalise confident-sounding but shallow answers
- Note specific missing concepts as critical gaps
- Consider the **resume claim level** as context (claimed expert + scores 4 = significant gap)

### Overall readiness (0–100%)

`readiness = weighted_average(skill_scores) × jd_alignment_factor`

Where `jd_alignment_factor` accounts for whether low scores are on "required" vs "preferred" skills.

### Confidence detection

The app analyses each answer for hedging language in real time:
```
["i think", "maybe", "not sure", "probably", "i believe",
 "might be", "i guess", "sort of", "kind of", "approximately"]
```
If detected → next question prompt includes: *"The candidate showed uncertainty. Probe that specific gap deeper."*

### Learning plan prioritisation

Skills are prioritised for the learning plan by:
1. **Gap severity**: `target_score - current_score` (larger gap = higher priority)
2. **JD requirement**: `required` skills weighted 2× over `preferred`
3. **Reachability**: adjacent skills the candidate is close to achieving

---

## Local Setup

### Prerequisites
- Node.js 18+
- An API key (choose one):
  - **Anthropic** (paid, ~$5 free credit): [console.anthropic.com](https://console.anthropic.com)
  - **Google Gemini** (free, no card): [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

### Steps

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/skillsense.git
cd skillsense

# 2. Install
npm install

# 3. Configure API key
cp .env.example .env
# Edit .env — add EITHER key:
#   VITE_ANTHROPIC_KEY=sk-ant-...    (Anthropic)
#   VITE_GEMINI_KEY=AIza...           (Gemini — free)

# 4. Run
npm run dev
# Open http://localhost:5173
```

### Deploy to Vercel (live URL in 60 seconds)

```bash
npm install -g vercel
vercel --prod
# When prompted, add environment variables from your .env
```

---

## API Key Setup (Step by Step)

### Option A — Google Gemini (FREE, recommended for trying)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with Google
3. Click **"Create API key"**
4. Copy the key (`AIza...`)
5. Add to `.env`:
   ```
   VITE_GEMINI_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

**Free tier limits:** 15 requests/minute, 1 million tokens/day — plenty for demos.

### Option B — Anthropic Claude (Better quality, ~$5 free credit)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create account → Verify email
3. Go to **API Keys** → **Create Key**
4. Copy the key (`sk-ant-...`)
5. Add to `.env`:
   ```
   VITE_ANTHROPIC_KEY=sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

**Note on browser API access:** The app uses `anthropic-dangerous-direct-browser-access: true` header for client-side calls. This is intentional for this demo — in production, calls would be proxied through a backend to protect the key.

---

## Project Structure

```
skillsense/
├── src/
│   ├── App.jsx          # Main agent — all phases, UI, AI calls
│   ├── main.jsx         # React entry point
│   └── index.css        # Global reset
├── samples/
│   ├── sample-jd.txt        # Example job description
│   ├── sample-resume.txt    # Example candidate résumé
│   └── sample-output.json   # Example agent output
├── docs/
│   ├── architecture.md      # Architecture deep-dive
│   └── writeup.md           # One-page hackathon write-up
├── public/
│   └── favicon.svg
├── .env.example         # Environment variable template
├── index.html
├── vite.config.js
└── package.json
```

---

## Sample Run

**Input:** Senior Frontend Engineer JD + Priya Sharma's résumé (see `samples/`)

**Output snapshot:**
- Overall readiness: **54%**
- Hiring recommendation: **hire with plan**
- Time to job-ready: **8–10 weeks**
- Top gap identified: TypeScript (claimed: familiar, scored: 3/10)
- Top resource: [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/) — free book, 20h

Full sample output in `samples/sample-output.json`.

---

## APIs & Tools Declared

| Tool | Purpose | Cost |
|------|---------|------|
| Anthropic Claude Sonnet 4 | Skill extraction, question gen, scoring, plan | Pay-as-you-go (~$5 free) |
| Google Gemini 2.0 Flash | Free-tier AI fallback | Free (15 req/min) |
| Web Speech API | Voice input for answers | Browser-native, free |
| Google Fonts (Syne, JetBrains Mono) | Typography | Free |
| Vite | Build tool | Free/OSS |
| React 18 | UI framework | Free/OSS |

All AI calls stay within free/trial tiers for demo usage.

---

## Judging Criteria Self-Assessment

| Criterion | Weight | Our rating | Evidence |
|-----------|--------|------------|---------|
| Works end-to-end | 20% | ✅ Strong | Full flow: JD+résumé → assessment → scored report |
| Quality of core agent | 25% | ✅ Strong | Adaptive Qs, confidence detection, persona, 4-phase state machine |
| Quality of output | 20% | ✅ Strong | Radar chart, dep graph, roadmap, schedule, milestones, tips |
| Technical implementation | 15% | ✅ Good | Dual AI backend, voice, SVG visualisations, clean state machine |
| Innovation & creativity | 10% | ✅ Strong | Voice input, Aria persona, live confidence meter, dependency graph |
| UX | 5% | ✅ Good | Briefing screen, particle bg, animated transitions, dark aesthetic |
| Clean documented code | 5% | ✅ Good | JSDoc comments, modular functions, this README |

---

## License

MIT — built for Catalyst Hackathon 2025, Deccan AI.
