// Extract text from an uploaded resume PDF so the AI has the candidate's real
// background to tailor from.
//
// Note: we import pdf-parse's internal lib file directly. The package's index.js
// has a debug branch that tries to read a bundled test PDF when required as the
// main module, which throws in some setups — importing the lib avoids that.
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';

const require = createRequire(import.meta.url);

let pdfParse;
function loadPdfParse() {
  if (pdfParse) return pdfParse;
  try {
    pdfParse = require('pdf-parse/lib/pdf-parse.js');
  } catch {
    pdfParse = require('pdf-parse');
  }
  return pdfParse;
}

/**
 * @param {string} filePath  absolute path to a PDF
 * @returns {Promise<{ text: string, pages: number, info: object }>}
 */
export async function extractResumeText(filePath) {
  const buffer = await fsp.readFile(filePath);
  const parse = loadPdfParse();
  try {
    const data = await parse(buffer);
    return {
      text: (data.text || '').replace(/\n{3,}/g, '\n\n').trim(),
      pages: data.numpages || 0,
      info: data.info || {},
    };
  } catch (err) {
    const e = new Error(
      'Could not read this PDF. It may be image-only (scanned), password-protected, or corrupt. ' +
        'Try a text-based PDF, or build from a sample template instead.'
    );
    e.code = 'PDF_PARSE_FAILED';
    e.cause = err;
    throw e;
  }
}
