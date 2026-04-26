# SkillSense — One-Page Write-Up

**Challenge:** AI-Powered Skill Assessment & Personalised Learning Plan Agent  
**Team:** Vishrut Sharma  
**Stack:** React, Anthropic Claude Sonnet 4 / Google Gemini 2.0 Flash (free)

---

## The Problem

A résumé is a marketing document, not a proficiency report. A candidate who lists "React — 3 years" might be an expert in class components and nothing else. Existing screening tools either skip assessment entirely or run multiple-choice quizzes that reward memorisation over real understanding.

The gap: nobody has built a conversational agent that actually *interviews* the candidate per skill, adapts to their answers, detects when they're guessing, and then generates a learning plan based on what the conversation revealed — not what the résumé claimed.

---

## Our Approach

**Four-phase agentic workflow:**

**Phase 1 — Extraction:** Claude reads the JD and résumé together, outputs a structured JSON of 7 prioritised skills with the candidate's claim level and supporting evidence from the résumé.

**Phase 2 — Conversational Assessment:** For each skill, Aria (our named interviewer persona) asks 3 questions. Q1 is calibrated to the claim level. Q2–3 are generated with the prior answer in context. If the answer contains hedging language ("I think", "maybe", "not sure"), the next prompt flags this and instructs Aria to probe that specific uncertainty.

**Phase 3 — Scoring:** After 3 answers, the transcript (without the résumé claim, to avoid anchoring) is scored 0–10 with level label, rationale, strengths, and critical gaps.

**Phase 4 — Learning Plan:** All 7 skill scores are passed to a single prompt that outputs a prioritised roadmap — real resource URLs, weekly hour estimates, verifiable 30-day milestones, and interview tips tied to specific gaps.

---

## What Makes It Different

**Confidence detection** — real-time client-side analysis of hedging language, changing the next AI prompt accordingly. No other tool does this.

**Named persona (Aria)** — system prompt shapes a consistent interviewer character: direct, warm, no generic affirmations, varies question types. Feels like a real interview.

**Voice input** — Web Speech API, zero dependencies. Candidates can speak naturally.

**Skill dependency graph** — the AI maps which skills build on which. Visualised as a live SVG that colours by score during assessment.

**Dual AI backend** — works with either Anthropic Claude (paid) or Google Gemini (free, 15 req/min). Auto-detects from env vars.

---

## Trade-offs Made

**No backend/auth:** All AI calls are client-side. The API key is exposed in the browser via env var. For a production system, calls would go through a proxy. Acceptable for a demo — declared transparently.

**3 questions per skill:** Enough to detect surface vs deep knowledge in testing, but real interviews use more. A future version could dynamically extend or cut short based on early score signals.

**JSON-only responses:** The agent uses structured JSON output for extraction and scoring. The model occasionally wraps in markdown fences despite instructions — handled with a fallback strip. A more robust approach would use structured output mode (available in the Anthropic API).

**No multi-turn memory between skills:** History is passed as context within each skill's assessment, but the agent doesn't cross-reference answers across skills (e.g., noticing that weak TypeScript answers are consistent with weak Node.js answers). Interesting future direction.

---

## Results

In testing with 5 sample résumés against 3 different JDs:
- Average assessment time: 8–14 minutes
- Score accuracy vs human review: subjectively consistent in 4/5 cases
- Learning plan quality: resources are real and appropriate to the gap in all cases tested

---

## What We'd Build Next

1. **Streaming responses** — Aria types in real time (requires backend proxy to avoid CORS issues with SSE)
2. **Multi-round follow-up** — extend assessment for ambiguous scores automatically
3. **Candidate dashboard** — save assessments, track improvement over time
4. **Recruiter view** — compare multiple candidates on the same JD
5. **Structured outputs** — use Anthropic's JSON mode for guaranteed schema compliance
