import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── API CONFIGURATION ────────────────────────────────────────────────────────
// Using Groq — free, fast, no credit card needed.
// Get your free key at: https://console.groq.com → API Keys → Create
// Add to .env: VITE_GROQ_KEY=gsk_...

const GROQ_KEY   = import.meta.env.VITE_GROQ_KEY || "";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_API   = "https://api.groq.com/openai/v1/chat/completions";

const PHASES = { LANDING:"landing", EXTRACTING:"extracting", BRIEFING:"briefing", ASSESSING:"assessing", SCORING:"scoring", ANALYZING:"analyzing", REPORT:"report" };
const QS_PER_SKILL = 3;
const HEDGES = ["i think","maybe","not sure","probably","i believe","might be","i guess","sort of","kind of","i don't know","unsure","approximately","roughly"];

function hasLowConfidence(text) {
  const lower = text.toLowerCase();
  return HEDGES.some(h => lower.includes(h));
}

// ─── GROQ CALLER ─────────────────────────────────────────────────────────────
// Groq uses OpenAI-compatible API — clean and simple.
async function callAI(messages, system, maxTokens = 1800) {
  const groqMessages = [];
  if (system) groqMessages.push({ role: "system", content: system });
  messages.forEach(m => groqMessages.push({ role: m.role, content: m.content }));

  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: groqMessages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API ${res.status}: ${err}`);
  }
  const d = await res.json();
  return d.choices?.[0]?.message?.content || "";
}

const callClaude = callAI;

async function extractSkills(jd, resume) {
  const system = `You are an elite talent intelligence system. Respond ONLY in valid JSON with no markdown fences.`;
  const raw = await callClaude([{ role:"user", content:`
Job Description:\n${jd}\n\nResume:\n${resume}

Return this exact JSON:
{
  "candidateName": "string",
  "targetRole": "string",
  "company": "string or null",
  "skills": [
    {
      "name": "string",
      "category": "technical|domain|soft",
      "jdRequirement": "required|preferred|bonus",
      "resumeClaim": "expert|proficient|familiar|none",
      "resumeEvidence": "short direct quote or null",
      "dependsOn": ["other skill names from this list that are prerequisites"],
      "priority": 1
    }
  ]
}
Extract exactly 7 skills ordered by priority. dependsOn must only reference other skill names in the list.
` }], system, 1400);
  try { return JSON.parse(raw); }
  catch { return JSON.parse(raw.replace(/```json|```/g,"").trim()); }
}

async function generateQuestion(skill, history, resumeClaim, resumeEvidence, lowConfidenceLast) {
  const histText = history.map(h => `Aria: ${h.q}\nCandidate: ${h.a}`).join("\n\n");
  const system = `You are Aria, a warm but incisive senior engineer who conducts elite technical skill assessments. Ask ONE question per turn. No preamble, no affirmations like "Great answer!". Vary between conceptual, applied, tradeoff, and debugging questions. When the candidate shows uncertainty, probe that specific gap. Sound like a real human, not a bot.`;
  const content = `Skill: "${skill}"
Resume claim: ${resumeClaim}${resumeEvidence ? ` — evidence: "${resumeEvidence}"` : ""}
${history.length
  ? `\nConversation so far:\n${histText}\n\n${lowConfidenceLast ? "The candidate showed uncertainty in their last answer. Probe that specific gap deeper." : "Ask a follow-up that goes one level deeper."}`
  : `Ask an opening question calibrated for someone claiming to be "${resumeClaim}" level.`}

Reply with ONLY the question. No label, no greeting.`;
  return callClaude([{role:"user",content}], system, 200);
}

async function scoreSkill(skill, history) {
  const system = `You are a senior principal engineer evaluating technical proficiency. Respond ONLY in valid JSON with no markdown.`;
  const convo = history.map(h => `Q: ${h.q}\nA: ${h.a}`).join("\n\n");
  const raw = await callClaude([{role:"user",content:`
Skill: ${skill}

Conversation:
${convo}

Return JSON:
{
  "score": <0-10 integer>,
  "level": "novice|beginner|intermediate|advanced|expert",
  "rationale": "<2 crisp sentences>",
  "strengths": ["up to 3 items"],
  "criticalGaps": ["up to 3 items"],
  "adjacentSkills": ["1-2 related skills worth learning"]
}
`}], system, 400);
  try { return JSON.parse(raw); }
  catch { return JSON.parse(raw.replace(/```json|```/g,"").trim()); }
}

async function generatePlan(candidateName, targetRole, scoredSkills) {
  const system = `You are a world-class learning architect. Respond ONLY in valid JSON with no markdown.`;
  const summary = scoredSkills.map(s => `${s.name}: ${s.score}/10 (${s.level}), gaps: ${(s.criticalGaps||[]).join(", ")||"none"}`).join("\n");
  const raw = await callClaude([{role:"user",content:`
Candidate: ${candidateName} | Target: ${targetRole}

Skill Scores:
${summary}

Return JSON:
{
  "executiveSummary": "<3 sentences: honest readiness, biggest strength, critical gap>",
  "overallReadiness": <0-100 integer>,
  "hiringRecommendation": "strong hire|hire with plan|develop first|not ready",
  "timeToJobReady": "<e.g. 6-8 weeks>",
  "prioritySkills": [
    {
      "skill": "string",
      "currentScore": <number>,
      "targetScore": <number>,
      "weeklyHours": <number>,
      "totalWeeks": <number>,
      "rationale": "<1 sentence>",
      "learningPath": [
        { "week": "Week 1-2", "focus": "string", "outcome": "string" }
      ],
      "resources": [
        { "title": "string", "type": "course|docs|project|book|video|practice", "url": "string", "free": true, "estimatedHours": <number>, "whyThisOne": "<1 sentence>" }
      ]
    }
  ],
  "weeklyPlan": [
    { "day": "Mon", "morning": "string", "evening": "string", "totalHours": <number> }
  ],
  "thirtyDayMilestones": ["<specific verifiable milestone>"],
  "interviewTips": ["<specific to their gaps>"]
}
Include 4 priority skills. Resources must be real, specific URLs (MDN, Coursera, freeCodeCamp, official docs, YouTube).
`}], system, 2500);
  try { return JSON.parse(raw); }
  catch { return JSON.parse(raw.replace(/```json|```/g,"").trim()); }
}

// ── Particle field
function ParticleField() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    let W = c.width = c.offsetWidth;
    let H = c.height = c.offsetHeight;
    const pts = Array.from({length:55}, () => ({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.18, vy: (Math.random()-.5)*.18,
      r: Math.random()*1.2+.3
    }));
    let raf;
    function draw() {
      ctx.clearRect(0,0,W,H);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x<0||p.x>W) p.vx*=-1;
        if(p.y<0||p.y>H) p.vy*=-1;
      });
      for(let i=0;i<pts.length;i++) {
        for(let j=i+1;j<pts.length;j++) {
          const d = Math.hypot(pts[i].x-pts[j].x, pts[i].y-pts[j].y);
          if(d<130) {
            ctx.strokeStyle = `rgba(99,102,241,${(1-d/130)*.13})`;
            ctx.lineWidth = .5;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = "rgba(99,102,241,0.4)";
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, pts[i].r, 0, Math.PI*2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const ro = new ResizeObserver(() => { W=c.width=c.offsetWidth; H=c.height=c.offsetHeight; });
    ro.observe(c);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}} />;
}

// ── Radar chart
function RadarChart({ skills }) {
  const W=240, H=240, cx=120, cy=120, r=88;
  const n = skills.length;
  if(!n) return null;
  const ang = i => (Math.PI*2*i/n) - Math.PI/2;
  const pt = (i, v, mx=10) => {
    const a=ang(i), d=r*(v/mx);
    return [cx+d*Math.cos(a), cy+d*Math.sin(a)];
  };
  const scoreColor = s => s>=7?"#10b981":s>=4?"#f59e0b":"#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:200}}>
      <defs>
        <radialGradient id="radarGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.2)"/>
          <stop offset="100%" stopColor="rgba(99,102,241,0)"/>
        </radialGradient>
      </defs>
      {[2,4,6,8,10].map(v => (
        <polygon key={v} points={skills.map((_,i)=>pt(i,v).join(",")).join(" ")}
          fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth={v===10?"1":"0.5"}/>
      ))}
      {skills.map((_,i) => {
        const [x2,y2]=pt(i,10);
        return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(99,102,241,0.1)" strokeWidth="0.5"/>;
      })}
      <polygon
        points={skills.map((s,i)=>pt(i,s.score||0).join(",")).join(" ")}
        fill="url(#radarGrad)" stroke="#6366f1" strokeWidth="1.5"
        style={{transition:"all 0.8s ease"}}
      />
      {skills.map((s,i) => {
        const [x,y]=pt(i,s.score||0);
        return <circle key={i} cx={x} cy={y} r={4} fill={scoreColor(s.score||0)} style={{transition:"all 0.8s ease"}}/>;
      })}
      {skills.map((s,i) => {
        const [lx,ly]=pt(i,13);
        const anchor = lx<cx-8?"end":lx>cx+8?"start":"middle";
        const label = s.name.length>11?s.name.slice(0,10)+"…":s.name;
        return (
          <text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline="central"
            style={{fontSize:8,fill:"#64748b",fontFamily:"inherit"}}>{label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Dependency graph
function DependencyGraph({ skills, scores }) {
  if(!skills||!skills.length) return null;
  const cols=4, colW=120, rowH=56;
  const placed = skills.map((s,i) => ({
    ...s,
    score: scores[s.name]?.score??null,
    x: 20+(i%cols)*colW,
    y: 14+Math.floor(i/cols)*rowH
  }));
  const H = 14 + Math.ceil(skills.length/cols)*rowH;
  const findPt = name => placed.find(p=>p.name===name);
  const scoreColor = s => s==null?"#334155":s>=7?"#10b981":s>=4?"#f59e0b":"#ef4444";
  const scoreBg = s => s==null?"rgba(15,23,42,0.8)":s>=7?"rgba(16,185,129,.12)":s>=4?"rgba(245,158,11,.12)":"rgba(239,68,68,.12)";
  return (
    <svg viewBox={`0 0 500 ${H}`} style={{width:"100%",overflow:"visible"}}>
      <defs>
        <marker id="depArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M2 2L8 5L2 8" fill="none" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </marker>
      </defs>
      {placed.map(s => (s.dependsOn||[]).map(dep => {
        const t=findPt(dep);
        if(!t) return null;
        return <line key={s.name+dep} x1={t.x+48} y1={t.y+14} x2={s.x+48} y2={s.y+14}
          stroke="#1e293b" strokeWidth="1" markerEnd="url(#depArrow)" strokeDasharray="3 2"/>;
      }))}
      {placed.map(s => {
        const col = scoreColor(s.score);
        const bg = scoreBg(s.score);
        const label = s.name.length>12?s.name.slice(0,11)+"…":s.name;
        return (
          <g key={s.name} transform={`translate(${s.x},${s.y})`}>
            <rect x={0} y={0} width={96} height={26} rx={6} fill={bg} stroke={col} strokeWidth={s.score!=null?"1":"0.5"}/>
            <text x={48} y={13} textAnchor="middle" dominantBaseline="central"
              style={{fontSize:8.5,fill:col,fontWeight:500,fontFamily:"inherit"}}>{label}</text>
            {s.score!=null&&(
              <text x={48} y={22} textAnchor="middle" dominantBaseline="central"
                style={{fontSize:7,fill:col,opacity:.75,fontFamily:"inherit"}}>{s.score}/10</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Score bar
function ScoreBar({ score, max=10 }) {
  const pct = (score/max)*100;
  const col = score>=7?"#10b981":score>=4?"#f59e0b":"#ef4444";
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1,height:5,background:"#0a1628",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:pct+"%",height:"100%",background:`linear-gradient(90deg,${col}88,${col})`,borderRadius:3,transition:"width 1.2s cubic-bezier(.34,1.56,.64,1)",boxShadow:`0 0 8px ${col}44`}}/>
      </div>
      <span style={{fontSize:12,fontWeight:700,color:col,minWidth:36}}>{score}/10</span>
    </div>
  );
}

// ── Confidence indicator
function ConfidenceMeter({ confidence }) {
  if(confidence==null) return null;
  const col = confidence>=70?"#10b981":confidence>=40?"#f59e0b":"#ef4444";
  const label = confidence>=70?"High confidence":confidence>=40?"Moderate — probing deeper":"Low — diving deeper";
  return (
    <div style={{display:"flex",alignItems:"center",gap:7,padding:"3px 10px",borderRadius:20,background:`${col}11`,border:`1px solid ${col}33`}}>
      <div style={{width:5,height:5,borderRadius:"50%",background:col,boxShadow:`0 0 5px ${col}`}}/>
      <span style={{fontSize:11,color:col,fontWeight:500}}>{label}</span>
    </div>
  );
}

// ── Voice button
function VoiceButton({ onTranscript, disabled }) {
  const [listening,setListening] = useState(false);
  const recRef = useRef(null);
  const toggle = () => {
    if(listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) { alert("Voice not supported in this browser — try Chrome."); return; }
    const r = new SR();
    r.continuous=false; r.interimResults=false; r.lang="en-US";
    r.onstart = () => setListening(true);
    r.onresult = e => { onTranscript(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start(); recRef.current=r;
  };
  return (
    <button onClick={toggle} disabled={disabled} title={listening?"Stop":"Speak your answer"}
      style={{width:44,height:44,borderRadius:"50%",border:"none",cursor:disabled?"not-allowed":"pointer",
        background:listening?"rgba(239,68,68,.2)":"rgba(99,102,241,.12)",
        color:listening?"#ef4444":"#6366f1",fontSize:18,transition:"all .2s",flexShrink:0,
        boxShadow:listening?"0 0 16px rgba(239,68,68,.4)":"none",
        display:"flex",alignItems:"center",justifyContent:"center"}}>
      {listening?"⏹":"🎙"}
    </button>
  );
}

// ── Resource badge
function BadgeType({type}) {
  const map = {course:["📖","#6366f1"],docs:["📄","#0ea5e9"],project:["🛠","#f59e0b"],book:["📚","#8b5cf6"],video:["▶","#ef4444"],practice:["⚡","#10b981"]};
  const [icon,col] = map[type]||["🔗","#64748b"];
  return <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:col+"22",color:col,fontWeight:700,flexShrink:0}}>{icon} {type}</span>;
}

// ── Typing dots
function TypingDots() {
  return (
    <span style={{display:"inline-flex",gap:3,alignItems:"center",padding:"2px 0"}}>
      {[0,1,2].map(i=>(
        <span key={i} style={{width:5,height:5,borderRadius:"50%",background:"#6366f1",
          animation:"dotPulse 1.4s ease infinite",animationDelay:`${i*0.2}s`,display:"inline-block"}}/>
      ))}
    </span>
  );
}

const SAMPLE_JD = `Senior Frontend Engineer — FinTech Startup

We're building the next-generation trading dashboard. You'll lead frontend architecture for our real-time data visualization platform.

Requirements:
- 3+ years React (hooks, context, performance optimization)
- TypeScript — strict mode, advanced generics preferred
- State management: Redux Toolkit or Zustand
- WebSockets for real-time data streams
- REST API integration, error boundaries, retry logic
- Basic Node.js/Express for BFF layer
- Git, CI/CD, Docker basics
- Understanding of financial data (OHLC, order books) is a plus`;

const SAMPLE_RESUME = `Priya Sharma | priya@email.com | github.com/priyasharma

EXPERIENCE
Frontend Developer, TechCorp (2 years)
- Built React dashboards with Redux for internal analytics (50k+ users)
- Integrated REST APIs, wrote some TypeScript for new features
- Worked alongside a Node.js microservice team

SKILLS: React, JavaScript, TypeScript (learning), Redux, REST APIs, Git

EDUCATION: B.Tech Computer Science, 2022`;

// ════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════
export default function SkillSense() {
  const [phase, setPhase]           = useState(PHASES.LANDING);
  const [jd, setJd]                 = useState("");
  const [resume, setResume]         = useState("");
  const [extraction, setExtraction] = useState(null);
  const [skillIdx, setSkillIdx]     = useState(0);
  const [qIdx, setQIdx]             = useState(0);
  const [history, setHistory]       = useState({});
  const [currentQ, setCurrentQ]     = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [scores, setScores]         = useState({});
  const [confidence, setConfidence] = useState(null);
  const [plan, setPlan]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError]           = useState("");
  const [activeTab, setActiveTab]   = useState("plan");
  const [expandedSkill, setExpandedSkill]   = useState(null);
  const [expandedRes, setExpandedRes]       = useState(null);
  const chatRef   = useRef(null);
  const answerRef = useRef(null);

  const currentSkill = extraction?.skills?.[skillIdx];
  const skillHistory = history[currentSkill?.name] || [];

  const radarData = useMemo(() =>
    (extraction?.skills||[]).map(s => ({ name:s.name, score:scores[s.name]?.score??0 }))
  , [extraction, scores]);

  const scoredSkills = useMemo(() =>
    (extraction?.skills||[]).filter(s => scores[s.name])
  , [extraction, scores]);

  useEffect(() => {
    if(chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [currentQ, skillHistory.length]);

  // ── Start
  const handleStart = useCallback(async () => {
    if(!jd.trim()||!resume.trim()) { setError("Both fields are required."); return; }
    setError("");
    setPhase(PHASES.EXTRACTING);
    setLoadingMsg("Analysing job description and resume…");
    try {
      const ext = await extractSkills(jd, resume);
      setExtraction(ext);
      setPhase(PHASES.BRIEFING);
    } catch(e) {
      setError("Failed to analyse: "+e.message);
      setPhase(PHASES.LANDING);
    }
  }, [jd, resume]);

  // ── Begin after briefing
  const beginAssessment = useCallback(async () => {
    if(!extraction) return;
    setPhase(PHASES.ASSESSING);
    setSkillIdx(0); setQIdx(0);
    await loadQuestion(extraction.skills[0], {}, 0, false);
  }, [extraction]);

  // ── Load next question
  const loadQuestion = useCallback(async (skill, histMap, qNum, lowConf) => {
    setCurrentQ("");
    setLoading(true);
    setLoadingMsg("");
    try {
      const hist = histMap[skill.name] || [];
      const q = await generateQuestion(skill.name, hist, skill.resumeClaim, skill.resumeEvidence, lowConf);
      setCurrentQ(q);
    } catch(e) {
      setError("Error generating question: "+e.message);
    } finally {
      setLoading(false);
      setTimeout(() => answerRef.current?.focus(), 80);
    }
  }, []);

  // ── Submit answer
  const handleAnswer = useCallback(async () => {
    const ans = userAnswer.trim();
    if(!ans || loading || !currentQ) return;

    const skill = currentSkill;
    const finalQ = currentQ;
    const newHist = [...skillHistory, { q:finalQ, a:ans }];
    const newHistMap = { ...history, [skill.name]:newHist };

    setHistory(newHistMap);
    setUserAnswer("");
    setCurrentQ("");

    const lowConf = hasLowConfidence(ans);
    // Simple confidence score from hedges
    const confScore = lowConf ? Math.floor(Math.random()*30+20) : Math.floor(Math.random()*30+65);
    setConfidence({ score:confScore, low:lowConf });

    const newQIdx = qIdx + 1;

    if(newQIdx < QS_PER_SKILL) {
      setQIdx(newQIdx);
      await loadQuestion(skill, newHistMap, newQIdx, lowConf);
    } else {
      // Score skill
      setPhase(PHASES.SCORING);
      setLoadingMsg(`Evaluating your ${skill.name} proficiency…`);
      try {
        const sc = await scoreSkill(skill.name, newHist);
        const newScores = { ...scores, [skill.name]:sc };
        setScores(newScores);

        const nextIdx = skillIdx + 1;
        if(nextIdx < extraction.skills.length) {
          setSkillIdx(nextIdx);
          setQIdx(0);
          setConfidence(null);
          setPhase(PHASES.ASSESSING);
          await loadQuestion(extraction.skills[nextIdx], newHistMap, 0, false);
        } else {
          // Generate plan
          setPhase(PHASES.ANALYZING);
          setLoadingMsg("Generating your personalised learning plan…");
          const allScored = extraction.skills.map(s => ({
            name: s.name,
            ...(newScores[s.name] || { score:5, level:"intermediate", criticalGaps:[] })
          }));
          const lp = await generatePlan(extraction.candidateName, extraction.targetRole, allScored);
          setPlan(lp);
          setPhase(PHASES.REPORT);
        }
      } catch(e) {
        setError("Scoring error: "+e.message);
        setPhase(PHASES.ASSESSING);
      }
    }
  }, [userAnswer, loading, currentQ, currentSkill, skillHistory, history, qIdx, scores, skillIdx, extraction, loadQuestion]);

  const handleKey = e => { if((e.metaKey||e.ctrlKey)&&e.key==="Enter") handleAnswer(); };

  const reset = () => {
    setPhase(PHASES.LANDING); setExtraction(null); setHistory({});
    setScores({}); setPlan(null); setCurrentQ(""); setError("");
    setSkillIdx(0); setQIdx(0); setConfidence(null); setUserAnswer("");
  };

  const readColor = r => r>=70?"#10b981":r>=40?"#f59e0b":"#ef4444";
  const hireColor = h => h==="strong hire"?"#10b981":h==="hire with plan"?"#f59e0b":h==="develop first"?"#ef4444":"#64748b";
  const hireBg    = h => h==="strong hire"?"rgba(16,185,129,.12)":h==="hire with plan"?"rgba(245,158,11,.12)":h==="develop first"?"rgba(239,68,68,.12)":"rgba(100,116,139,.12)";

  return (
    <div style={{minHeight:"100vh",background:"#05080f",color:"#e2e8f0",fontFamily:"'Syne','Segoe UI',sans-serif",display:"flex",flexDirection:"column",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px;}
        textarea,input,button{font-family:inherit;}
        textarea{outline:none;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes dotPulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
        @keyframes glow{0%,100%{box-shadow:0 0 0 rgba(99,102,241,0)}50%{box-shadow:0 0 24px rgba(99,102,241,0.35)}}
        .fadeUp{animation:fadeUp .45s ease both;}
        .fadeIn{animation:fadeIn .35s ease both;}
        .card{background:#080f1a;border:1px solid #0f1e35;border-radius:14px;}
        .glow-btn{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;cursor:pointer;border-radius:10px;font-weight:600;transition:all .2s;position:relative;overflow:hidden;}
        .glow-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(99,102,241,.45);}
        .glow-btn:active{transform:translateY(0);}
        .glow-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}
        .ghost-btn{background:transparent;border:1px solid #1e293b;color:#64748b;cursor:pointer;border-radius:8px;transition:all .2s;}
        .ghost-btn:hover{border-color:#334155;color:#94a3b8;}
        .tab-btn{background:none;border:none;cursor:pointer;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:500;transition:all .2s;letter-spacing:.2px;}
        .tab-active{background:#0f172a;color:#e2e8f0;box-shadow:inset 0 0 0 1px #1e293b;}
        .tab-btn:not(.tab-active){color:#475569;}
        .tab-btn:not(.tab-active):hover{color:#94a3b8;}
        .answer-box{background:#080f1a;border:1px solid #1e293b;border-radius:12px;color:#e2e8f0;padding:14px 16px;font-size:14px;resize:none;width:100%;line-height:1.65;transition:border-color .2s;}
        .answer-box:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.1);outline:none;}
        .skill-pill{padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;}
        .res-link{color:#818cf8;text-decoration:none;font-size:13px;}
        .res-link:hover{color:#a5b4fc;text-decoration:underline;}
        .verdict{padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
      `}</style>

      {/* Ambient */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",top:-150,left:"25%",width:700,height:700,borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,.055) 0%,transparent 65%)"}}/>
        <div style={{position:"absolute",bottom:-80,right:"15%",width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.04) 0%,transparent 65%)"}}/>
      </div>

      {/* HEADER */}
      <header style={{borderBottom:"1px solid #0f1e35",padding:"13px 28px",display:"flex",alignItems:"center",gap:14,position:"relative",zIndex:10,background:"rgba(5,8,15,.85)",backdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,boxShadow:"0 4px 14px rgba(99,102,241,.45)"}}>◈</div>
          <div>
            <span style={{fontSize:17,fontWeight:700,letterSpacing:"-0.5px"}}>SkillSense</span>
            <span style={{fontSize:11,color:"#334155",marginLeft:8,letterSpacing:".4px",textTransform:"uppercase"}}>by Aria</span>
          </div>
        </div>

        {/* Live progress in header */}
        {phase===PHASES.ASSESSING&&extraction&&(
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:20}}>
            {scoredSkills.length>=2&&<RadarChart skills={radarData}/>}
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:2}}>
                Skill <span style={{color:"#e2e8f0",fontWeight:600}}>{skillIdx+1}</span> of {extraction.skills.length}
              </div>
              <div style={{fontSize:11,color:"#334155"}}>Question {qIdx+1}/{QS_PER_SKILL}</div>
            </div>
          </div>
        )}

        {phase!==PHASES.LANDING&&(
          <button className="ghost-btn" onClick={reset} style={{marginLeft:phase===PHASES.ASSESSING?"8px":"auto",padding:"5px 14px",fontSize:12}}>← Reset</button>
        )}
      </header>

      {/* ── LANDING ── */}
      {phase===PHASES.LANDING&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>
          <ParticleField/>
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",position:"relative",zIndex:1}}>

            <div style={{textAlign:"center",marginBottom:44,maxWidth:560}} className="fadeUp">
              <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 14px",borderRadius:20,border:"1px solid rgba(99,102,241,.25)",background:"rgba(99,102,241,.07)",marginBottom:22}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#6366f1",animation:"glow 2s infinite"}}/>
                <span style={{fontSize:11,color:"#818cf8",fontWeight:600,letterSpacing:".3px"}}>Aria AI · Skill Intelligence Platform</span>
              </div>
              <h1 style={{fontSize:46,fontWeight:700,margin:"0 0 14px",letterSpacing:"-2px",lineHeight:1.08}}>
                Beyond the résumé.<br/>
                <span style={{background:"linear-gradient(135deg,#6366f1 0%,#a78bfa 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                  Know your real level.
                </span>
              </h1>
              <p style={{color:"#64748b",fontSize:15,margin:0,lineHeight:1.7}}>
                Aria, your AI interviewer, converses with you on each required skill — then builds a laser-precise learning plan around your actual gaps.
              </p>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,width:"100%",maxWidth:820,marginBottom:22}} className="fadeUp">
              {[
                [jd, setJd, "Job Description", "#6366f1", SAMPLE_JD],
                [resume, setResume, "Your Resume", "#8b5cf6", SAMPLE_RESUME]
              ].map(([val, setter, label, col, sample]) => (
                <div key={label} className="card" style={{padding:20,position:"relative"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{fontSize:11,fontWeight:700,color:col,letterSpacing:".5px",textTransform:"uppercase"}}>{label}</span>
                    <button className="ghost-btn" onClick={()=>setter(sample)} style={{padding:"2px 10px",fontSize:10,borderRadius:6}}>Load sample</button>
                  </div>
                  <textarea value={val} onChange={e=>setter(e.target.value)} placeholder={`Paste ${label.toLowerCase()}…`}
                    style={{width:"100%",height:186,background:"transparent",border:"none",color:"#e2e8f0",fontSize:13,resize:"none",lineHeight:1.65,fontFamily:"'JetBrains Mono',monospace"}}/>
                  {val&&<div style={{position:"absolute",bottom:14,right:14,fontSize:10,color:"#1e293b"}}>{val.split(/\s+/).filter(Boolean).length}w</div>}
                </div>
              ))}
            </div>

            {error&&<p style={{color:"#ef4444",fontSize:13,marginBottom:14}}>{error}</p>}

            <button className="glow-btn fadeUp" onClick={handleStart} style={{padding:"15px 40px",fontSize:15,borderRadius:12}}>
              Start Assessment with Aria →
            </button>

            <div style={{display:"flex",gap:28,marginTop:28,color:"#334155",fontSize:12}} className="fadeUp">
              {["Adaptive questioning","Voice input","Live skill radar","Personalised roadmap"].map(t=>(
                <span key={t} style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"#6366f1",fontSize:9}}>◆</span>{t}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING STATES ── */}
      {[PHASES.EXTRACTING,PHASES.SCORING,PHASES.ANALYZING].includes(phase)&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:22,position:"relative",zIndex:1}}>
          <div style={{position:"relative",width:60,height:60}}>
            <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"1px solid rgba(99,102,241,.15)"}}/>
            <div style={{position:"absolute",inset:4,borderRadius:"50%",border:"2px solid transparent",borderTopColor:"#6366f1",animation:"spin 1s linear infinite"}}/>
            <div style={{position:"absolute",inset:12,borderRadius:"50%",border:"1px solid transparent",borderTopColor:"#8b5cf6",animation:"spin .7s linear infinite reverse"}}/>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>◈</div>
          </div>
          <p style={{color:"#64748b",fontSize:14,margin:0}}>{loadingMsg}</p>
          <TypingDots/>
        </div>
      )}

      {/* ── BRIEFING ── */}
      {phase===PHASES.BRIEFING&&extraction&&(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:40,position:"relative",zIndex:1}} className="fadeIn">
          <div className="card" style={{maxWidth:540,width:"100%",padding:36,textAlign:"center"}}>
            <div style={{width:54,height:54,borderRadius:14,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",margin:"0 auto 20px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:"0 8px 28px rgba(99,102,241,.35)"}}>◈</div>
            <p style={{fontSize:11,color:"#6366f1",fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 8px"}}>Ready to begin</p>
            <h2 style={{margin:"0 0 6px",fontSize:24,fontWeight:700,letterSpacing:"-0.5px"}}>{extraction.candidateName}</h2>
            <p style={{color:"#64748b",fontSize:14,margin:"0 0 22px"}}>
              Assessing for <span style={{color:"#e2e8f0",fontWeight:500}}>{extraction.targetRole}</span>
              {extraction.company?<span> at <span style={{color:"#94a3b8"}}>{extraction.company}</span></span>:null}
            </p>
            <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",marginBottom:24}}>
              {extraction.skills.map(s=>(
                <span key={s.name} className="skill-pill" style={{
                  background: s.jdRequirement==="required"?"rgba(99,102,241,.14)":"rgba(30,41,59,.5)",
                  color: s.jdRequirement==="required"?"#818cf8":"#475569",
                  border:`1px solid ${s.jdRequirement==="required"?"rgba(99,102,241,.28)":"#1e293b"}`}}>
                  {s.name}
                </span>
              ))}
            </div>
            <div style={{padding:16,borderRadius:10,background:"rgba(99,102,241,.05)",border:"1px solid rgba(99,102,241,.12)",marginBottom:26,textAlign:"left"}}>
              <p style={{fontSize:13,color:"#64748b",lineHeight:1.65,margin:0}}>
                Hi, I'm <strong style={{color:"#e2e8f0"}}>Aria</strong>. I'll ask you <strong style={{color:"#e2e8f0"}}>{QS_PER_SKILL} questions</strong> on each of the <strong style={{color:"#e2e8f0"}}>{extraction.skills.length} skills</strong> above — adapted to your actual answers. Be honest. That's what gives you an accurate plan. Use voice or text.
              </p>
            </div>
            <button className="glow-btn" onClick={beginAssessment} style={{padding:"14px 0",fontSize:14,width:"100%",borderRadius:10}}>
              Begin Assessment →
            </button>
          </div>
        </div>
      )}

      {/* ── ASSESSMENT ── */}
      {phase===PHASES.ASSESSING&&extraction&&(
        <div style={{flex:1,display:"flex",overflow:"hidden",position:"relative",zIndex:1}}>

          {/* Left sidebar */}
          <div style={{width:196,borderRight:"1px solid #0f1e35",padding:"18px 0",display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"}}>
            <p style={{fontSize:10,fontWeight:700,color:"#334155",letterSpacing:".5px",textTransform:"uppercase",padding:"0 14px",margin:"0 0 10px"}}>Skills</p>
            {extraction.skills.map((s,i)=>{
              const done = scores[s.name];
              const curr = i===skillIdx;
              const sc   = done?.score;
              const col  = sc!=null?(sc>=7?"#10b981":sc>=4?"#f59e0b":"#ef4444"):null;
              return (
                <div key={s.name} style={{padding:"8px 14px",fontSize:12,color:done?"#64748b":curr?"#e2e8f0":"#334155",background:curr?"rgba(99,102,241,.06)":"transparent",borderLeft:curr?"2px solid #6366f1":"2px solid transparent"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:done?6:0}}>
                    <span style={{fontWeight:curr?600:400,fontSize:11}}>{s.name}</span>
                    {done&&<span style={{fontSize:10,color:col,fontWeight:700}}>{sc}/10</span>}
                    {curr&&!done&&<span style={{fontSize:10,color:"#6366f1"}}>{qIdx+1}/{QS_PER_SKILL}</span>}
                  </div>
                  {done&&<ScoreBar score={sc}/>}
                </div>
              );
            })}
            {scoredSkills.length>=2&&(
              <div style={{padding:"16px 8px 0"}}>
                <RadarChart skills={radarData}/>
              </div>
            )}
          </div>

          {/* Chat center */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Chat header */}
            <div style={{padding:"12px 22px",borderBottom:"1px solid #0f1e35",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>◈</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600}}>{currentSkill?.name}</div>
                <div style={{fontSize:11,color:"#475569"}}>
                  Claimed: <span style={{color:"#94a3b8"}}>{currentSkill?.resumeClaim}</span>
                  {currentSkill?.resumeEvidence&&<span style={{color:"#334155"}}> · "{currentSkill.resumeEvidence}"</span>}
                </div>
              </div>
              {confidence&&<ConfidenceMeter confidence={confidence.score}/>}
            </div>

            {/* Messages */}
            <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"26px 22px",display:"flex",flexDirection:"column",gap:22}}>
              {skillHistory.length===0&&!currentQ&&!loading&&(
                <div style={{textAlign:"center",padding:"30px 0",color:"#334155",fontSize:13}}>
                  <TypingDots/>
                  <p style={{marginTop:12,marginBottom:0}}>Aria is preparing your question…</p>
                </div>
              )}

              {skillHistory.map((h,i)=>(
                <div key={i} style={{display:"flex",flexDirection:"column",gap:13}} className="fadeIn">
                  <div style={{display:"flex",gap:11,alignItems:"flex-start"}}>
                    <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>◈</div>
                    <div className="card" style={{padding:"13px 16px",fontSize:14,lineHeight:1.7,color:"#cbd5e1",borderLeft:"2px solid rgba(99,102,241,.3)",flex:1}}>
                      <div style={{fontSize:9,color:"#6366f1",fontWeight:700,letterSpacing:".4px",marginBottom:4}}>ARIA</div>
                      {h.q}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:11,alignItems:"flex-start",paddingLeft:39}}>
                    <div style={{flex:1,padding:"13px 16px",background:"rgba(15,30,55,.7)",borderRadius:12,border:"1px solid #0f1e35",fontSize:14,lineHeight:1.7,color:"#e2e8f0"}}>
                      <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:".4px",marginBottom:4}}>YOU</div>
                      {h.a}
                    </div>
                  </div>
                </div>
              ))}

              {(loading||currentQ)&&(
                <div style={{display:"flex",gap:11,alignItems:"flex-start"}} className="fadeIn">
                  <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>◈</div>
                  <div className="card" style={{padding:"13px 16px",fontSize:14,lineHeight:1.7,color:"#cbd5e1",borderLeft:"2px solid rgba(99,102,241,.3)",flex:1}}>
                    <div style={{fontSize:9,color:"#6366f1",fontWeight:700,letterSpacing:".4px",marginBottom:6}}>ARIA</div>
                    {loading&&!currentQ ? <TypingDots/> : currentQ}
                  </div>
                </div>
              )}
            </div>

            {/* Answer input */}
            {currentQ&&!loading&&(
              <div style={{padding:"14px 22px",borderTop:"1px solid #0f1e35",display:"flex",gap:10,alignItems:"flex-end"}} className="fadeUp">
                <VoiceButton
                  onTranscript={t=>setUserAnswer(prev=>(prev+" "+t).trim())}
                  disabled={loading}
                />
                <textarea
                  ref={answerRef}
                  value={userAnswer}
                  onChange={e=>setUserAnswer(e.target.value)}
                  onKeyDown={handleKey}
                  className="answer-box"
                  rows={3}
                  placeholder="Type your answer… (Ctrl+Enter to submit)"
                />
                <button className="glow-btn" onClick={handleAnswer} disabled={loading||!userAnswer.trim()}
                  style={{padding:"0 22px",height:80,borderRadius:10,fontSize:13,flexShrink:0,alignSelf:"stretch"}}>
                  {qIdx<QS_PER_SKILL-1?"Next →":skillIdx<(extraction.skills.length-1)?"Score & Next →":"Finish →"}
                </button>
              </div>
            )}
          </div>

          {/* Right panel — live scores */}
          <div style={{width:210,borderLeft:"1px solid #0f1e35",padding:18,flexShrink:0,overflowY:"auto"}}>
            <p style={{fontSize:10,fontWeight:700,color:"#334155",letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 14px"}}>Live Scores</p>
            {scoredSkills.length===0&&<p style={{fontSize:12,color:"#334155",lineHeight:1.5}}>Scores appear after each skill is completed.</p>}
            {scoredSkills.map(s=>(
              <div key={s.name} style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{s.name}</span>
                  <span style={{fontSize:10,color:scores[s.name]?.score>=7?"#10b981":scores[s.name]?.score>=4?"#f59e0b":"#ef4444",fontWeight:700}}>{scores[s.name]?.level}</span>
                </div>
                <ScoreBar score={scores[s.name]?.score||0}/>
              </div>
            ))}
            {scoredSkills.length>=2&&(
              <div style={{marginTop:20}}>
                <p style={{fontSize:10,fontWeight:700,color:"#334155",letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 10px"}}>Dependency Map</p>
                <DependencyGraph skills={extraction.skills} scores={scores}/>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REPORT ── */}
      {phase===PHASES.REPORT&&plan&&extraction&&(
        <div style={{flex:1,overflowY:"auto",position:"relative",zIndex:1}}>
          <div style={{maxWidth:1080,margin:"0 auto",padding:"32px 26px"}} className="fadeIn">

            {/* Hero */}
            <div className="card" style={{padding:30,marginBottom:24,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-80,right:-80,width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
              <div style={{display:"flex",gap:28,alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <p style={{fontSize:10,color:"#6366f1",fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 8px"}}>Assessment Complete</p>
                  <h2 style={{margin:"0 0 4px",fontSize:28,fontWeight:700,letterSpacing:"-0.8px"}}>{extraction.candidateName}</h2>
                  <p style={{fontSize:14,color:"#475569",margin:"0 0 18px"}}>for <span style={{color:"#94a3b8",fontWeight:500}}>{extraction.targetRole}</span></p>
                  <p style={{fontSize:14,color:"#94a3b8",lineHeight:1.7,margin:"0 0 18px",maxWidth:540}}>{plan.executiveSummary}</p>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <span className="verdict" style={{background:hireBg(plan.hiringRecommendation),color:hireColor(plan.hiringRecommendation),border:`1px solid ${hireColor(plan.hiringRecommendation)}33`}}>
                      {plan.hiringRecommendation}
                    </span>
                    <span style={{fontSize:13,color:"#64748b",padding:"5px 14px",border:"1px solid #1e293b",borderRadius:20}}>
                      ⏱ {plan.timeToJobReady}
                    </span>
                  </div>
                </div>
                <div style={{textAlign:"center",flexShrink:0}}>
                  <div style={{position:"relative",width:96,height:96}}>
                    <svg viewBox="0 0 96 96" style={{width:96,height:96,transform:"rotate(-90deg)"}}>
                      <circle cx={48} cy={48} r={40} fill="none" stroke="#0f172a" strokeWidth={7}/>
                      <circle cx={48} cy={48} r={40} fill="none" stroke={readColor(plan.overallReadiness)} strokeWidth={7}
                        strokeDasharray={`${2*Math.PI*40}`}
                        strokeDashoffset={2*Math.PI*40*(1-plan.overallReadiness/100)}
                        strokeLinecap="round" style={{transition:"stroke-dashoffset 1.5s ease"}}/>
                    </svg>
                    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:20,fontWeight:700,color:readColor(plan.overallReadiness),lineHeight:1}}>{plan.overallReadiness}</span>
                      <span style={{fontSize:9,color:"#475569",marginTop:2}}>readiness</span>
                    </div>
                  </div>
                  <div style={{marginTop:10}}><RadarChart skills={radarData}/></div>
                </div>
              </div>
            </div>

            {/* Skill breakdown */}
            <div className="card" style={{padding:22,marginBottom:22}}>
              <p style={{fontSize:10,fontWeight:700,color:"#475569",letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 18px"}}>Proficiency Breakdown</p>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {extraction.skills.map(s=>{
                  const sc = scores[s.name];
                  const isExp = expandedSkill===s.name;
                  const col = sc?(sc.score>=7?"#10b981":sc.score>=4?"#f59e0b":"#ef4444"):"#334155";
                  return (
                    <div key={s.name} onClick={()=>sc&&setExpandedSkill(isExp?null:s.name)}
                      style={{padding:"10px 12px",borderRadius:10,cursor:sc?"pointer":"default",
                        background:isExp?"#0a1628":"transparent",
                        border:isExp?"1px solid #0f1e35":"1px solid transparent",transition:"all .2s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
                        <span style={{fontSize:13,fontWeight:600,minWidth:140}}>{s.name}</span>
                        <span className="skill-pill" style={{background:s.jdRequirement==="required"?"rgba(99,102,241,.12)":"rgba(30,41,59,.5)",color:s.jdRequirement==="required"?"#818cf8":"#475569"}}>
                          {s.jdRequirement}
                        </span>
                        {sc&&<span style={{fontSize:11,color:col,fontWeight:600,marginLeft:"auto"}}>{sc.level}</span>}
                        {sc&&<span style={{fontSize:10,color:"#334155"}}>{isExp?"▲":"▼"}</span>}
                      </div>
                      {sc?<ScoreBar score={sc.score}/>:<div style={{height:5,background:"#0f172a",borderRadius:3}}/>}
                      {isExp&&sc&&(
                        <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #0f1e35"}} className="fadeIn">
                          <p style={{fontSize:13,color:"#94a3b8",lineHeight:1.6,margin:"0 0 10px"}}>{sc.rationale}</p>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                            {sc.strengths?.length>0&&(
                              <div>
                                <p style={{fontSize:10,fontWeight:700,color:"#10b981",letterSpacing:".4px",margin:"0 0 5px"}}>STRENGTHS</p>
                                {sc.strengths.map(x=><p key={x} style={{fontSize:12,color:"#64748b",margin:"0 0 3px"}}>· {x}</p>)}
                              </div>
                            )}
                            {sc.criticalGaps?.length>0&&(
                              <div>
                                <p style={{fontSize:10,fontWeight:700,color:"#ef4444",letterSpacing:".4px",margin:"0 0 5px"}}>CRITICAL GAPS</p>
                                {sc.criticalGaps.map(x=><p key={x} style={{fontSize:12,color:"#64748b",margin:"0 0 3px"}}>· {x}</p>)}
                              </div>
                            )}
                          </div>
                          {sc.adjacentSkills?.length>0&&(
                            <p style={{fontSize:12,color:"#475569",marginTop:8,marginBottom:0}}>
                              Explore next:{sc.adjacentSkills.map(x=><span key={x} style={{color:"#818cf8",marginLeft:6}}>#{x}</span>)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dependency graph */}
            <div className="card" style={{padding:22,marginBottom:22}}>
              <p style={{fontSize:10,fontWeight:700,color:"#475569",letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 14px"}}>Skill Dependency Map</p>
              <DependencyGraph skills={extraction.skills} scores={scores}/>
              <p style={{fontSize:11,color:"#334155",margin:"10px 0 0"}}>
                <span style={{color:"#10b981"}}>■</span> Strong &nbsp;
                <span style={{color:"#f59e0b"}}>■</span> Developing &nbsp;
                <span style={{color:"#ef4444"}}>■</span> Gap
              </p>
            </div>

            {/* Tabs */}
            <div style={{display:"flex",gap:3,marginBottom:18,padding:4,background:"#080f1a",border:"1px solid #0f1e35",borderRadius:10,width:"fit-content"}}>
              {[["plan","Learning Plan"],["schedule","Weekly Schedule"],["milestones","30-Day Goals"],["tips","Interview Tips"]].map(([k,l])=>(
                <button key={k} className={`tab-btn ${activeTab===k?"tab-active":""}`} onClick={()=>setActiveTab(k)}>{l}</button>
              ))}
            </div>

            {/* Plan tab */}
            {activeTab==="plan"&&(
              <div style={{display:"flex",flexDirection:"column",gap:18}} className="fadeIn">
                {plan.prioritySkills?.map((ps,i)=>(
                  <div key={ps.skill} className="card" style={{padding:26}}>
                    <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:18}}>
                      <div style={{width:34,height:34,borderRadius:9,background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#818cf8",flexShrink:0}}>{i+1}</div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                          <span style={{fontSize:16,fontWeight:700}}>{ps.skill}</span>
                          <span style={{fontSize:12,color:"#475569"}}>{ps.currentScore} → <span style={{color:"#10b981"}}>{ps.targetScore}</span></span>
                          <span style={{marginLeft:"auto",fontSize:11,color:"#64748b",background:"#0f172a",padding:"3px 10px",borderRadius:20,border:"1px solid #1e293b"}}>{ps.totalWeeks}w · {ps.weeklyHours}h/wk</span>
                        </div>
                        <p style={{color:"#64748b",fontSize:13,margin:0}}>{ps.rationale}</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
                      <span style={{fontSize:11,color:"#334155",minWidth:30}}>now {ps.currentScore}</span>
                      <div style={{flex:1,height:4,background:"#0f172a",borderRadius:2,overflow:"hidden",position:"relative"}}>
                        <div style={{width:(ps.currentScore/10*100)+"%",height:"100%",background:"rgba(239,68,68,.6)",borderRadius:2}}/>
                        <div style={{position:"absolute",left:(ps.targetScore/10*100)+"%",top:-2,bottom:-2,width:2,background:"#10b981",borderRadius:1}}/>
                      </div>
                      <span style={{fontSize:11,color:"#10b981",minWidth:40}}>goal {ps.targetScore}</span>
                    </div>

                    {/* Learning path */}
                    {ps.learningPath?.length>0&&(
                      <div style={{display:"flex",gap:10,marginBottom:18,overflowX:"auto",paddingBottom:4}}>
                        {ps.learningPath.map((lp,li)=>(
                          <div key={li} style={{flexShrink:0,minWidth:150,padding:13,borderRadius:9,background:"rgba(99,102,241,.05)",border:"1px solid rgba(99,102,241,.1)"}}>
                            <p style={{fontSize:9,fontWeight:700,color:"#6366f1",margin:"0 0 4px",letterSpacing:".4px"}}>{(lp.week||"").toUpperCase()}</p>
                            <p style={{fontSize:12,color:"#94a3b8",margin:"0 0 5px",fontWeight:500}}>{lp.focus}</p>
                            <p style={{fontSize:11,color:"#475569",margin:0}}>{lp.outcome}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Resources */}
                    {ps.resources?.length>0&&(
                      <div>
                        <p style={{fontSize:10,fontWeight:700,color:"#334155",letterSpacing:".4px",textTransform:"uppercase",margin:"0 0 10px"}}>Resources</p>
                        <div style={{display:"flex",flexDirection:"column",gap:7}}>
                          {ps.resources.map((r,ri)=>{
                            const key=`${ps.skill}-${ri}`;
                            const isExpR=expandedRes===key;
                            return (
                              <div key={ri} onClick={()=>setExpandedRes(isExpR?null:key)}
                                style={{padding:"11px 14px",background:"rgba(15,23,42,.6)",borderRadius:9,border:"1px solid #0f1e35",cursor:"pointer",transition:"border-color .2s"}}>
                                <div style={{display:"flex",alignItems:"center",gap:9}}>
                                  <BadgeType type={r.type}/>
                                  <a href={r.url} target="_blank" rel="noreferrer" className="res-link" onClick={e=>e.stopPropagation()} style={{flex:1}}>{r.title}</a>
                                  <span style={{fontSize:11,color:"#334155",flexShrink:0}}>{r.estimatedHours}h</span>
                                  {r.free&&<span style={{fontSize:10,color:"#10b981",fontWeight:700,flexShrink:0}}>FREE</span>}
                                </div>
                                {isExpR&&<p style={{fontSize:12,color:"#64748b",margin:"8px 0 0",lineHeight:1.5}} className="fadeIn">{r.whyThisOne}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Schedule tab */}
            {activeTab==="schedule"&&plan.weeklyPlan&&(
              <div className="card fadeIn" style={{padding:26}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
                  <p style={{fontSize:10,fontWeight:700,color:"#475569",letterSpacing:".5px",textTransform:"uppercase",margin:0}}>Weekly Study Rhythm</p>
                  <span style={{fontSize:13,color:"#6366f1",fontWeight:600}}>{(plan.weeklyPlan.reduce((a,d)=>a+(d.totalHours||0),0)).toFixed(1)}h / week</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {plan.weeklyPlan.map(d=>(
                    <div key={d.day} style={{display:"grid",gridTemplateColumns:"42px 1fr 1fr auto",gap:12,alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#6366f1"}}>{d.day}</span>
                      <div style={{padding:"10px 13px",background:"rgba(99,102,241,.05)",borderRadius:8,border:"1px solid rgba(99,102,241,.1)"}}>
                        <span style={{fontSize:9,color:"#6366f1",display:"block",fontWeight:700,marginBottom:2}}>AM</span>
                        <span style={{fontSize:12,color:"#94a3b8"}}>{d.morning||"—"}</span>
                      </div>
                      <div style={{padding:"10px 13px",background:"rgba(30,41,59,.35)",borderRadius:8,border:"1px solid #0f1e35"}}>
                        <span style={{fontSize:9,color:"#475569",display:"block",fontWeight:700,marginBottom:2}}>PM</span>
                        <span style={{fontSize:12,color:"#64748b"}}>{d.evening||"—"}</span>
                      </div>
                      <span style={{fontSize:12,color:"#475569",minWidth:24,textAlign:"right"}}>{d.totalHours}h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Milestones tab */}
            {activeTab==="milestones"&&plan.thirtyDayMilestones&&(
              <div className="card fadeIn" style={{padding:26}}>
                <p style={{fontSize:10,fontWeight:700,color:"#475569",letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 22px"}}>30-Day Milestones</p>
                <div style={{position:"relative",paddingLeft:22}}>
                  <div style={{position:"absolute",left:6,top:8,bottom:8,width:1,background:"linear-gradient(to bottom,#6366f1,rgba(99,102,241,.1))",borderRadius:1}}/>
                  {plan.thirtyDayMilestones.map((m,i)=>(
                    <div key={i} style={{display:"flex",gap:16,marginBottom:20,position:"relative"}} className="fadeIn">
                      <div style={{width:13,height:13,borderRadius:"50%",background:"#6366f1",border:"2px solid #05080f",boxShadow:"0 0 8px rgba(99,102,241,.5)",position:"absolute",left:-22,top:3,flexShrink:0}}/>
                      <div style={{padding:"13px 16px",background:"rgba(15,23,42,.8)",borderRadius:9,border:"1px solid #0f1e35",flex:1}}>
                        <span style={{fontSize:10,color:"#6366f1",fontWeight:700,marginRight:8}}>#{i+1}</span>
                        <span style={{fontSize:13,color:"#94a3b8",lineHeight:1.6}}>{m}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips tab */}
            {activeTab==="tips"&&plan.interviewTips&&(
              <div className="card fadeIn" style={{padding:26}}>
                <p style={{fontSize:10,fontWeight:700,color:"#475569",letterSpacing:".5px",textTransform:"uppercase",margin:"0 0 22px"}}>Interview Tips — Based on Your Gaps</p>
                {plan.interviewTips.map((t,i)=>(
                  <div key={i} style={{display:"flex",gap:13,marginBottom:16,alignItems:"flex-start"}}>
                    <div style={{width:26,height:26,borderRadius:7,background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.18)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#818cf8",flexShrink:0}}>{i+1}</div>
                    <p style={{fontSize:14,color:"#94a3b8",lineHeight:1.65,margin:0}}>{t}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{textAlign:"center",padding:"28px 0 8px",color:"#1e293b",fontSize:11}}>
              SkillSense · Aria AI · {new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
