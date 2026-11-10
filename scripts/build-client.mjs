import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(path.join(root, 'dsh-plugin/client.template.js'), 'utf8');
const resolver = await readFile(path.join(root, 'lib/anchor-map.mjs'), 'utf8');
const marker = '/*__ANCHOR_MAP__*/';
if (template.split(marker).length !== 2 || !resolver.includes('export function resolveRawAnchor'))
  throw new Error('Client template or resolver marker is missing.');

const bundled = template.replace(marker, resolver.replace(/^export /gm, ''));
await writeFile(path.join(root, 'dsh-plugin/client.js'), bundled);
