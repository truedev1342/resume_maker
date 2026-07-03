import { Router } from 'express';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { requireAdmin } from '../lib/auth.js';
import { listAccounts } from '../lib/auth.js';
import { UPLOADS_DIR, GENERATED_DIR } from '../config.js';
import { readCollection, writeCollection, removeById } from '../lib/storage.js';
import { aiProviderStatus } from '../config.js';

const router = Router();
router.use(requireAdmin);

// System overview for the admin dashboard.
router.get('/overview', async (req, res) => {
  const [uploads, resumes, sites] = await Promise.all([
    readCollection('uploads', []),
    readCollection('resumes', []),
    readCollection('sites', []),
  ]);
  res.json({
    accounts: listAccounts(),
    counts: { uploads: uploads.length, resumes: resumes.length, sites: sites.length },
    ai: aiProviderStatus(),
    storage: {
      uploadsDir: UPLOADS_DIR,
      generatedDir: GENERATED_DIR,
    },
  });
});

// Full lists (admin sees everything across all users).
router.get('/uploads', async (req, res) => {
  const uploads = await readCollection('uploads', []);
  res.json({ uploads: uploads.map(({ text, ...m }) => m) });
});

router.get('/resumes', async (req, res) => {
  const resumes = await readCollection('resumes', []);
  res.json({ resumes });
});

router.get('/users', (req, res) => {
  res.json({ users: listAccounts() });
});

// Admin can delete any upload / resume / site.
router.delete('/uploads/:id', async (req, res) => {
  const uploads = await readCollection('uploads', []);
  const item = uploads.find((u) => u.id === req.params.id);
  if (item) {
    try {
      await fsp.unlink(path.join(UPLOADS_DIR, item.storedName));
    } catch {}
  }
  await removeById('uploads', req.params.id);
  res.json({ ok: true });
});

router.delete('/resumes/:id', async (req, res) => {
  for (const ext of ['html', 'json']) {
    try {
      await fsp.unlink(path.join(GENERATED_DIR, `${req.params.id}.${ext}`));
    } catch {}
  }
  await removeById('resumes', req.params.id);
  res.json({ ok: true });
});

router.delete('/sites/:id', async (req, res) => {
  await removeById('sites', req.params.id);
  res.json({ ok: true });
});

// Clear the cached job aggregation.
router.post('/clear-jobs-cache', async (req, res) => {
  await writeCollection('jobsCache', null);
  res.json({ ok: true });
});

export default router;
