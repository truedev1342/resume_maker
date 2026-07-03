// Parse a job posting from either a pasted description or a URL.
//
// For URLs we fetch the page and extract structured fields, preferring
// schema.org JobPosting JSON-LD (used by most major boards) and falling back to
// readable text extraction. JS-only single-page apps that ship no server HTML
// are detected and reported with a clear, suitable reason.

import * as cheerio from 'cheerio';
import { fetchText, FetchError, isValidHttpUrl } from './fetcher.js';

function decodeEntities(s) {
  return cheerio.load(`<x>${s || ''}</x>`)('x').text();
}

function textFromHtml(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, nav, footer, header, form').remove();
  const main = $('main').text() || $('article').text() || $('body').text() || '';
  return main.replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function extractJsonLd($) {
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      // some sites embed multiple JSON objects or trailing commas — ignore
    }
  });
  // Flatten @graph arrays.
  const flat = [];
  for (const b of blocks) {
    if (Array.isArray(b)) flat.push(...b);
    else if (b && Array.isArray(b['@graph'])) flat.push(...b['@graph']);
    else flat.push(b);
  }
  return flat.find((o) => {
    const t = o && o['@type'];
    return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
  });
}

function fromJobPosting(jp) {
  const loc = jp.jobLocation;
  let location = '';
  let country = '';
  const addr = Array.isArray(loc) ? loc[0]?.address : loc?.address;
  if (addr) {
    location = [addr.addressLocality, addr.addressRegion, addr.addressCountry?.name || addr.addressCountry]
      .filter(Boolean)
      .join(', ');
    country = addr.addressCountry?.name || addr.addressCountry || '';
  }
  if (jp.jobLocationType === 'TELECOMMUTE' && !location) location = 'Remote';

  let salary = '';
  const bs = jp.baseSalary;
  if (bs) {
    const v = bs.value || bs;
    const min = v.minValue;
    const max = v.maxValue;
    const single = v.value;
    const unit = v.unitText ? ` / ${String(v.unitText).toLowerCase()}` : '';
    const cur = bs.currency || v.currency || '';
    if (min && max) salary = `${cur} ${min}–${max}${unit}`.trim();
    else if (single) salary = `${cur} ${single}${unit}`.trim();
  }

  return {
    title: decodeEntities(jp.title) || '',
    company: decodeEntities(jp.hiringOrganization?.name || jp.hiringOrganization) || '',
    location,
    country,
    salary,
    employmentType: Array.isArray(jp.employmentType) ? jp.employmentType.join(', ') : jp.employmentType || '',
    datePosted: jp.datePosted || '',
    description: decodeEntities(stripTags(jp.description || '')),
  };
}

function stripTags(html) {
  return cheerio.load(`<x>${html}</x>`)('x').text();
}

function looksLikeEmptySpa(html, extractedText) {
  // Heuristic: very little readable text but lots of script tags / a known SPA root.
  const hasRoot = /<div[^>]+id=["'](root|app|__next)["']/i.test(html);
  const scriptCount = (html.match(/<script/gi) || []).length;
  return extractedText.length < 200 && (hasRoot || scriptCount > 8);
}

/**
 * Parse a job from a URL or pasted text.
 * @param {{ url?: string, text?: string }} input
 * @returns {Promise<{ source, title, company, location, country, salary, employmentType, datePosted, description, url, warning? }>}
 */
export async function parseJob({ url, text }) {
  // 1) Pasted description path — no fetching needed.
  if (text && text.trim()) {
    const cleaned = text.trim();
    const firstLine = cleaned.split(/\r?\n/).find((l) => l.trim()) || '';
    return {
      source: 'pasted-text',
      title: firstLine.slice(0, 120),
      company: '',
      location: '',
      country: '',
      salary: '',
      employmentType: '',
      datePosted: '',
      description: cleaned,
      url: '',
    };
  }

  // 2) URL path.
  if (!url || !url.trim()) {
    throw new FetchError('Provide a job link or paste a job description.', { code: 'NO_INPUT' });
  }
  if (!isValidHttpUrl(url)) {
    throw new FetchError('That job link is not a valid http(s) URL. Please check it and try again.', {
      code: 'INVALID_URL',
      url,
    });
  }

  const { body, finalUrl, contentType } = await fetchText(url);

  // JSON endpoint?
  if (contentType.includes('application/json')) {
    try {
      const data = JSON.parse(body);
      const jp = data['@type'] === 'JobPosting' ? data : null;
      if (jp) return { source: 'json', url: finalUrl, ...fromJobPosting(jp) };
    } catch {}
  }

  const $ = cheerio.load(body);
  const jobPosting = extractJsonLd($);
  if (jobPosting) {
    const parsed = fromJobPosting(jobPosting);
    if (parsed.title || parsed.description) {
      return { source: 'json-ld', url: finalUrl, ...parsed };
    }
  }

  // Fallback: readable text extraction.
  const extractedText = textFromHtml(body);
  const metaTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('h1').first().text() ||
    '';
  const metaCompany =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    '';

  if (looksLikeEmptySpa(body, extractedText)) {
    throw new FetchError(
      'This job page loads its content with JavaScript, so the posting text could not be read from the raw page. ' +
        'Please open the link, copy the job description, and paste it into the description box instead.',
      { code: 'JS_RENDERED', url: finalUrl }
    );
  }

  if (extractedText.length < 80) {
    throw new FetchError(
      'The page was reached but contained almost no readable job text. It may be a redirect, a login wall, or a listing index rather than a single posting. Try pasting the description instead.',
      { code: 'NO_CONTENT', url: finalUrl }
    );
  }

  return {
    source: 'html-text',
    url: finalUrl,
    title: decodeEntities(metaTitle).trim().slice(0, 160),
    company: decodeEntities(metaCompany).trim(),
    location: '',
    country: '',
    salary: '',
    employmentType: '',
    datePosted: '',
    description: extractedText.slice(0, 12000),
    warning:
      'Could not find structured job data on this page; extracted readable text instead. Review the parsed description for accuracy.',
  };
}
