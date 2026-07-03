import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { TEMPLATES, renderResumeHtml, blankResume } from '../templates/index.js';
import { SAMPLE_RESUMES, getSample } from '../templates/samples.js';

const router = Router();
router.use(requireAuth);

// List the built-in ATS templates (with their paired sample content).
router.get('/', (req, res) => {
  res.json({
    templates: TEMPLATES.map((t) => ({ ...t, hasSample: Boolean(SAMPLE_RESUMES[t.id]) })),
  });
});

// Get a template's sample resume JSON (to start editing from).
router.get('/:id/sample', (req, res) => {
  const sample = getSample(req.params.id);
  res.json({ resume: sample });
});

// Live preview: render arbitrary resume JSON into a template's HTML.
router.post('/:id/preview', (req, res) => {
  const resume = req.body?.resume || blankResume();
  const html = renderResumeHtml(resume, req.params.id);
  res.json({ html });
});

// Blank resume skeleton.
router.get('/blank/new', (req, res) => {
  res.json({ resume: blankResume() });
});

export default router;
