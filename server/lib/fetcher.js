// Shared HTTP fetch with timeout, a browser-like UA, and human-readable error
// classification. Both job-link parsing and site scraping reuse this so failures
// are reported with a clear, suitable reason (never a silent failure).

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export class FetchError extends Error {
  constructor(message, { code, status, url } = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code || 'FETCH_FAILED';
    this.status = status;
    this.url = url;
  }
}

function classify(url, status) {
  if (status === 401 || status === 403) {
    return new FetchError(
      'The site refused access (login or bot protection). This page likely requires signing in or blocks automated requests.',
      { code: 'ACCESS_DENIED', status, url }
    );
  }
  if (status === 404) {
    return new FetchError('The job page was not found (404). The link may be expired or incorrect.', {
      code: 'NOT_FOUND',
      status,
      url,
    });
  }
  if (status === 429) {
    return new FetchError('The site is rate-limiting requests (429). Try again in a little while.', {
      code: 'RATE_LIMITED',
      status,
      url,
    });
  }
  if (status >= 500) {
    return new FetchError(`The site returned a server error (${status}). It may be temporarily down.`, {
      code: 'SERVER_ERROR',
      status,
      url,
    });
  }
  return new FetchError(`The site returned an unexpected status (${status}).`, {
    code: 'BAD_STATUS',
    status,
    url,
  });
}

export function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fetch a URL as text with a timeout. Throws FetchError with a friendly message.
 * @returns {{ url: string, finalUrl: string, status: number, contentType: string, body: string }}
 */
export async function fetchText(url, { timeoutMs = 15000, headers = {} } = {}) {
  if (!isValidHttpUrl(url)) {
    throw new FetchError('That does not look like a valid http(s) URL.', { code: 'INVALID_URL', url });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new FetchError('The request timed out — the site took too long to respond.', {
        code: 'TIMEOUT',
        url,
      });
    }
    throw new FetchError(
      `Could not reach the site (${err.code || err.message}). Check the URL or your connection.`,
      { code: 'NETWORK_ERROR', url }
    );
  }
  clearTimeout(timer);

  if (!res.ok) throw classify(url, res.status);

  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();
  return { url, finalUrl: res.url || url, status: res.status, contentType, body };
}
