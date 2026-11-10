import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class StoreError extends Error {
  constructor(code, message) { super(message); this.name = 'StoreError'; this.code = code; }
}

const fail = (code, message) => { throw new StoreError(code, message); };
const clean = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) fail('INVALID_INPUT', `${field} must be a non-empty string.`);
  return value.trim();
};
const preserveText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) fail('INVALID_INPUT', `${field} must be a non-empty string.`);
  return value;
};
const outline = (text) => [...text.matchAll(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/gm)]
  .map((m) => ({ level: m[1].length, title: m[2], offset: m.index }));

export function createStore({ dataDir }) {
  if (!dataDir) throw new TypeError('dataDir is required');
  const root = path.resolve(dataDir);
  const sessionsDir = path.join(root, 'sessions');
  const locks = new Map();

  async function ensure() { await mkdir(sessionsDir, { recursive: true }); }
  const fileFor = (id) => path.join(sessionsDir, `${id}.json`);
  async function read(id) {
    await ensure();
    let raw;
    try { raw = await readFile(fileFor(id), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') fail('SESSION_NOT_FOUND', `Session ${id} was not found.`); throw error; }
    return JSON.parse(raw);
  }
  async function mutate(id, expectedRevision, change) {
    const previous = locks.get(id) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    locks.set(id, queued);
    await previous;
    try {
      const data = await read(id);
      if (expectedRevision !== undefined && expectedRevision !== data.session.revision)
        fail('REVISION_CONFLICT', `Expected revision ${expectedRevision}, current revision is ${data.session.revision}.`);
      const result = await change(data);
      data.session.revision += 1;
      data.session.updatedAt = new Date().toISOString();
      await ensure();
      const temp = `${fileFor(id)}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
      await rename(temp, fileFor(id));
      return result;
    } finally { release(); if (locks.get(id) === queued) locks.delete(id); }
  }
  function active(data) { return data.nodes.find((node) => node.id === data.session.activeNodeId); }
  function nodePath(data, nodeId = data.session.activeNodeId) {
    const result = [];
    let node = data.nodes.find((item) => item.id === nodeId);
    while (node) { result.unshift(node); node = node.parentId ? data.nodes.find((item) => item.id === node.parentId) : null; }
    return result;
  }
  function contextFor(data, nodeId = data.session.activeNodeId) {
    let chain = nodePath(data, nodeId);
    // A new topic starts a new context boundary; sibling/ancestor transcripts
    // are not implicit context for it. Explicit context belongs in its question.
    const boundary = chain.findLastIndex((node) => data.branches.some(
      (branch) => branch.nodeId === node.id && branch.kind === 'topic'));
    if (boundary >= 0) chain = chain.slice(boundary);
    const out = [];
    for (let i = 0; i < chain.length; i += 1) {
      const node = chain[i];
      let turns = data.turns.filter((turn) => turn.nodeId === node.id);
      if (i < chain.length - 1) {
        const child = chain[i + 1];
        const childBranch = data.branches.find((branch) => branch.nodeId === child.id);
        const anchoredSource = data.sources.find((source) => source.id === childBranch.sourceId);
        const anchorEnd = childBranch.anchor.end;
        const sourceIndex = turns.findIndex((turn) => turn.id === anchoredSource.turnId);
        turns = sourceIndex < 0 ? turns : turns.slice(0, sourceIndex + 1);
        const selected = turns.at(-1);
        for (const turn of turns.slice(0, -1)) out.push(turn);
        if (selected) out.push({ ...selected, text: selected.role === 'assistant' ? selected.text.slice(0, anchorEnd) : selected.text, clippedForContext: true });
      } else out.push(...turns);
    }
    return out;
  }
  function snapshot(data) {
    const nodes = nodePath(data);
    return {
      session: structuredClone(data.session),
      activeNodeId: data.session.activeNodeId,
      nodes: data.nodes.map((node) => ({ ...node, isCurrent: node.id === data.session.activeNodeId })),
      path: nodes.map((n) => ({ id: n.id, title: n.title, status: n.status, parentId: n.parentId })),
      context: contextFor(data).map((turn) => ({ ...turn })),
      sources: data.sources.map((s) => ({ ...s, sections: outline(s.text) })),
      branches: data.branches.map((b) => structuredClone(b)),
      turns: data.turns.map((t) => structuredClone(t)),
    };
  }
  function findAnchor(source, phrase, anchorStart) {
    // A UI may supply the exact offset after mapping its rendered selection
    // back to the immutable source text. Legacy callers still require a unique phrase.
    const value = anchorStart === undefined ? clean(phrase, 'anchor') : preserveText(phrase, 'anchor');
    if (anchorStart !== undefined && (!Number.isSafeInteger(anchorStart) || anchorStart < 0))
      fail('ANCHOR_OFFSET_INVALID', 'anchorStart must be a non-negative integer.');
    if (anchorStart !== undefined && source.text.slice(anchorStart, anchorStart + value.length) !== value)
      fail('ANCHOR_MISMATCH', 'The anchor does not match the source at anchorStart.');
    const first = anchorStart ?? source.text.indexOf(value);
    if (first < 0) fail('ANCHOR_NOT_FOUND', 'The exact anchor text was not found in the selected answer.');
    if (anchorStart === undefined && source.text.indexOf(value, first + 1) >= 0)
      fail('ANCHOR_AMBIGUOUS', 'The anchor appears more than once. Include more surrounding words.');
    const end = first + value.length;
    const paraStart = Math.max(source.text.lastIndexOf('\n\n', first), source.text.lastIndexOf('\r\n\r\n', first)) + 1;
    let paraEnd = source.text.indexOf('\n\n', end);
    if (paraEnd < 0) paraEnd = source.text.length;
    return { text: value, start: first, end, paragraph: source.text.slice(paraStart, paraEnd).trim() };
  }
  function resumeExcerpt(data, nodeId, quotedParagraph) {
    const source = data.sources.find((s) => s.ownerNodeId === nodeId);
    if (!source) return '';
    if (quotedParagraph && source.text.includes(quotedParagraph)) return quotedParagraph;
    return source.text.split(/\n\s*\n/).find((paragraph) => paragraph.trim())?.trim() ?? '';
  }
  const addTurn = (data, nodeId, role, text) => {
    const turn = { id: randomUUID(), nodeId, role, text, createdAt: new Date().toISOString() };
    data.turns.push(turn);
    return turn;
  };

  return {
    async start({ title, question, answer }) {
      await ensure();
      title = clean(title, 'title'); question = clean(question, 'question'); answer = preserveText(answer, 'answer');
      const id = randomUUID(); const now = new Date().toISOString();
      const data = {
        session: { id, title, createdAt: now, updatedAt: now, revision: 0, activeNodeId: 'root' },
        nodes: [{ id: 'root', title, parentId: null, status: 'active', createdAt: now }],
        turns: [], sources: [], branches: [],
      };
      addTurn(data, 'root', 'user', question);
      const assistantTurn = addTurn(data, 'root', 'assistant', answer);
      const source = { id: randomUUID(), ownerNodeId: 'root', turnId: assistantTurn.id, text: answer, createdAt: now };
      data.sources.push(source);
      await writeFile(fileFor(id), JSON.stringify(data, null, 2), 'utf8');
      return { id, title, revision: 0 };
    },
    async getSession(id) { return snapshot(await read(clean(id, 'sessionId'))); },
    async readSource({ sessionId, sourceId }) {
      const data = await read(clean(sessionId, 'sessionId'));
      const source = data.sources.find((s) => s.id === sourceId);
      if (!source || !nodePath(data).some((n) => n.id === source.ownerNodeId)) fail('SOURCE_NOT_CURRENT', 'Source is not on the active branch path.');
      return { ...source, sections: outline(source.text) };
    },
    async enterBranch({ sessionId, sourceId, anchor, anchorStart, question, answer, expectedRevision }) {
      return mutate(clean(sessionId, 'sessionId'), expectedRevision, async (data) => {
        const current = active(data);
        const source = data.sources.find((s) => s.id === sourceId && s.ownerNodeId === current.id);
        if (!source) fail('SOURCE_NOT_CURRENT', 'Choose an answer from the current branch.');
        const found = findAnchor(source, anchor, anchorStart);
        question = clean(question, 'question'); answer = preserveText(answer, 'answer');
        const id = randomUUID(); const branchId = randomUUID(); const now = new Date().toISOString();
        const node = { id, title: question, parentId: current.id, status: 'active', createdAt: now };
        const branch = { id: branchId, nodeId: id, parentNodeId: current.id, sourceId, anchor: found, question, status: 'active', createdAt: now };
        current.status = 'paused';
        const currentBranch = data.branches.find((item) => item.nodeId === current.id);
        if (currentBranch?.status === 'active') currentBranch.status = 'paused';
        data.nodes.push(node); data.branches.push(branch); data.session.activeNodeId = id;
        addTurn(data, id, 'user', question);
        const assistantTurn = addTurn(data, id, 'assistant', answer);
        const childSource = { id: randomUUID(), ownerNodeId: id, turnId: assistantTurn.id, text: answer, createdAt: now };
        data.sources.push(childSource);
        return { branch: structuredClone(branch), source: { ...childSource, sections: outline(answer) }, revision: data.session.revision + 1 };
      });
    },
    async appendTurn({ sessionId, userText, answer, expectedRevision }) {
      return mutate(clean(sessionId, 'sessionId'), expectedRevision, async (data) => {
        const node = active(data); if (!node || node.status !== 'active') fail('NO_ACTIVE_BRANCH', 'There is no active branch.');
        addTurn(data, node.id, 'user', clean(userText, 'userText'));
        const text = preserveText(answer, 'answer');
        const assistantTurn = addTurn(data, node.id, 'assistant', text);
        const source = { id: randomUUID(), ownerNodeId: node.id, turnId: assistantTurn.id, text, createdAt: new Date().toISOString() };
        data.sources.push(source);
        return { source: { ...source, sections: outline(text) }, revision: data.session.revision + 1 };
      });
    },
    async enterTopicBranch({ sessionId, parentNodeId = 'root', title, question, answer, expectedRevision }) {
      return mutate(clean(sessionId, 'sessionId'), expectedRevision, async (data) => {
        const parent = nodePath(data).find((node) => node.id === parentNodeId);
        if (!parent) fail('PARENT_NOT_CURRENT', 'Choose the current node or an ancestor as the topic parent.');
        title = clean(title, 'title'); question = clean(question, 'question'); answer = preserveText(answer, 'answer');
        const current = active(data);
        current.status = 'paused';
        const currentBranch = data.branches.find((branch) => branch.nodeId === current.id);
        if (currentBranch) currentBranch.status = 'paused';
        const now = new Date().toISOString();
        const node = { id: randomUUID(), parentId: parent.id, title, status: 'active', createdAt: now };
        const returnSource = data.sources.findLast((source) => source.ownerNodeId === parent.id);
        const branch = { id: randomUUID(), nodeId: node.id, parentNodeId: parent.id, kind: 'topic',
          sourceId: null, returnSourceId: returnSource?.id ?? null,
          anchor: { kind: 'topic', text: title, start: null, end: null, paragraph: '' },
          question, status: 'active', createdAt: now };
        data.nodes.push(node); data.branches.push(branch); data.session.activeNodeId = node.id;
        addTurn(data, node.id, 'user', question);
        const turn = addTurn(data, node.id, 'assistant', answer);
        const source = { id: randomUUID(), ownerNodeId: node.id, turnId: turn.id, text: answer, createdAt: now };
        data.sources.push(source);
        return { branch: structuredClone(branch), source, revision: data.session.revision + 1 };
      });
    },
    async returnFromBranch({ sessionId, target = 'parent', disposition, summary, expectedRevision }) {
      return mutate(clean(sessionId, 'sessionId'), expectedRevision, async (data) => {
        const node = active(data); if (node.id === 'root') fail('ALREADY_AT_ROOT', 'The current path is already at the main lesson.');
        if (!['resolved', 'paused'].includes(disposition)) fail('INVALID_DISPOSITION', 'disposition must be resolved or paused.');
        if (disposition === 'resolved') {
          if (typeof summary !== 'string' || !summary.trim()) fail('SUMMARY_REQUIRED', 'A resolved branch requires a concise summary.');
          summary = summary.trim();
        }
        const branch = data.branches.find((b) => b.nodeId === node.id);
        if (disposition === 'resolved') { branch.status = 'resolved'; branch.summary = summary; }
        else branch.status = 'paused';
        node.status = disposition;
        const parent = target === 'root' ? 'root' : branch.parentNodeId;
        const targetNode = data.nodes.find((n) => n.id === parent);
        targetNode.status = 'active';
        const targetBranch = data.branches.find((item) => item.nodeId === parent);
        if (targetBranch) targetBranch.status = 'active';
        data.session.activeNodeId = parent;
        const descendants = nodePath(data, node.id).slice(1);
        const quoteBranch = descendants.map((item) => data.branches.find((candidate) => candidate.nodeId === item.id))
          .find((candidate) => candidate?.parentNodeId === parent);
        const topicSource = data.sources.find((source) => source.id === quoteBranch?.returnSourceId);
        const excerpt = topicSource?.text ?? resumeExcerpt(data, parent, quoteBranch?.anchor.paragraph);
        return { activeNodeId: parent, summary: branch.summary ?? '', resumeExcerpt: excerpt, revision: data.session.revision + 1 };
      });
    },
    async abandonBranch({ sessionId, expectedRevision }) {
      return mutate(clean(sessionId, 'sessionId'), expectedRevision, async (data) => {
        const node = active(data); if (node.id === 'root') fail('ALREADY_AT_ROOT', 'There is no active branch to abandon.');
        const branch = data.branches.find((b) => b.nodeId === node.id); branch.status = 'abandoned'; node.status = 'abandoned';
        const parent = data.nodes.find((n) => n.id === branch.parentNodeId); parent.status = 'active';
        const parentBranch = data.branches.find((item) => item.nodeId === parent.id);
        if (parentBranch) parentBranch.status = 'active';
        data.session.activeNodeId = parent.id;
        return { activeNodeId: parent.id, branchId: branch.id, revision: data.session.revision + 1 };
      });
    },
    async resumeBranch({ sessionId, branchId, expectedRevision }) {
      return mutate(clean(sessionId, 'sessionId'), expectedRevision, async (data) => {
        const branch = data.branches.find((b) => b.id === branchId);
        if (!branch || branch.status !== 'paused') fail('BRANCH_NOT_PAUSED', 'Only a paused branch can be resumed.');
        const current = active(data); if (current.id !== branch.parentNodeId) fail('BRANCH_NOT_CHILD', 'Resume a paused branch directly under the current node.');
        current.status = 'paused';
        const currentBranch = data.branches.find((item) => item.nodeId === current.id);
        if (currentBranch) currentBranch.status = 'paused';
        const node = data.nodes.find((n) => n.id === branch.nodeId); node.status = 'active'; branch.status = 'active'; data.session.activeNodeId = node.id;
        const result = snapshot(data);
        result.session.revision = data.session.revision + 1;
        return result;
      });
    },
    async listSessions() {
      await ensure(); const names = (await readdir(sessionsDir)).filter((name) => name.endsWith('.json'));
      const rows = await Promise.all(names.map(async (name) => { const data = JSON.parse(await readFile(path.join(sessionsDir, name), 'utf8')); return { ...data.session, activeTitle: active(data)?.title ?? data.session.title }; }));
      return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  };
}
