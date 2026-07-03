// Creates the file-based storage layout (this app uses NO database).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');

const dirs = [
  path.join(serverDir, 'storage'),
  path.join(serverDir, 'storage', 'uploads'),
  path.join(serverDir, 'storage', 'generated'),
  path.join(serverDir, 'data'),
];

for (const d of dirs) {
  fs.mkdirSync(d, { recursive: true });
  const keep = path.join(d, '.gitkeep');
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
}

console.log('[ensure-dirs] storage layout ready');
