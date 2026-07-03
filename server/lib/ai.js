// AI resume generation.
//
// Strategy (per the user's choice): try Anthropic first, then OpenAI, then a
// deterministic local template-merge fallback so the feature always produces
// *something* usable even with no API keys configured.
//
// The model's job: given (a) a base resume — the user's uploaded/parsed resume
// or a chosen sample, and (b) a parsed job description, produce a tailored
// resume as canonical JSON (templates/index.js RESUME_SCHEMA). We then render
// that JSON into the chosen template so format/layout stay consistent.

import { config } from '../config.js';
import { blankResume } from '../templates/index.js';
import { getSample } from '../templates/samples.js';

const SYSTEM_PROMPT = `You are an expert resume writer and career coach specializing in ATS (Applicant Tracking System) optimization.

You will receive a BASE RESUME (the candidate's real background) and a TARGET JOB (title + description). Produce a tailored resume that:
- Keeps ALL facts truthful — never invent employers, degrees, dates, or metrics that are not present or clearly implied in the base resume.
- CRITICAL: The TARGET JOB is the role the candidate is APPLYING FOR. It is NOT part of their work history. NEVER add the target job's company, role, or responsibilities as an entry in "experience". Every entry in "experience" MUST correspond to an employer that already appears in the BASE RESUME. Do not copy responsibilities from the job description into experience bullets as if the candidate performed them.
- For "title", write a short headline describing the candidate's own profession aligned to the target role type, and preserve the candidate's seniority level from the base resume (e.g. "Senior Software Engineer" rather than just "Software Engineer" when the base resume shows senior-level experience). Never phrase it as a position "at" the target company, and never claim a job the candidate does not hold.
- Reorders, rephrases, and emphasizes the candidate's real experience to match the job's keywords and requirements, putting the most relevant roles and bullets first.
- Mirrors important terminology from the job description (skills, tools, responsibilities) where the candidate genuinely has them, using the job's exact wording so the resume passes ATS keyword screening.

WRITING RULES (apply to every bullet, the summary, and skills):
- Bullets: start each with a strong past-tense action verb (Led, Built, Designed, Reduced, Shipped, Automated, Scaled) — never weak openers like "Responsible for", "Helped", "Worked on", "Assisted with". No first-person pronouns ("I", "my").
- Quantify impact wherever the base resume supports it: use real numbers, %, $, scale, latency, users, time saved. Prefer the "Accomplished [X] by doing [Y], resulting in [Z]" shape. NEVER invent or inflate metrics that are not present or clearly implied in the base resume — if no number exists, convey scope and outcome qualitatively instead.
- Keep each bullet to one tight sentence. Show 3-5 of the strongest, most job-relevant bullets per role; drop filler. Vary the action verbs across bullets.
- Weave the job description's hard skills and tools naturally into bullets and the summary where the candidate genuinely has them, using the exact phrasing (e.g. "CI/CD pipelines", "REST APIs").
- Summary: 2-3 sentences. Lead with seniority + years of experience + specialization, then the concrete value the candidate brings to THIS role, mirroring its key requirements.
- Skills: group logically and order the most job-relevant group and items first. Use the job description's exact term forms for hard skills the candidate genuinely has.
- Ban clichés and filler: no "team player", "detail-oriented", "hard worker", "results-driven", "go-getter", buzzword soup, or generic adjectives unsupported by evidence.

Output ONLY a single JSON object, no markdown fences, matching exactly this shape:
{
  "name": string,
  "title": string,                // target-role-aligned headline
  "contact": { "email": string, "phone": string, "location": string, "website": string, "linkedin": string, "github": string },
  "summary": string,
  "skills": [ { "group": string, "items": [string] } ],
  "experience": [ { "company": string, "role": string, "location": string, "start": string, "end": string, "bullets": [string] } ],
  "education": [ { "school": string, "degree": string, "location": string, "start": string, "end": string, "details": string } ],
  "projects": [ { "name": string, "description": string, "tech": [string], "link": string } ],
  "certifications": [string],
  "awards": [string]
}
Use empty strings/arrays for missing data. Do not include any commentary.`;

function buildUserPrompt(baseResume, job, userPrompt) {
  const extra = userPrompt && userPrompt.trim()
    ? `\nADDITIONAL INSTRUCTIONS FROM THE USER (follow these closely, but never fabricate facts):\n${userPrompt.trim()}\n`
    : '';
  return `BASE RESUME (the candidate's real background):
${typeof baseResume === 'string' ? baseResume : JSON.stringify(baseResume, null, 2)}

TARGET JOB:
Title: ${job.title || '(not specified)'}
Company: ${job.company || '(not specified)'}
Location: ${job.location || '(not specified)'}

Job description:
${job.description || '(no description provided)'}
${extra}
Generate the tailored resume JSON now.`;
}

function stripToJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  // Remove ```json ... ``` fences if present.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // Grab the outermost {...}
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  const slice = t.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

async function generateWithAnthropic(baseResume, job, userPrompt) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const msg = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(baseResume, job, userPrompt) }],
  });
  const text = (msg.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return stripToJson(text);
}

async function generateWithOpenAI(baseResume, job, userPrompt) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.openai.apiKey });
  const res = await client.chat.completions.create({
    model: config.openai.model,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(baseResume, job, userPrompt) },
    ],
  });
  const text = res.choices?.[0]?.message?.content || '';
  return stripToJson(text);
}

// Deterministic, no-API fallback: merge the base resume with job keywords so the
// result is still tailored-ish (keyword-injected summary + skills surfaced).
function generateLocally(baseResume, job, templateId, userPrompt) {
  const base =
    baseResume && typeof baseResume === 'object' && baseResume.name
      ? baseResume
      : typeof baseResume === 'string' && baseResume.trim()
      ? parseTextResumeRough(baseResume)
      : getSample(templateId);

  const out = { ...blankResume(), ...base };
  // Fold the user's custom instructions into the keyword pool so the local
  // fallback also reflects them (the real AI providers use them directly).
  const keywords = extractKeywords(`${job.description || ''}\n${userPrompt || ''}`);
  const roleLine = job.title ? `${job.title}` : out.title || 'Professional';

  out.title = job.title || out.title;
  out.summary =
    `${roleLine} candidate. ` +
    (out.summary ? out.summary + ' ' : '') +
    (keywords.length ? `Relevant strengths: ${keywords.slice(0, 8).join(', ')}.` : '') +
    (userPrompt && userPrompt.trim() ? ` Note: ${userPrompt.trim()}` : '');

  // Surface matching keywords into a "Job-relevant skills" group at the top.
  if (keywords.length) {
    const relevant = { group: 'Job-relevant skills', items: keywords.slice(0, 12) };
    if (Array.isArray(out.skills) && out.skills.length && typeof out.skills[0] === 'object') {
      out.skills = [relevant, ...out.skills];
    } else {
      const existing = Array.isArray(out.skills) ? out.skills : [];
      out.skills = [relevant, { group: 'Additional', items: existing }];
    }
  }
  return out;
}

function parseTextResumeRough(text) {
  // Very light heuristic parse of plain-text resume into the schema.
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const r = blankResume();
  r.name = lines[0] || '';
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (emailMatch) r.contact.email = emailMatch[0];
  if (phoneMatch) r.contact.phone = phoneMatch[0].trim();
  r.summary = lines.slice(1, 4).join(' ');
  return r;
}

const STOPWORDS = new Set(
  'the a an and or to of in for with on at by as is are be we you our your their this that will have has from not but they job role work team strong years experience etc using use across into within able skills required preferred plus must should can who what when where which more most over under per about than then them also may include including responsibilities requirements qualifications'.split(
    /\s+/
  )
);

function extractKeywords(desc) {
  const tokens = String(desc)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s/-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .filter((w) => /[a-z]/.test(w))
    .slice(0, 20)
    .map((w) => w.replace(/\b\w/, (c) => c.toUpperCase()));
}

/**
 * Generate a tailored resume.
 * @returns {{ resume: object, provider: string, warning?: string }}
 */
export async function generateResume({ baseResume, job, templateId = 'classic', prompt = '' }) {
  const errors = [];

  if (config.anthropic.apiKey) {
    try {
      const resume = await generateWithAnthropic(baseResume, job, prompt);
      if (resume) return { resume: normalize(resume), provider: 'anthropic' };
      errors.push('Anthropic returned no valid JSON');
      console.warn('[ai] Anthropic returned no valid JSON; trying next provider.');
    } catch (err) {
      const msg = err?.message || String(err);
      errors.push(`Anthropic error: ${msg}`);
      // Surface the real reason (bad key, no credits, model access, etc.) in the server log.
      console.warn(`[ai] Anthropic failed (status ${err?.status ?? '?'}): ${msg} — falling back.`);
    }
  }

  if (config.openai.apiKey) {
    try {
      const resume = await generateWithOpenAI(baseResume, job, prompt);
      if (resume) return { resume: normalize(resume), provider: 'openai' };
      errors.push('OpenAI returned no valid JSON');
      console.warn('[ai] OpenAI returned no valid JSON; using local fallback.');
    } catch (err) {
      const msg = err?.message || String(err);
      errors.push(`OpenAI error: ${msg}`);
      console.warn(`[ai] OpenAI failed (status ${err?.status ?? '?'}): ${msg} — using local fallback.`);
    }
  }

  const resume = generateLocally(baseResume, job, templateId, prompt);
  const warning =
    errors.length > 0
      ? `AI providers unavailable (${errors.join('; ')}). Used local keyword-merge fallback.`
      : 'No AI API key configured — used local keyword-merge fallback. Add ANTHROPIC_API_KEY or OPENAI_API_KEY for full AI tailoring.';
  return { resume: normalize(resume), provider: 'local-fallback', warning };
}

// Ensure the object has every expected field so the renderer never breaks.
function normalize(resume) {
  const b = blankResume();
  const r = { ...b, ...(resume || {}) };
  r.contact = { ...b.contact, ...(resume?.contact || {}) };
  for (const k of ['skills', 'experience', 'education', 'projects', 'certifications', 'awards']) {
    if (!Array.isArray(r[k])) r[k] = [];
  }
  return r;
}
