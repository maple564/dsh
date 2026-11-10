#!/usr/bin/env node
import { mkdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../../../../lib/store.mjs';

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(skillDir, '../../../..');
const requestDir = path.join(projectRoot, 'data', 'requests');
const store = createStore({ dataDir: path.join(projectRoot, 'data') });
const [, , operation, requestArg] = process.argv;

async function main() {
  if (!operation) throw new Error('Usage: node state.mjs <operation> <request-file>');
  await mkdir(requestDir, { recursive: true });
  let request = {};
  if (requestArg) {
    const requestPath = await realpath(path.resolve(requestArg));
    const realRequestDir = await realpath(requestDir);
    if (!requestPath.startsWith(`${realRequestDir}${path.sep}`) || !requestPath.endsWith('.json'))
      throw new Error('Request file must be a .json file inside data/requests/.');
    try { request = JSON.parse(await readFile(requestPath, 'utf8')); }
    finally { await rm(requestPath, { force: true }); }
  }
  const handlers = {
    start: () => store.start(request),
    show: () => store.getSession(request.sessionId),
    list: () => store.listSessions(),
    source: () => store.readSource(request),
    branch: () => store.enterBranch(request),
    topic: () => store.enterTopicBranch(request),
    append: () => store.appendTurn(request),
    return: () => store.returnFromBranch(request),
    resume: () => store.resumeBranch(request),
    abandon: () => store.abandonBranch(request),
  };
  if (!handlers[operation]) throw new Error(`Unknown operation: ${operation}`);
  process.stdout.write(`${JSON.stringify(await handlers[operation](), null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.message, code: error.code ?? 'REQUEST_ERROR' })}\n`);
  process.exitCode = 1;
});
