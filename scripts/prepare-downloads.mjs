import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Publish existing release bytes; never rebuild or silently replace a version.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [version, source] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+$/.test(version) || !source) {
  throw new Error('Usage: node scripts/prepare-downloads.mjs VERSION RELEASE_DIRECTORY');
}
const name = `notify-tools-${version}.tar.gz`;
const bytes = await readFile(resolve(source, name));
const sums = await readFile(resolve(source, 'SHA256SUMS'), 'utf8');
const digest = createHash('sha256').update(bytes).digest('hex');
if (sums.trim() !== `${digest}  ${name}`) throw new Error('Release checksum mismatch');
const output = resolve(root, 'dist/download-site/downloads/notify-tools', `v${version}`);
await mkdir(output, { recursive: true });
for (const [file, content] of [[name, bytes], ['SHA256SUMS', Buffer.from(sums)]]) {
  const path = resolve(output, file);
  let existing;
  try { existing = await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && !existing.equals(content)) throw new Error(`Refusing to replace ${file}`);
  if (!existing) await writeFile(path, content, { flag: 'wx' });
}
await writeFile(resolve(root, 'dist/download-site/_headers'), '/downloads/notify-tools/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n');
console.log(`Prepared Notify Tools ${version}: ${digest}`);
