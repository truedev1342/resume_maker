// HTML → PDF using the system's installed Chrome/Edge in headless
// "--print-to-pdf" mode. No npm dependency and no Chromium download — important
// on locked-down machines where fetching a bundled browser is blocked. The
// resume templates already ship a print stylesheet (@media print), so Chrome's
// own print engine renders them faithfully.

import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Candidate browser locations, in preference order. Honor an explicit override.
function candidateBrowsers() {
  const env = process.env;
  const list = [
    env.CHROME_PATH,
    env.PUPPETEER_EXECUTABLE_PATH,
    `${env.ProgramFiles || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${env.ProgramFiles || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    // Common Linux/macOS names, in case this ever runs elsewhere.
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return list;
}

let cachedBrowser;
async function findBrowser() {
  if (cachedBrowser !== undefined) return cachedBrowser;
  for (const p of candidateBrowsers()) {
    try {
      await fsp.access(p);
      cachedBrowser = p;
      return p;
    } catch {}
  }
  cachedBrowser = null;
  return null;
}

/** True if a usable Chrome/Edge is available for PDF rendering. */
export async function pdfAvailable() {
  return Boolean(await findBrowser());
}

/**
 * Render an on-disk HTML file to a PDF buffer via headless Chrome/Edge.
 * @param {string} htmlPath  absolute path to the source .html file
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @returns {Promise<Buffer>}
 */
export async function htmlFileToPdf(htmlPath, { timeoutMs = 30000 } = {}) {
  const browser = await findBrowser();
  if (!browser) {
    throw new Error('No Chrome or Edge browser found for PDF rendering.');
  }

  // Unique temp profile + output path so concurrent renders never collide or
  // hit "profile already in use" locks.
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpRoot = path.join(os.tmpdir(), `resume-pdf-${stamp}`);
  const profileDir = path.join(tmpRoot, 'profile');
  const outPdf = path.join(tmpRoot, 'out.pdf');
  await fsp.mkdir(profileDir, { recursive: true });

  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--no-pdf-header-footer',
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${outPdf}`,
    fileUrl,
  ];

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(browser, args, { windowsHide: true });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`PDF rendering timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        // Chrome often exits 0 even for headless print; rely on the output file
        // check below, but surface a nonzero code with its stderr for context.
        if (code !== 0) reject(new Error(`Browser exited ${code}: ${stderr.slice(0, 500)}`));
        else resolve();
      });
    });

    const pdf = await fsp.readFile(outPdf);
    if (!pdf.length || pdf.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Browser did not produce a valid PDF.');
    }
    return pdf;
  } finally {
    // Best-effort cleanup of the temp profile + output.
    await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
