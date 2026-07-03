import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const SERVER_DIR = __dirname;
export const STORAGE_DIR = path.join(__dirname, 'storage');
export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');     // uploaded sample resumes (PDF)
export const GENERATED_DIR = path.join(STORAGE_DIR, 'generated'); // generated resumes (html/pdf/json)
export const DATA_DIR = path.join(__dirname, 'data');             // JSON "database" replacement
export const TEMPLATES_DIR = path.join(__dirname, 'templates');   // built-in ATS templates
export const CLIENT_DIST = path.join(ROOT, 'dist');               // built React app

export const config = {
  port: Number(process.env.PORT) || 4000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  isProd: process.env.NODE_ENV === 'production',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },
};

export function aiProviderStatus() {
  return {
    anthropic: Boolean(config.anthropic.apiKey),
    openai: Boolean(config.openai.apiKey),
    fallbackOnly: !config.anthropic.apiKey && !config.openai.apiKey,
  };
}
