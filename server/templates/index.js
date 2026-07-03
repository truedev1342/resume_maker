// Built-in ATS-friendly resume templates.
//
// A resume is stored as canonical JSON (see RESUME_SCHEMA below). Each template
// renders that same JSON into self-contained, printable HTML. All templates are
// single-column, use real selectable text (no images/tables for layout), and
// standard section headings — i.e. they parse cleanly through ATS systems.

export const RESUME_SCHEMA = {
  name: 'string',
  title: 'string',
  contact: {
    email: 'string',
    phone: 'string',
    location: 'string',
    website: 'string',
    linkedin: 'string',
    github: 'string',
  },
  summary: 'string',
  skills: ['string'], // or [{ group: 'string', items: ['string'] }]
  experience: [
    {
      company: 'string',
      role: 'string',
      location: 'string',
      start: 'string',
      end: 'string',
      bullets: ['string'],
    },
  ],
  education: [
    { school: 'string', degree: 'string', location: 'string', start: 'string', end: 'string', details: 'string' },
  ],
  projects: [{ name: 'string', description: 'string', tech: ['string'], link: 'string' }],
  certifications: ['string'],
  awards: ['string'],
};

export const TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic ATS',
    description: 'Timeless single-column layout, neutral typography. The safest choice for any applicant tracking system.',
    accent: '#1a1a1a',
  },
  {
    id: 'modern',
    name: 'Modern Accent',
    description: 'Clean sans-serif with a subtle accent color and clear section rules. ATS-safe, slightly more design-forward.',
    accent: '#2563eb',
  },
  {
    id: 'compact',
    name: 'Compact Professional',
    description: 'Dense, space-efficient layout for senior candidates with lots of content. Still fully ATS-parseable.',
    accent: '#0f766e',
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

// ── helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nonEmpty(arr) {
  return Array.isArray(arr) ? arr.filter((x) => x && String(x).trim()) : [];
}

function dateRange(a, b) {
  const s = [a, b].map((x) => (x ? esc(x) : '')).filter(Boolean);
  return s.join(' – ');
}

function contactLine(contact = {}) {
  const parts = [];
  if (contact.email) parts.push(esc(contact.email));
  if (contact.phone) parts.push(esc(contact.phone));
  if (contact.location) parts.push(esc(contact.location));
  if (contact.website) parts.push(esc(contact.website));
  if (contact.linkedin) parts.push(esc(contact.linkedin));
  if (contact.github) parts.push(esc(contact.github));
  return parts.join('  •  ');
}

function renderSkills(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return '';
  // grouped form: [{ group, items: [] }]
  if (typeof skills[0] === 'object' && skills[0] !== null) {
    return skills
      .map(
        (g) =>
          `<p class="skill-group"><span class="skill-label">${esc(g.group)}:</span> ${nonEmpty(g.items)
            .map(esc)
            .join(', ')}</p>`
      )
      .join('');
  }
  return `<p>${nonEmpty(skills).map(esc).join('  •  ')}</p>`;
}

function sectionsHtml(r) {
  const out = [];

  if (r.summary && String(r.summary).trim()) {
    out.push(`<section><h2>Summary</h2><p>${esc(r.summary)}</p></section>`);
  }

  const skillsHtml = renderSkills(r.skills);
  if (skillsHtml) out.push(`<section><h2>Skills</h2>${skillsHtml}</section>`);

  if (nonEmpty(r.experience).length || (Array.isArray(r.experience) && r.experience.length)) {
    const items = (r.experience || [])
      .filter((e) => e && (e.company || e.role))
      .map(
        (e) => `
        <div class="entry">
          <div class="entry-head">
            <span class="entry-title">${esc(e.role)}${e.company ? ` — ${esc(e.company)}` : ''}</span>
            <span class="entry-dates">${dateRange(e.start, e.end)}</span>
          </div>
          ${e.location ? `<div class="entry-sub">${esc(e.location)}</div>` : ''}
          ${
            nonEmpty(e.bullets).length
              ? `<ul>${nonEmpty(e.bullets).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
              : ''
          }
        </div>`
      )
      .join('');
    if (items.trim()) out.push(`<section><h2>Experience</h2>${items}</section>`);
  }

  if (Array.isArray(r.projects) && r.projects.length) {
    const items = r.projects
      .filter((p) => p && (p.name || p.description))
      .map(
        (p) => `
        <div class="entry">
          <div class="entry-head">
            <span class="entry-title">${esc(p.name)}</span>
            ${p.link ? `<span class="entry-dates">${esc(p.link)}</span>` : ''}
          </div>
          ${p.description ? `<p>${esc(p.description)}</p>` : ''}
          ${nonEmpty(p.tech).length ? `<div class="entry-sub">${nonEmpty(p.tech).map(esc).join(', ')}</div>` : ''}
        </div>`
      )
      .join('');
    if (items.trim()) out.push(`<section><h2>Projects</h2>${items}</section>`);
  }

  if (Array.isArray(r.education) && r.education.length) {
    const items = r.education
      .filter((e) => e && (e.school || e.degree))
      .map(
        (e) => `
        <div class="entry">
          <div class="entry-head">
            <span class="entry-title">${esc(e.degree)}${e.school ? ` — ${esc(e.school)}` : ''}</span>
            <span class="entry-dates">${dateRange(e.start, e.end)}</span>
          </div>
          ${e.location ? `<div class="entry-sub">${esc(e.location)}</div>` : ''}
          ${e.details ? `<p>${esc(e.details)}</p>` : ''}
        </div>`
      )
      .join('');
    if (items.trim()) out.push(`<section><h2>Education</h2>${items}</section>`);
  }

  if (nonEmpty(r.certifications).length) {
    out.push(
      `<section><h2>Certifications</h2><ul>${nonEmpty(r.certifications)
        .map((c) => `<li>${esc(c)}</li>`)
        .join('')}</ul></section>`
    );
  }

  if (nonEmpty(r.awards).length) {
    out.push(
      `<section><h2>Awards</h2><ul>${nonEmpty(r.awards)
        .map((a) => `<li>${esc(a)}</li>`)
        .join('')}</ul></section>`
    );
  }

  return out.join('\n');
}

function baseCss(accent, variant) {
  const fontFamily =
    variant === 'classic'
      ? `'Georgia', 'Times New Roman', serif`
      : `'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
  const nameSize = variant === 'compact' ? '22px' : '26px';
  const gap = variant === 'compact' ? '10px' : '16px';
  const h2border =
    variant === 'modern'
      ? `border-bottom: 2px solid ${accent};`
      : variant === 'compact'
      ? `border-bottom: 1px solid #ccc;`
      : `border-bottom: 1px solid #333;`;
  return `
    :root { --accent: ${accent}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ${fontFamily};
      color: #1a1a1a;
      line-height: 1.4;
      font-size: ${variant === 'compact' ? '12.5px' : '13.5px'};
      background: #f3f4f6;
    }
    .page {
      max-width: 8.5in;
      margin: 0 auto;
      background: #fff;
      padding: 0.6in 0.7in;
    }
    header.resume-header { margin-bottom: ${gap}; }
    .resume-name {
      font-size: ${nameSize};
      font-weight: 700;
      margin: 0;
      color: ${variant === 'modern' ? accent : '#111'};
      letter-spacing: 0.2px;
    }
    .resume-title { font-size: 14px; color: #444; margin: 2px 0 6px; font-weight: 600; }
    .resume-contact { font-size: 12px; color: #333; }
    section { margin-bottom: ${gap}; }
    h2 {
      font-size: 13.5px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin: 0 0 6px;
      padding-bottom: 2px;
      color: ${variant === 'classic' ? '#111' : accent};
      ${h2border}
    }
    .entry { margin-bottom: ${variant === 'compact' ? '7px' : '10px'}; }
    .entry-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .entry-title { font-weight: 700; }
    .entry-dates { color: #555; font-size: 12px; white-space: nowrap; }
    .entry-sub { font-style: italic; color: #555; font-size: 12px; margin: 1px 0 3px; }
    ul { margin: 4px 0 0; padding-left: 18px; }
    li { margin-bottom: 2px; }
    p { margin: 3px 0; }
    .skill-group { margin: 2px 0; }
    .skill-label { font-weight: 700; }
    a { color: inherit; text-decoration: none; }
    @media print {
      body { background: #fff; }
      .page { box-shadow: none; margin: 0; max-width: none; padding: 0.5in 0.6in; }
      @page { margin: 0.4in; }
    }
  `;
}

/**
 * Render canonical resume JSON into a full, self-contained HTML document.
 * @param {object} resume  resume JSON (RESUME_SCHEMA shape)
 * @param {string} templateId  one of TEMPLATES[].id
 */
export function renderResumeHtml(resume = {}, templateId = 'classic') {
  const tpl = getTemplate(templateId);
  const r = resume || {};
  const css = baseCss(tpl.accent, tpl.id);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(r.name || 'Resume')}</title>
<style>${css}</style>
</head>
<body>
  <div class="page">
    <header class="resume-header">
      <h1 class="resume-name">${esc(r.name || 'Your Name')}</h1>
      ${r.title ? `<div class="resume-title">${esc(r.title)}</div>` : ''}
      <div class="resume-contact">${contactLine(r.contact)}</div>
    </header>
    ${sectionsHtml(r)}
  </div>
</body>
</html>`;
}

// An empty resume object for new documents / fallback rendering.
export function blankResume() {
  return {
    name: '',
    title: '',
    contact: { email: '', phone: '', location: '', website: '', linkedin: '', github: '' },
    summary: '',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    awards: [],
  };
}
