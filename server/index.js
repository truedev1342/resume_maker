import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';

import { config, CLIENT_DIST, STORAGE_DIR } from './config.js';
import { aiProviderStatus } from './config.js';
import authRoutes from './routes/auth.js';
import templateRoutes from './routes/templates.js';
import siteRoutes from './routes/sites.js';
import jobRoutes from './routes/jobs.js';
import resumeRoutes from './routes/resumes.js';
import adminRoutes from './routes/admin.js';

// Ensure storage layout exists (no database — files on disk).
import './scripts/ensure-dirs.js';

const app = express();
app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.clientOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    name: 'rm.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // local app over http
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Health / config probe (no secrets leaked — only booleans).
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ai: aiProviderStatus() });
});

app.use('/api/auth', authRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/admin', adminRoutes);

// 404 for unknown API routes.
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

// Serve the built React client in production.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res
      .type('text')
      .send('API is running. Start the client with `npm run dev` (Vite on :5173) or build with `npm run build`.');
  });
}

// Central error handler.
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(config.port, () => {
  const ai = aiProviderStatus();
  console.log(`\n  Resume Maker server → http://localhost:${config.port}`);
  console.log(`  Storage: ${STORAGE_DIR}`);
  console.log(
    `  AI: ${ai.anthropic ? 'Anthropic ✓' : 'Anthropic ✗'}  ${ai.openai ? 'OpenAI ✓' : 'OpenAI ✗'}` +
      (ai.fallbackOnly ? '  (no keys → local fallback)' : '')
  );
  console.log(`  Logins: huy (admin), tony, phan — password: qwe123QWE!@#\n`);
});
