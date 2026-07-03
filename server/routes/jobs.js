import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { readCollection, writeCollection } from '../lib/storage.js';
import { parseJob } from '../lib/jobParser.js';
import { aggregateJobs } from '../lib/jobScraper.js';
import { FetchError } from '../lib/fetcher.js';

const router = Router();
router.use(requireAuth);

// Parse a single job from a link or pasted description (used by Resume Maker).
router.post('/parse', async (req, res) => {
  const { url, text } = req.body || {};
  try {
    const job = await parseJob({ url, text });
    res.json({ job });
  } catch (err) {
    if (err instanceof FetchError) {
      // Clear, suitable reason — not a generic 500.
      return res.status(422).json({ error: err.message, code: err.code, url: err.url });
    }
    console.error('[jobs/parse]', err);
    res.status(500).json({ error: 'Unexpected error while parsing the job.', code: 'INTERNAL' });
  }
});

// Aggregate jobs across all added sites. Cached; pass ?refresh=1 to re-scrape.
router.get('/', async (req, res) => {
  const sites = await readCollection('sites', []);
  if (!sites.length) {
    return res.json({ jobs: [], sources: [], cached: false, message: 'No job sites added yet. Add one to start aggregating.' });
  }

  const cache = await readCollection('jobsCache', null);
  const fresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const maxAgeMs = 10 * 60 * 1000; // 10 minutes
  if (!fresh && cache && cache.fetchedAt) {
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    const sameSites = JSON.stringify((cache.siteIds || []).slice().sort()) === JSON.stringify(sites.map((s) => s.id).sort());
    if (age < maxAgeMs && sameSites) {
      return res.json({ ...cache, cached: true });
    }
  }

  const { jobs, sources } = await aggregateJobs(sites);
  const payload = {
    jobs,
    sources,
    fetchedAt: new Date().toISOString(),
    siteIds: sites.map((s) => s.id),
    cached: false,
  };
  await writeCollection('jobsCache', payload);
  res.json(payload);
});

export default router;
