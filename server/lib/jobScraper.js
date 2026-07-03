// Best-effort job aggregation from user-added sites.
//
// Many boards are JS single-page apps that cannot be scraped from raw HTML, so
// we prefer real data sources in this order:
//   1. Known ATS JSON APIs — Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee.
//   2. Job aggregators with public APIs — RemoteOK, Remotive, Arbeitnow.
//   3. hiring.cafe server-rendered data.
//   4. RSS/Atom job feeds (e.g. We Work Remotely).
//   5. schema.org JobPosting / ItemList JSON-LD embedded in the page.
//   6. Generic anchor heuristic (links that look like individual job postings).
// When none work, we return a clear, suitable reason instead of failing silently.
//
// Supported sites are described in SUPPORTED_SITES (exported for the UI).

import * as cheerio from 'cheerio';
import { fetchText, FetchError, isValidHttpUrl } from './fetcher.js';
import { newId } from './storage.js';

function normalizeJob(j, site) {
  return {
    id: j.id || newId('job'),
    title: (j.title || '').trim(),
    company: (j.company || '').trim(),
    country: (j.country || '').trim(),
    location: (j.location || '').trim(),
    salary: (j.salary || '').trim(),
    role: (j.role || j.department || '').trim(),
    employmentType: (j.employmentType || '').trim(),
    url: j.url || '',
    site: site.name || site.url,
    siteId: site.id,
    postedAt: j.postedAt || '',
  };
}

// ── Adapter: Greenhouse ───────────────────────────────────────────────────────
function greenhouseSlug(url) {
  const m = url.match(/greenhouse\.io\/(?:embed\/job_board\?for=|boards\/)?([\w-]+)/i) ||
    url.match(/boards\.greenhouse\.io\/([\w-]+)/i);
  return m ? m[1] : null;
}
async function tryGreenhouse(site) {
  const slug = greenhouseSlug(site.url);
  if (!slug) return null;
  const api = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const { body } = await fetchText(api);
  const data = JSON.parse(body);
  return (data.jobs || []).map((j) =>
    normalizeJob(
      {
        id: `gh_${j.id}`,
        title: j.title,
        company: slug,
        location: j.location?.name || '',
        country: countryFromLocation(j.location?.name || ''),
        role: j.departments?.[0]?.name || '',
        url: j.absolute_url,
        postedAt: j.updated_at || '',
      },
      site
    )
  );
}

// ── Adapter: Lever ────────────────────────────────────────────────────────────
function leverSlug(url) {
  const m = url.match(/lever\.co\/([\w-]+)/i);
  return m ? m[1] : null;
}
async function tryLever(site) {
  const slug = leverSlug(site.url);
  if (!slug) return null;
  const api = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const { body } = await fetchText(api);
  const data = JSON.parse(body);
  return (Array.isArray(data) ? data : []).map((j) =>
    normalizeJob(
      {
        id: `lever_${j.id}`,
        title: j.text,
        company: slug,
        location: j.categories?.location || '',
        country: countryFromLocation(j.categories?.location || ''),
        role: j.categories?.team || j.categories?.department || '',
        employmentType: j.categories?.commitment || '',
        url: j.hostedUrl,
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : '',
      },
      site
    )
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}
function titleCase(s) {
  return String(s || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ── Adapter: Ashby ────────────────────────────────────────────────────────────
function ashbySlug(url) {
  const m = url.match(/ashbyhq\.com\/([\w-]+)/i);
  return m && m[1] !== 'posting-api' ? m[1] : null;
}
async function tryAshby(site) {
  const slug = ashbySlug(site.url);
  if (!slug) return null;
  const { body } = await fetchText(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  const data = JSON.parse(body);
  return (data.jobs || []).map((j) =>
    normalizeJob(
      {
        id: `ashby_${j.id}`,
        title: j.title,
        company: titleCase(slug),
        location: j.isRemote ? `Remote · ${j.location || ''}`.trim().replace(/·\s*$/, '').trim() : j.location || '',
        country: countryFromLocation(j.location || ''),
        role: j.department || j.team || '',
        employmentType: j.employmentType || '',
        url: j.jobUrl || j.applyUrl || '',
        postedAt: j.publishedAt || '',
      },
      site
    )
  );
}

// ── Adapter: SmartRecruiters ──────────────────────────────────────────────────
function smartRecruitersSlug(url) {
  const m = url.match(/smartrecruiters\.com\/([\w-]+)/i);
  return m && !/^v1$/i.test(m[1]) ? m[1] : null;
}
async function trySmartRecruiters(site) {
  const slug = smartRecruitersSlug(site.url);
  if (!slug) return null;
  const { body } = await fetchText(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`);
  const data = JSON.parse(body);
  return (data.content || []).map((j) => {
    const loc = j.location || {};
    return normalizeJob(
      {
        id: `sr_${j.id}`,
        title: j.name,
        company: titleCase(slug),
        location: loc.fullLocation || [loc.city, loc.region].filter(Boolean).join(', '),
        country: ISO_COUNTRY[String(loc.country || '').toUpperCase()] || (loc.country || '').toUpperCase(),
        role: j.department?.label || j.function?.label || '',
        employmentType: j.typeOfEmployment?.label || '',
        url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
        postedAt: j.releasedDate || '',
      },
      site
    );
  });
}

// ── Adapter: Recruitee ────────────────────────────────────────────────────────
function recruiteeSlug(url) {
  const m = url.match(/([\w-]+)\.recruitee\.com/i);
  return m ? m[1] : null;
}
async function tryRecruitee(site) {
  const slug = recruiteeSlug(site.url);
  if (!slug) return null;
  const { body } = await fetchText(`https://${slug}.recruitee.com/api/offers/`);
  const data = JSON.parse(body);
  return (data.offers || []).map((j) =>
    normalizeJob(
      {
        id: `recruitee_${j.id}`,
        title: j.title,
        company: j.company_name || titleCase(slug),
        location: [j.city, j.country].filter(Boolean).join(', ') || j.location || '',
        country: j.country || '',
        role: j.department || '',
        employmentType: j.employment_type_code || j.kind || '',
        url: j.careers_url || j.careers_apply_url || '',
        postedAt: j.published_at || '',
      },
      site
    )
  );
}

// ── Aggregator: RemoteOK ──────────────────────────────────────────────────────
async function tryRemoteOK(site) {
  if (!/remoteok\.(com|io)/i.test(hostOf(site.url))) return null;
  const { body } = await fetchText('https://remoteok.com/api');
  const data = JSON.parse(body);
  return (Array.isArray(data) ? data : [])
    .filter((j) => j && j.id && j.position) // first element is a legal notice
    .map((j) => {
      const cur = j.salary_min || j.salary_max ? 'USD' : '';
      const salary =
        j.salary_min && j.salary_max ? `${cur} ${fmtMoney(j.salary_min)}–${fmtMoney(j.salary_max)}` : '';
      return normalizeJob(
        {
          id: `rok_${j.id}`,
          title: j.position,
          company: j.company,
          location: j.location || 'Remote',
          country: countryFromLocation(j.location || ''),
          salary,
          role: Array.isArray(j.tags) ? j.tags.slice(0, 2).join(', ') : '',
          employmentType: 'Remote',
          url: j.url || j.apply_url || '',
          postedAt: j.date || '',
        },
        site
      );
    });
}

// ── Aggregator: Remotive ──────────────────────────────────────────────────────
async function tryRemotive(site) {
  if (!/remotive\.(com|io)/i.test(hostOf(site.url))) return null;
  const { body } = await fetchText('https://remotive.com/api/remote-jobs?limit=100');
  const data = JSON.parse(body);
  return (data.jobs || []).map((j) =>
    normalizeJob(
      {
        id: `rmtv_${j.id}`,
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || 'Remote',
        country: j.candidate_required_location || '',
        salary: j.salary || '',
        role: j.category || '',
        employmentType: (j.job_type || '').replace(/_/g, ' '),
        url: j.url || '',
        postedAt: j.publication_date || '',
      },
      site
    )
  );
}

// ── Aggregator: Arbeitnow ─────────────────────────────────────────────────────
async function tryArbeitnow(site) {
  if (!/arbeitnow\.com/i.test(hostOf(site.url))) return null;
  const { body } = await fetchText('https://www.arbeitnow.com/api/job-board-api');
  const data = JSON.parse(body);
  return (data.data || []).map((j) =>
    normalizeJob(
      {
        id: `arb_${j.slug}`,
        title: j.title,
        company: j.company_name,
        location: j.remote ? `Remote · ${j.location || ''}`.replace(/·\s*$/, '').trim() : j.location || '',
        country: countryFromLocation(j.location || ''),
        role: Array.isArray(j.tags) ? j.tags.slice(0, 2).join(', ') : '',
        employmentType: Array.isArray(j.job_types) ? j.job_types.join(', ') : '',
        url: j.url || '',
        postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : '',
      },
      site
    )
  );
}

// ── Adapter: hiring.cafe ──────────────────────────────────────────────────────
// hiring.cafe is a Next.js app whose private search API requires auth, but it
// server-renders the current result page into __NEXT_DATA__ (props.pageProps
// .ssrHits) with full structured data. We parse that — anonymous and reliable.
// Any filters in the user's URL (e.g. /search?...) are honored because we fetch
// exactly that URL's SSR payload.
const ISO_COUNTRY = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', UK: 'United Kingdom',
  DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
  IE: 'Ireland', PL: 'Poland', PT: 'Portugal', SE: 'Sweden', CH: 'Switzerland',
  IN: 'India', SG: 'Singapore', AU: 'Australia', NZ: 'New Zealand', JP: 'Japan',
  BR: 'Brazil', MX: 'Mexico', AE: 'United Arab Emirates', ZA: 'South Africa',
  AT: 'Austria', BE: 'Belgium', DK: 'Denmark', FI: 'Finland', NO: 'Norway',
  CZ: 'Czechia', HU: 'Hungary', RO: 'Romania', GR: 'Greece', TR: 'Türkiye',
  IL: 'Israel', PH: 'Philippines', CN: 'China', HK: 'Hong Kong', KR: 'South Korea',
  TW: 'Taiwan', MY: 'Malaysia', ID: 'Indonesia', TH: 'Thailand', VN: 'Vietnam',
  AR: 'Argentina', CL: 'Chile', CO: 'Colombia', SA: 'Saudi Arabia', EG: 'Egypt',
  UA: 'Ukraine', LU: 'Luxembourg', SK: 'Slovakia', BG: 'Bulgaria', HR: 'Croatia',
};

function fmtMoney(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString('en-US') : '';
}

function hcSalary(v) {
  if (!v || !v.is_compensation_transparent) return '';
  const cur = v.listed_compensation_currency || '';
  const order = [
    ['yearly', 'year'], ['monthly', 'month'], ['weekly', 'week'],
    ['bi-weekly', '2 weeks'], ['daily', 'day'], ['hourly', 'hour'],
  ];
  const prefer = String(v.listed_compensation_frequency || '').toLowerCase().replace(/\s+/g, '-');
  const ranked = order.slice().sort((a) => (a[0] === prefer ? -1 : 0));
  for (const [key, unit] of ranked) {
    const min = v[`${key}_min_compensation`];
    const max = v[`${key}_max_compensation`];
    if (min || max) {
      const range = min && max ? `${fmtMoney(min)}–${fmtMoney(max)}` : fmtMoney(min || max);
      return `${cur} ${range} / ${unit}`.trim();
    }
  }
  return '';
}

function hcCountry(v) {
  if (v.is_workplace_worldwide_ok) return 'Worldwide';
  const arr = Array.isArray(v.workplace_countries) ? v.workplace_countries : [];
  const names = [...new Set(arr.map((c) => ISO_COUNTRY[c] || c))];
  return names.slice(0, 3).join(', ');
}

function hcLocation(v) {
  const remote = /remote/i.test(v.workplace_type || '');
  let loc = v.formatted_workplace_location || (Array.isArray(v.workplace_cities) ? v.workplace_cities.join('; ') : '');
  if (loc && loc.length > 70) loc = loc.slice(0, 67) + '…';
  if (remote) return loc ? `Remote · ${loc}` : 'Remote';
  return loc;
}

function parseNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function tryHiringCafe(site) {
  if (!/(^|\.)hiring\.cafe/i.test((() => { try { return new URL(site.url).hostname; } catch { return ''; } })())) {
    return null;
  }
  const { body } = await fetchText(site.url);
  const data = parseNextData(body);
  const hits = data?.props?.pageProps?.ssrHits;
  if (!Array.isArray(hits) || !hits.length) return null;

  return hits.map((hit) => {
    const v = hit.v5_processed_job_data || {};
    const info = hit.job_information || {};
    const title = info.title || v.core_job_title || info.job_title_raw || '';
    const commitment = Array.isArray(v.commitment) ? v.commitment.join(', ') : v.commitment || '';
    return normalizeJob(
      {
        id: `hc_${hit.id || newId('hc')}`,
        title,
        company: v.company_name || hit.enriched_company_data?.name || '',
        country: hcCountry(v),
        location: hcLocation(v),
        salary: hcSalary(v),
        role: v.job_category || v.seniority_level || '',
        employmentType: [commitment, v.workplace_type].filter(Boolean).join(' · '),
        url: hit.apply_url || '',
        postedAt: v.estimated_publish_date || '',
      },
      site
    );
  }).filter((j) => j.title);
}

// ── Generic: RSS / Atom ───────────────────────────────────────────────────────
async function tryFeed(site, html) {
  // Discover a feed link if the page isn't itself a feed.
  let feedUrl = null;
  if (/<rss|<feed/i.test(html.slice(0, 500))) {
    feedUrl = site.url;
  } else {
    const $ = cheerio.load(html);
    feedUrl =
      $('link[type="application/rss+xml"]').attr('href') ||
      $('link[type="application/atom+xml"]').attr('href') ||
      null;
    if (feedUrl && !isValidHttpUrl(feedUrl)) feedUrl = new URL(feedUrl, site.url).href;
  }
  if (!feedUrl) return null;

  const { body } = feedUrl === site.url ? { body: html } : await fetchText(feedUrl);
  const $ = cheerio.load(body, { xmlMode: true });
  const items = $('item, entry');
  if (!items.length) return null;
  const jobs = [];
  items.each((_, el) => {
    const $el = $(el);
    let title = $el.find('title').first().text().trim();
    const link =
      $el.find('link').first().attr('href') || $el.find('link').first().text().trim();
    // Many job feeds (We Work Remotely, Stack Overflow) use "Company: Role".
    let company = $el.find('company').first().text().trim();
    const m = title.match(/^(.{2,60}?):\s+(.{3,})$/);
    if (!company && m) {
      company = m[1].trim();
      title = m[2].trim();
    }
    const region = $el.find('region, location').first().text().trim();
    const category = $el.find('category').first().text().trim();
    if (title) {
      jobs.push(
        normalizeJob(
          {
            title,
            company,
            location: region,
            country: /anywhere|worldwide|remote/i.test(region) ? 'Remote' : '',
            role: category,
            url: link,
            postedAt: $el.find('pubDate, updated').first().text().trim(),
          },
          site
        )
      );
    }
  });
  const real = jobs.filter(isRealJob);
  return real.length ? real : null;
}

// ── Generic: JSON-LD JobPosting / ItemList ────────────────────────────────────
function tryJsonLd(site, html) {
  const $ = cheerio.load(html);
  const postings = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed;
    try {
      parsed = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const arr = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
    for (const o of arr) {
      const t = o && o['@type'];
      if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) postings.push(o);
    }
  });
  if (!postings.length) return null;
  const jobs = postings.map((jp) => {
    const addr = (Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation)?.address || {};
    return normalizeJob(
      {
        title: jp.title || '',
        company: jp.hiringOrganization?.name || '',
        location: [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', '),
        country: addr.addressCountry?.name || addr.addressCountry || '',
        employmentType: Array.isArray(jp.employmentType) ? jp.employmentType.join(', ') : jp.employmentType || '',
        url: jp.url || site.url,
        postedAt: jp.datePosted || '',
      },
      site
    );
  });
  const real = jobs.filter(isRealJob);
  return real.length ? real : null;
}

// ── Generic: anchor heuristic ─────────────────────────────────────────────────
// Only accept links that point to an INDIVIDUAL posting — i.e. the href carries
// a job id / posting token. Category pages (e.g. /for-developers/ai-engineer-jobs/)
// have no id and are correctly ignored, so marketing sites yield a clear "no jobs"
// result rather than rows of navigation links.
const INDIVIDUAL_JOB_HREF = new RegExp(
  [
    'gh_jid=\\d+', // greenhouse
    '/postings/[\\w-]{6,}', // lever
    '/o/[\\w-]{4,}', // recruitee
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}', // ashby / uuid
    '/jobs?/[\\w-]*\\d{3,}', // .../job/12345 or /jobs/slug-12345
    '/job/[\\w-]+-\\d', // hiring.cafe-style slug-id
    '/careers?/[\\w-]*\\d{3,}',
    '/vacanc\\w*/\\d{2,}',
    '/position[s]?/\\d{2,}',
    'myworkdayjobs\\.com/.+/job/',
    'smartrecruiters\\.com/[\\w-]+/\\d{6,}',
  ].join('|'),
  'i'
);
// Category / listing hrefs to always skip even if they contain a stray digit.
const CATEGORY_HREF = /(-jobs\/?($|\?)|\/jobs\/?($|\?)|\/categor|\/for-developers\/|\/browse|\/search)/i;

function tryAnchors(site, html) {
  const $ = cheerio.load(html);
  const jobs = [];
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!text || text.length < 6 || text.length > 120) return;
    if (CATEGORY_HREF.test(href)) return;
    if (!INDIVIDUAL_JOB_HREF.test(href)) return;
    let abs;
    try {
      abs = new URL(href, site.url).href;
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    const job = normalizeJob({ title: text, url: abs }, site);
    if (isRealJob(job)) jobs.push(job);
  });
  return jobs.length ? jobs.slice(0, 60) : null;
}

// Reject placeholder / skeleton titles that SPAs render in their static HTML
// (e.g. "Job Posting", "View job", "Apply") and category-navigation links
// (e.g. "AI Engineer Jobs", "Browse all roles"). These produce useless rows.
const JUNK_TITLE = /^(job\s*posting|job|jobs|posting|view( job| details| all| jobs)?|apply( now)?|see (more|details|all|jobs)|browse( all| jobs)?|all (jobs|roles|openings|positions)|find (jobs|a job)|search jobs|read more|learn more|explore|details|untitled|loading|remote jobs|categories|category)\.?$/i;
// Category/listing pages almost always end with a plural noun like "Jobs"/"Roles".
const CATEGORY_SUFFIX = /\b(jobs|careers|openings|roles|vacancies|positions|opportunities)\s*$/i;
function isRealJob(j) {
  const t = (j.title || '').trim();
  if (!t || t.length < 3 || JUNK_TITLE.test(t)) return false;
  if (CATEGORY_SUFFIX.test(t)) return false;
  return true;
}

function countryFromLocation(loc) {
  if (!loc) return '';
  const parts = loc.split(',').map((s) => s.trim());
  const last = parts[parts.length - 1] || '';
  if (/remote/i.test(loc) && parts.length === 1) return 'Remote';
  // Heuristic: if last token looks like a country/known abbrev, use it.
  return last.length <= 30 ? last : '';
}

/**
 * Scrape one site. Returns { ok, jobs, method } or { ok:false, error, code }.
 */
export async function scrapeSite(site) {
  if (!isValidHttpUrl(site.url)) {
    return { ok: false, code: 'INVALID_URL', error: 'Site URL is not a valid http(s) URL.', jobs: [] };
  }

  // 1) Known ATS / aggregator API adapters that don't need the page HTML.
  const apiAdapters = [
    tryGreenhouse, tryLever, tryAshby, trySmartRecruiters, tryRecruitee,
    tryRemoteOK, tryRemotive, tryArbeitnow, tryHiringCafe,
  ];
  for (const adapter of apiAdapters) {
    try {
      const jobs = await adapter(site);
      if (jobs && jobs.length) {
        return { ok: true, jobs: jobs.filter(isRealJob), method: adapter.name.replace('try', '') };
      }
    } catch (err) {
      // adapter not applicable / failed — continue to next strategy
    }
  }

  // 2) Fetch the page once for the remaining HTML-based strategies.
  let html;
  try {
    const res = await fetchText(site.url);
    html = res.body;
  } catch (err) {
    const fe = err instanceof FetchError ? err : new FetchError(String(err?.message || err));
    return { ok: false, code: fe.code, error: fe.message, jobs: [] };
  }

  for (const strategy of [tryFeed, tryJsonLd, tryAnchors]) {
    try {
      const jobs = await strategy(site, html);
      if (jobs && jobs.length) return { ok: true, jobs, method: strategy.name.replace('try', '') };
    } catch {
      // continue
    }
  }

  // Nothing worked — explain why clearly.
  const looksSpa = /<div[^>]+id=["'](root|app|__next)["']/i.test(html) && cheerioTextLength(html) < 400;
  if (looksSpa) {
    return {
      ok: false,
      code: 'JS_RENDERED',
      error:
        'This site renders its job listings with JavaScript, so they cannot be read from the raw page. ' +
        'If it is a Greenhouse/Lever board, use the board URL; otherwise this source needs a public API or feed to aggregate.',
      jobs: [],
    };
  }
  return {
    ok: false,
    code: 'NO_JOBS_FOUND',
    error:
      'Reached the site but could not identify any job postings (no API, feed, or structured job data found). ' +
      'It may not be a job board, or it lists jobs in a format we cannot read automatically.',
    jobs: [],
  };
}

function cheerioTextLength(html) {
  const $ = cheerio.load(html);
  $('script,style').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().length;
}

// Reference list shown in the UI so users add URLs we can actually aggregate.
export const SUPPORTED_SITES = [
  { name: 'hiring.cafe', example: 'https://hiring.cafe', kind: 'Aggregator', note: 'Millions of jobs; supports search-filter URLs.' },
  { name: 'RemoteOK', example: 'https://remoteok.com', kind: 'Aggregator', note: 'Remote tech jobs.' },
  { name: 'Remotive', example: 'https://remotive.com', kind: 'Aggregator', note: 'Remote jobs across categories.' },
  { name: 'Arbeitnow', example: 'https://www.arbeitnow.com', kind: 'Aggregator', note: 'EU / Germany-heavy job board.' },
  { name: 'We Work Remotely', example: 'https://weworkremotely.com/remote-jobs.rss', kind: 'RSS feed', note: 'Use the .rss feed URL.' },
  { name: 'Greenhouse', example: 'https://boards.greenhouse.io/{company}', kind: 'Company board', note: 'e.g. /airbnb, /stripe.' },
  { name: 'Lever', example: 'https://jobs.lever.co/{company}', kind: 'Company board', note: '' },
  { name: 'Ashby', example: 'https://jobs.ashbyhq.com/{company}', kind: 'Company board', note: '' },
  { name: 'SmartRecruiters', example: 'https://jobs.smartrecruiters.com/{Company}', kind: 'Company board', note: '' },
  { name: 'Recruitee', example: 'https://{company}.recruitee.com', kind: 'Company board', note: '' },
];

/**
 * Aggregate jobs across many sites concurrently.
 * @returns {{ jobs: array, sources: array<{ siteId, name, ok, count, error?, code? }> }}
 */
export async function aggregateJobs(sites) {
  const results = await Promise.all(
    sites.map(async (site) => {
      const r = await scrapeSite(site);
      return { site, r };
    })
  );
  const jobs = [];
  const sources = [];
  for (const { site, r } of results) {
    sources.push({
      siteId: site.id,
      name: site.name || site.url,
      url: site.url,
      ok: r.ok,
      count: r.jobs.length,
      method: r.method,
      error: r.error,
      code: r.code,
    });
    if (r.ok) jobs.push(...r.jobs);
  }
  return { jobs, sources };
}
