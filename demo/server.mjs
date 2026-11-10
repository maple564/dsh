import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import { createStore, StoreError } from '../lib/store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data/demo');
const store = createStore({ dataDir });
const host = '127.0.0.1';
const port = Number(process.env.CONVERSATION_DEMO_PORT || 4173);

const rootAnswer = `设计 REST API 时，可以先把主线分成请求安全性、列表读取和错误处理。\n\nIdempotency-Key 用于识别同一业务请求的重复提交。客户端重试时沿用同一个键，服务端保存首次处理结果，避免产生重复副作用。\n\nCursor Pagination 使用稳定排序字段和游标读取下一页，适合持续变化的大型列表。\n\n错误响应应包含稳定的错误码、可读说明和请求追踪标识。`;

async function sessionId() {
  const sessions = await store.listSessions();
  if (sessions.length) return sessions[0].id;
  const created = await store.start({ title: 'REST API 设计演示', question: '如何设计一个可靠的 REST API？', answer: rootAnswer });
  return created.id;
}

function demoAnswer(anchor, question) {
  const hint = anchor.includes('Idempotency')
    ? '服务端可用“用户 + 接口 + Idempotency-Key”定位一次业务操作，并保存响应结果。还应校验请求指纹，防止同一个键被用于不同请求。'
    : anchor.includes('Cursor')
      ? '游标应编码排序字段和唯一 ID，查询时保持排序条件一致。新增数据可能改变页边界，因此客户端需要处理重复或失效游标。'
      : `围绕“${anchor}”先明确边界条件，再给出可验证的处理规则。`;
  return `【演示回答，未调用 AI】\n问题：${question}\n\n${hint}\n\n这里可以继续选中一句话创建嵌套支线，或结束后把结论带回来源回答。`;
}

async function bodyOf(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32_000) throw new StoreError('INPUT_TOO_LARGE', 'Request body is too large.');
  }
  return JSON.parse(raw || '{}');
}

const send = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(await readFile(path.join(here, 'index.html')));
      return;
    }
    if (url.pathname === '/api/state' && req.method === 'GET') {
      const id = await sessionId();
      send(res, 200, await store.getSession(id));
      return;
    }
    if (url.pathname.startsWith('/api/') && req.method === 'POST') {
      const input = await bodyOf(req);
      const id = await sessionId();
      if (url.pathname === '/api/branch') {
        await store.enterBranch({ sessionId: id, sourceId: input.sourceId, anchor: input.anchor, anchorStart: input.anchorStart, question: input.question, answer: demoAnswer(input.anchor, input.question), expectedRevision: input.expectedRevision });
      } else if (url.pathname === '/api/return') {
        await store.returnFromBranch({ sessionId: id, disposition: input.disposition, summary: input.summary, expectedRevision: input.expectedRevision });
      } else if (url.pathname === '/api/resume') {
        await store.resumeBranch({ sessionId: id, branchId: input.branchId, expectedRevision: input.expectedRevision });
      } else {
        send(res, 404, { error: 'NOT_FOUND' });
        return;
      }
      send(res, 200, await store.getSession(id));
      return;
    }
    send(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const known = error instanceof StoreError;
    send(res, known ? 409 : 500, { error: known ? error.code : 'SERVER_ERROR', message: error.message });
  }
});

await mkdir(dataDir, { recursive: true });
server.listen(port, host, () => console.log(`Conversation Structure demo: http://${host}:${port}`));
