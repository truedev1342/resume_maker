import { Router } from 'express';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import multer from 'multer';
import { requireAuth } from '../lib/auth.js';
import {
  readCollection,
  upsert,
  removeById,
  newId,
  writeGenerated,
  readGenerated,
  deleteGenerated,
} from '../lib/storage.js';
import { extractResumeTextFromBuffer } from '../lib/resumeParser.js';
import { generateResume } from '../lib/ai.js';
import { renderResumeHtml } from '../templates/index.js';
import { getSample } from '../templates/samples.js';
import { htmlFileToPdf, pdfAvailable } from '../lib/pdf.js';

const router = Router();
router.use(requireAuth);

// ── Uploads ────────────────────────────────────────────────────────────────────
// The uploaded PDF is only needed to extract its text once, which we then store
// on the record. So we keep the file in memory and never touch disk — this works
// unchanged on a read-only serverless filesystem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      return cb(null, true);
    }
    cb(new Error('Only PDF files are accepted.'));
  },
});

router.post('/upload', (req, res) => {
  upload.single('resume')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const record = {
      id: newId('upl'),
      owner: req.session.user.username,
      originalName: req.file.originalname,
      size: req.file.size,
      createdAt: new Date().toISOString(),
      textExtracted: false,
      text: '',
    };

    // Best-effort text extraction; keep the record even if parsing fails.
    try {
      const { text, pages } = await extractResumeTextFromBuffer(req.file.buffer);
      record.text = text;
      record.pages = pages;
      record.textExtracted = true;
    } catch (e) {
      record.parseError = e.message;
    }

    await upsert('uploads', record);
    const { text, ...meta } = record;
    res.status(201).json({ upload: meta, textExtracted: record.textExtracted, parseError: record.parseError });
  });
});

router.get('/uploads', async (req, res) => {
  const user = req.session.user;
  let uploads = await readCollection('uploads', []);
  if (!user.isAdmin) uploads = uploads.filter((u) => u.owner === user.username);
  res.json({ uploads: uploads.map(({ text, ...m }) => m) });
});

router.delete('/uploads/:id', async (req, res) => {
  const uploads = await readCollection('uploads', []);
  const item = uploads.find((u) => u.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Upload not found.' });
  if (!req.session.user.isAdmin && item.owner !== req.session.user.username) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  await removeById('uploads', req.params.id);
  res.json({ ok: true });
});

// ── Generate a tailored resume ────────────────────────────────────────────────
// Body: { templateId, job: {title, company, location, description}, uploadId?, baseResume? }
router.post('/generate', async (req, res) => {
  const { templateId = 'classic', job = {}, uploadId, baseResume, prompt = '' } = req.body || {};
  if (!job || (!job.description && !job.title)) {
    return res.status(400).json({ error: 'A job (description or title) is required to tailor a resume.' });
  }

  // Resolve the base resume: explicit JSON > uploaded PDF text > chosen sample.
  let base = baseResume;
  let baseSource = 'provided';
  if (!base && uploadId) {
    const uploads = await readCollection('uploads', []);
    const up = uploads.find((u) => u.id === uploadId);
    if (!up) return res.status(404).json({ error: 'Selected uploaded resume not found.' });
    if (up.text) {
      base = up.text;
      baseSource = 'upload';
    }
  }
  if (!base) {
    base = getSample(templateId);
    baseSource = 'sample';
  }

  let result;
  try {
    result = await generateResume({ baseResume: base, job, templateId, prompt });
  } catch (err) {
    console.error('[resumes/generate]', err);
    return res.status(500).json({ error: 'Resume generation failed unexpectedly.' });
  }

  // Render + persist. Guard this block: a disk hiccup here (e.g. antivirus
  // briefly locking a freshly-written file → EPERM/EBUSY) would otherwise reject
  // in this async handler and — under Express 4, which does not forward async
  // errors — crash the whole server process instead of failing just this request.
  try {
    const id = newId('res');
    const html = renderResumeHtml(result.resume, templateId);
    await writeGenerated(id, { html, data: result.resume });

    const meta = {
      id,
      owner: req.session.user.username,
      title: result.resume.name ? `${result.resume.name} — ${job.title || 'Resume'}` : job.title || 'Resume',
      jobTitle: job.title || '',
      company: job.company || '',
      templateId,
      provider: result.provider,
      baseSource,
      prompt: prompt ? String(prompt).slice(0, 1000) : '',
      createdAt: new Date().toISOString(),
    };
    await upsert('resumes', meta);

    res.status(201).json({ resume: meta, data: result.resume, html, provider: result.provider, warning: result.warning });
  } catch (err) {
    console.error('[resumes/generate] save failed', err);
    return res.status(500).json({ error: 'Generated the resume but failed to save it. Please try again.' });
  }
});

// Save manual edits to a generated resume.
router.put('/:id', async (req, res) => {
  const resumes = await readCollection('resumes', []);
  const meta = resumes.find((r) => r.id === req.params.id);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  if (!req.session.user.isAdmin && meta.owner !== req.session.user.username)
    return res.status(403).json({ error: 'Not allowed.' });

  const resume = req.body?.resume;
  const templateId = req.body?.templateId || meta.templateId;
  if (!resume) return res.status(400).json({ error: 'No resume data provided.' });

  const html = renderResumeHtml(resume, templateId);
  await writeGenerated(meta.id, { html, data: resume });
  meta.templateId = templateId;
  meta.updatedAt = new Date().toISOString();
  if (resume.name) meta.title = `${resume.name} — ${meta.jobTitle || 'Resume'}`;
  await upsert('resumes', meta);
  res.json({ resume: meta, html });
});

router.get('/', async (req, res) => {
  const user = req.session.user;
  let resumes = await readCollection('resumes', []);
  if (!user.isAdmin) resumes = resumes.filter((r) => r.owner === user.username);
  resumes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json({ resumes });
});

router.get('/:id/data', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  const gen = await readGenerated(meta.id);
  if (!gen) return res.status(404).json({ error: 'Resume files missing.' });
  res.json({ resume: meta, data: gen.data, html: gen.html });
});

// Rendered HTML (used for in-app preview and print-to-PDF).
router.get('/:id/view', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).send('Not found');
  const gen = await readGenerated(meta.id);
  if (!gen) return res.status(404).send('Not found');
  res.type('html').send(gen.html);
});

// Download the resume HTML file (raw source / fallback).
router.get('/:id/download', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  const gen = await readGenerated(meta.id);
  if (!gen) return res.status(404).json({ error: 'File missing.' });
  const safe = (meta.title || 'resume').replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.html"`);
  res.send(gen.html);
});

// Download the resume as a real PDF, rendered from the stored HTML via headless
// Chrome/Edge. Falls back with a clear error if no browser is available (e.g. on
// serverless hosts) — the client can then use "Download HTML" + browser print.
router.get('/:id/pdf', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  const gen = await readGenerated(meta.id);
  if (!gen) return res.status(404).json({ error: 'File missing.' });

  // htmlFileToPdf needs a path, and Chrome can't read from Redis — stage the HTML
  // in a temp file (os.tmpdir() is writable even on serverless).
  const tmpFile = path.join(os.tmpdir(), `resume-${meta.id}-${newId('t')}.html`);
  try {
    await fsp.writeFile(tmpFile, gen.html, 'utf8');
    const pdf = await htmlFileToPdf(tmpFile);
    const safe = (meta.title || 'resume').replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.end(pdf);
  } catch (err) {
    console.error('[resumes/pdf]', err);
    const hint = (await pdfAvailable())
      ? 'PDF rendering failed. Try again, or use "Download HTML" and print to PDF from your browser.'
      : 'Server-side PDF export needs Chrome or Edge, which is unavailable here. Use "Download HTML" and print to PDF from your browser instead.';
    return res.status(500).json({ error: hint });
  } finally {
    await fsp.unlink(tmpFile).catch(() => {});
  }
});

router.delete('/:id', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  await deleteGenerated(meta.id);
  await removeById('resumes', meta.id);
  res.json({ ok: true });
});

async function findResume(req) {
  const resumes = await readCollection('resumes', []);
  const meta = resumes.find((r) => r.id === req.params.id);
  if (!meta) return null;
  if (!req.session.user.isAdmin && meta.owner !== req.session.user.username) return null;
  return meta;
}

export default router;
