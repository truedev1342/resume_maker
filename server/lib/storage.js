// Tiny file-based JSON store — the "no database" persistence layer.
// Each collection is a single JSON file under server/data/.
// Writes are atomic (write to tmp then rename) and serialized per-file.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

const writeLocks = new Map(); // filename -> Promise chain (serialize writes)

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

export async function readCollection(name, fallback = []) {
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
  const file = fileFor(name);
  const prev = writeLocks.get(name) || Promise.resolve();
  const next = prev.then(async () => {
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

export function newId(prefix = 'id') {
  // No Date.now allowed in some contexts here; this is plain Node so it's fine.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
