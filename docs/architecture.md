# SkillSense — Architecture Deep-Dive

## System Overview

SkillSense is a single-page React application that implements a multi-phase agentic AI workflow entirely client-side. No backend server is required — all AI calls go directly to the LLM API.

## Phase State Machine

```
LANDING → EXTRACTING → BRIEFING → ASSESSING ↔ SCORING → ANALYZING → REPORT
                                       ↑__________________|
                                    (loops per skill)
```

Each phase change updates a single `phase` React state variable. The UI renders completely different layouts per phase — no routing library needed.

## Phase 1: Skill Extraction

**Input:** Raw JD text + résumé text  
**Output:** Structured JSON with 7 skills, each containing:
- `name`, `category`, `jdRequirement` (required/preferred/bonus)
- `resumeClaim` (expert/proficient/familiar/none)
- `resumeEvidence` (direct quote from résumé or null)
- `dependsOn` (prerequisite skills from the same list)
- `priority` (1 = most critical)

**Prompt strategy:** Single-shot JSON extraction. The model is instructed to return only valid JSON with no markdown fences. A try/catch with a fallback strip (`/```json|```/g`) handles edge cases where the model wraps in code blocks.

## Phase 2: Conversational Assessment

For each skill, 3 questions are generated sequentially. Each question generation call receives:
- The full prior Q&A history for this skill
- The résumé claim level (anchors difficulty)
- A `lowConfidenceLast` flag (if previous answer contained hedging language)

**Confidence detection:**  
A constant array of 12 hedging phrases is checked against each answer client-side (zero latency, zero API cost). If matched → next prompt includes an instruction to probe that specific uncertainty.

**Question types the model is prompted to vary between:**
1. Conceptual — "explain how X works"
2. Applied — "walk me through how you'd solve Y"  
3. Tradeoff — "when would you choose X over Z?"
4. Debugging — "what's wrong with this approach?"

## Phase 3: Skill Scoring

After 3 answers, the full transcript is sent to the model for scoring. The scorer receives only the Q&A — not the résumé claim — to prevent anchoring bias (a candidate who claimed "expert" but answered poorly gets scored on answers, not claims).

**Score rubric given to model:**
- 0–2: No real working knowledge
- 3–4: Surface familiarity, no applied experience
- 5–6: Working knowledge, some production experience  
- 7–8: Deep knowledge, handles edge cases
- 9–10: Expert — can teach it, has solved hard problems with it

## Phase 4: Learning Plan

All scored skills are passed in a single prompt. The model receives:
- Candidate name + target role
- Per-skill: score, level, critical gaps

The model outputs:
- `executiveSummary` — 3 sentences: readiness, strength, biggest gap
- `overallReadiness` — 0–100 integer
- `hiringRecommendation` — one of 4 levels
- `prioritySkills` — 4–5 skills with learning paths + real resource URLs
- `weeklyPlan` — 7 days with AM/PM focus and hour estimates
- `thirtyDayMilestones` — specific, verifiable checkpoints
- `interviewTips` — specific to this candidate's gaps

## Skill Dependency Graph

The extraction prompt asks the model to set `dependsOn` for each skill, referencing other skills in the same list. This is rendered as an SVG graph with:
- Colour coding: green (score 7+), amber (4–6), red (0–3)
- Dashed directed edges from prerequisite → dependent skill
- Scores shown inside each node after assessment

## Dual AI Backend

```
VITE_ANTHROPIC_KEY set? → Use Anthropic Claude Sonnet 4
       ↓ no
VITE_GEMINI_KEY set? → Use Google Gemini 2.0 Flash
       ↓ no
Error: no API key configured
```

The Gemini adapter converts Anthropic-style `messages[]` + `system` to Gemini's `contents[]` format, prepending the system prompt as a user/model exchange pair.

## State Management

All state lives in React useState hooks in the root component. No external state library. Key state:

```
phase          — current phase of the workflow
extraction     — parsed skills from JD + résumé
history        — { skillName: [{q, a}] } for all conversations
scores         — { skillName: { score, level, rationale, ... } }
plan           — full learning plan object
```

History and scores accumulate across skills and are passed into each subsequent API call for context.

## Performance Considerations

- All API calls are `async/await` with loading states
- No streaming (for simplicity and compatibility)
- SVG visualisations are pure React — no canvas or chart libraries
- Particle field uses `requestAnimationFrame` with a `ResizeObserver` for cleanup
- All expensive computations (`useMemo`) for radar chart data and scored skills list
