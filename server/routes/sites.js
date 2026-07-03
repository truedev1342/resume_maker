import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { readCollection, writeCollection, removeById, newId } from '../lib/storage.js';
import { isValidHttpUrl } from '../lib/fetcher.js';
import { SUPPORTED_SITES } from '../lib/jobScraper.js';

const router = Router();
router.use(requireAuth);

// Reference list of sites the aggregator can read (shown as hints in the UI).
router.get('/supported', (req, res) => {
  res.json({ supported: SUPPORTED_SITES });
});

// List all job sites (shared across users so everyone sees the same board set).
router.get('/', async (req, res) => {
  const sites = await readCollection('sites', []);
  res.json({ sites });
});

// Add a job site to aggregate (e.g. https://hiring.cafe).
router.post('/', async (req, res) => {
  const { url, name } = req.body || {};
  if (!url || !isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Please provide a valid http(s) site URL.' });
  }
  const sites = await readCollection('sites', []);
  const normalized = url.trim().replace(/\/+$/, '');
  if (sites.some((s) => s.url.replace(/\/+$/, '') === normalized)) {
    return res.status(409).json({ error: 'That site has already been added.' });
  }
  const site = {
    id: newId('site'),
    url: url.trim(),
    name: (name || hostName(url)).trim(),
    addedBy: req.session.user.username,
    createdAt: new Date().toISOString(),
  };
  sites.push(site);
  await writeCollection('sites', sites);
  res.status(201).json({ site });
});

router.delete('/:id', async (req, res) => {
  const removed = await removeById('sites', req.params.id);
  if (!removed) return res.status(404).json({ error: 'Site not found.' });
  res.json({ ok: true });
});

function hostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default router;
