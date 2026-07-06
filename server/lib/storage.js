// Persistence layer with two backends:
//   • Upstash Redis  — used whenever its env vars are present (e.g. on Vercel,
//     where the filesystem is read-only and per-request ephemeral).
//   • File-based JSON — the original "no database" store, used for local dev
//     when no Redis is configured. Writes are atomic (tmp + rename), serialized.
// Both expose the identical API, so route code doesn't care which is active.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import { DATA_DIR, GENERATED_DIR } from '../config.js';

// ── Backend selection ──────────────────────────────────────────────────────────
// @upstash/redis reads UPSTASH_REDIS_REST_URL/TOKEN by default; Vercel's own KV
// integration injects KV_REST_API_URL/TOKEN instead, so accept either pair.
function makeRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return new Redis({ url, token });
  return null;
}

const redis = makeRedis();
export const usingRedis = Boolean(redis);

const colKey = (name) => `rm:col:${name}`;
const genKey = (id) => `rm:gen:${id}`;

// Only touch the local filesystem in file mode. On a read-only serverless FS
// this mkdir would otherwise throw at import time and crash the function.
if (!redis) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

const writeLocks = new Map(); // filename -> Promise chain (serialize file writes)

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

// ── Collections (arrays or arbitrary JSON values) ────────────────────────────────
export async function readCollection(name, fallback = []) {
  if (redis) {
    const val = await redis.get(colKey(name)); // auto-deserialized
    return val == null ? fallback : val;
  }
  const file = fileFor(name);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    if (err instanceof SyntaxError) {
      // Corrupt file — back it up and start fresh rather than crash.
      try {
        await fsp.rename(file, `${file}.corrupt-${Date.now()}`);
      } catch {}
      return fallback;
    }
    throw err;
  }
}

export async function writeCollection(name, data) {
  if (redis) {
    if (data == null) await redis.del(colKey(name));
    else await redis.set(colKey(name), data);
    return data;
  }
  const file = fileFor(name);
  const prev = writeLocks.get(name) || Promise.resolve();
  const next = prev.then(async () => {
    if (data == null) {
      try {
        await fsp.unlink(file);
      } catch {}
      return data;
    }
    const tmp = `${file}.tmp-${process.pid}`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, file);
    return data;
  });
  // Keep the chain alive but don't let rejections poison future writes.
  writeLocks.set(
    name,
    next.catch(() => {})
  );
  return next;
}

// Convenience helpers for collections of objects with an `id`.
export async function upsert(name, record, idField = 'id') {
  const items = await readCollection(name, []);
  const idx = items.findIndex((r) => r[idField] === record[idField]);
  if (idx >= 0) items[idx] = { ...items[idx], ...record };
  else items.push(record);
  await writeCollection(name, items);
  return record;
}

export async function removeById(name, id, idField = 'id') {
  const items = await readCollection(name, []);
  const next = items.filter((r) => r[idField] !== id);
  await writeCollection(name, next);
  return items.length !== next.length;
}

// ── Generated resume blobs (rendered HTML + resume JSON, keyed by resume id) ──────
// In file mode these live as <id>.html / <id>.json under GENERATED_DIR; in Redis
// mode they're a single { html, data } value.
export async function writeGenerated(id, { html, data }) {
  if (redis) {
    await redis.set(genKey(id), { html, data });
    return;
  }
  try {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  } catch {}
  await fsp.writeFile(path.join(GENERATED_DIR, `${id}.html`), html, 'utf8');
  await fsp.writeFile(path.join(GENERATED_DIR, `${id}.json`), JSON.stringify(data, null, 2), 'utf8');
}

export async function readGenerated(id) {
  if (redis) {
    return (await redis.get(genKey(id))) || null; // { html, data } | null
  }
  try {
    const html = await fsp.readFile(path.join(GENERATED_DIR, `${id}.html`), 'utf8');
    const data = JSON.parse(await fsp.readFile(path.join(GENERATED_DIR, `${id}.json`), 'utf8'));
    return { html, data };
  } catch {
    return null;
  }
}

export async function deleteGenerated(id) {
  if (redis) {
    await redis.del(genKey(id));
    return;
  }
  for (const ext of ['html', 'json']) {
    try {
      await fsp.unlink(path.join(GENERATED_DIR, `${id}.${ext}`));
    } catch {}
  }
}

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
