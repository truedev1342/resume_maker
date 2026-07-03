import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import multer from 'multer';
import { requireAuth } from '../lib/auth.js';
import { UPLOADS_DIR, GENERATED_DIR } from '../config.js';
import { readCollection, writeCollection, upsert, removeById, newId } from '../lib/storage.js';
import { extractResumeText } from '../lib/resumeParser.js';
import { generateResume } from '../lib/ai.js';
import { renderResumeHtml } from '../templates/index.js';
import { getSample } from '../templates/samples.js';
import { htmlFileToPdf, pdfAvailable } from '../lib/pdf.js';

const router = Router();
router.use(requireAuth);

// ── Uploads (sample/original resumes saved to a folder, no DB) ─────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 80);
    cb(null, `${newId('upl')}__${safe}`);
  },
});
const upload = multer({
  storage,
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
      id: req.file.filename.split('__')[0],
      owner: req.session.user.username,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      path: path.join('storage', 'uploads', req.file.filename),
      size: req.file.size,
      createdAt: new Date().toISOString(),
      textExtracted: false,
      text: '',
    };

    // Best-effort text extraction; keep the file even if parsing fails.
    try {
      const { text, pages } = await extractResumeText(req.file.path);
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
  try {
    await fsp.unlink(path.join(UPLOADS_DIR, item.storedName));
  } catch {}
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
    await fsp.writeFile(path.join(GENERATED_DIR, `${id}.html`), html, 'utf8');
    await fsp.writeFile(path.join(GENERATED_DIR, `${id}.json`), JSON.stringify(result.resume, null, 2), 'utf8');

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
  await fsp.writeFile(path.join(GENERATED_DIR, `${meta.id}.html`), html, 'utf8');
  await fsp.writeFile(path.join(GENERATED_DIR, `${meta.id}.json`), JSON.stringify(resume, null, 2), 'utf8');
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
  try {
    const json = await fsp.readFile(path.join(GENERATED_DIR, `${meta.id}.json`), 'utf8');
    const html = await fsp.readFile(path.join(GENERATED_DIR, `${meta.id}.html`), 'utf8');
    res.json({ resume: meta, data: JSON.parse(json), html });
  } catch {
    res.status(404).json({ error: 'Resume files missing.' });
  }
});

// Rendered HTML (used for in-app preview and print-to-PDF).
router.get('/:id/view', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).send('Not found');
  const file = path.join(GENERATED_DIR, `${meta.id}.html`);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  res.type('html').send(await fsp.readFile(file, 'utf8'));
});

// Download the resume HTML file (raw source / fallback).
router.get('/:id/download', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  const file = path.join(GENERATED_DIR, `${meta.id}.html`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File missing.' });
  const safe = (meta.title || 'resume').replace(/[^\w.\- ]+/g, '_');
  res.download(file, `${safe}.html`);
});

// Download the resume as a real PDF, rendered from the stored HTML via headless
// Chrome/Edge. Falls back with a clear error if no browser is available.
router.get('/:id/pdf', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  const file = path.join(GENERATED_DIR, `${meta.id}.html`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File missing.' });

  try {
    const pdf = await htmlFileToPdf(file);
    const safe = (meta.title || 'resume').replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.end(pdf);
  } catch (err) {
    console.error('[resumes/pdf]', err);
    const hint = (await pdfAvailable())
      ? 'PDF rendering failed. Try again, or use "Download HTML" and print to PDF from your browser.'
      : 'PDF export needs Chrome or Edge installed on the server. Use "Download HTML" and print to PDF from your browser instead.';
    return res.status(500).json({ error: hint });
  }
});

router.delete('/:id', async (req, res) => {
  const meta = await findResume(req);
  if (!meta) return res.status(404).json({ error: 'Resume not found.' });
  for (const ext of ['html', 'json']) {
    try {
      await fsp.unlink(path.join(GENERATED_DIR, `${meta.id}.${ext}`));
    } catch {}
  }
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
