import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStore, StoreError } from '../lib/store.mjs';

async function withStore(run) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'conversation-structure-'));
  try {
    await run(createStore({ dataDir }));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

const lessonText = `# 牛顿法求根

## 公式来源
在当前点附近用一阶泰勒展开近似函数。泰勒展开是局部线性近似。

## 收敛条件
从合适初值开始，并满足相应的光滑性条件。`;

test('start stores the exact lesson answer and a heading outline', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '计算方法：牛顿法', question: '讲讲牛顿法', answer: lessonText });
    const snapshot = await store.getSession(session.id);

    assert.equal(snapshot.session.title, '计算方法：牛顿法');
    assert.equal(snapshot.context.at(-1).text, lessonText);
    assert.deepEqual(snapshot.sources[0].sections.map((section) => section.title), [
      '牛顿法求根', '公式来源', '收敛条件',
    ]);
    assert.equal(snapshot.path.at(-1).id, 'root');
  });
});

test('nested branches inherit only the ancestor path through their exact anchors', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '牛顿法', question: '解释牛顿法', answer: lessonText });
    const source = (await store.getSession(session.id)).sources[0];
    const first = await store.enterBranch({
      sessionId: session.id,
      sourceId: source.id,
      anchor: '一阶泰勒展开',
      question: '一阶泰勒展开是什么？',
      answer: '它用切线近似函数。',
    });
    const firstSourceId = first.source.id;
    const second = await store.enterBranch({
      sessionId: session.id,
      sourceId: firstSourceId,
      anchor: '切线近似',
      question: '什么是局部线性？',
      answer: '在一个点的附近用直线近似曲线。',
    });

    const snapshot = await store.getSession(session.id);
    assert.deepEqual(snapshot.path.map((node) => node.title), [
      '牛顿法', '一阶泰勒展开是什么？', '什么是局部线性？',
    ]);
    assert.equal(snapshot.context.some((turn) => turn.text === '收敛条件'), false);
    assert.match(snapshot.context.at(-1).text, /在一个点的附近用直线近似曲线/);
    assert.equal(second.source.ownerNodeId, second.branch.nodeId);
  });
});

test('duplicate anchors fail without changing the session revision', async () => {
  await withStore(async (store) => {
    const session = await store.start({
      title: '误差', question: '讲解误差', answer: '截断误差来自近似。舍入误差来自有限精度。',
    });
    const before = await store.getSession(session.id);
    await assert.rejects(
      store.enterBranch({
        sessionId: session.id,
        sourceId: before.sources[0].id,
        anchor: '误差',
        question: '这个误差指什么？',
        answer: '请先选择一种。',
      }),
      (error) => error instanceof StoreError && error.code === 'ANCHOR_AMBIGUOUS',
    );
    const after = await store.getSession(session.id);
    assert.equal(after.session.revision, before.session.revision);
    assert.equal(after.branches.length, 0);
  });
});

test('overlapping occurrences are also ambiguous without a source offset', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '重叠锚点', question: '解释', answer: 'aaaa' });
    const source = (await store.getSession(session.id)).sources[0];
    await assert.rejects(
      store.enterBranch({ sessionId: session.id, sourceId: source.id,
        anchor: 'aaa', question: '是哪一处？', answer: '第二处。' }),
      (error) => error instanceof StoreError && error.code === 'ANCHOR_AMBIGUOUS',
    );
    const branch = await store.enterBranch({ sessionId: session.id, sourceId: source.id,
      anchor: 'aaa', anchorStart: 1, question: '是哪一处？', answer: '第二处。' });
    assert.equal(branch.branch.anchor.start, 1);
  });
});

test('a verified source offset disambiguates repeated anchors', async () => {
  await withStore(async (store) => {
    const answer = '截断误差来自近似。舍入误差来自有限精度。';
    const session = await store.start({ title: '误差', question: '讲解误差', answer });
    const source = (await store.getSession(session.id)).sources[0];
    const anchorStart = answer.lastIndexOf('误差');

    await assert.rejects(
      store.enterBranch({ sessionId: session.id, sourceId: source.id, anchor: '误差',
        anchorStart: anchorStart - 1, question: '舍入误差是什么？', answer: '数值表示造成的误差。' }),
      (error) => error instanceof StoreError && error.code === 'ANCHOR_MISMATCH',
    );
    assert.equal((await store.getSession(session.id)).session.revision, 0);

    const created = await store.enterBranch({ sessionId: session.id, sourceId: source.id,
      anchor: '误差', anchorStart, question: '舍入误差是什么？', answer: '数值表示造成的误差。' });
    assert.equal(created.branch.anchor.start, anchorStart);
    const current = await store.getSession(session.id);
    assert.equal(current.context.at(-3).text, answer.slice(0, anchorStart + '误差'.length));
  });
});

test('return to parent resolves only the current branch and quotes the unchanged source', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '牛顿法', question: '解释', answer: lessonText });
    const source = (await store.getSession(session.id)).sources[0];
    const branch = await store.enterBranch({
      sessionId: session.id, sourceId: source.id, anchor: '一阶泰勒展开',
      question: '什么是泰勒展开？', answer: '它是局部多项式近似。',
    });
    const result = await store.returnFromBranch({
      sessionId: session.id, target: 'parent', disposition: 'resolved',
      summary: '泰勒展开用多项式描述函数在某点附近的变化。',
    });

    assert.equal(result.activeNodeId, 'root');
    assert.match(result.resumeExcerpt, /一阶泰勒展开/);
    assert.equal(result.summary, '泰勒展开用多项式描述函数在某点附近的变化。');
    const snapshot = await store.getSession(session.id);
    assert.equal(snapshot.branches[0].status, 'resolved');
    assert.equal(snapshot.sources[0].text, lessonText);
  });
});

test('return to root from nested branches uses the root branch anchor and leaves ancestors paused', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '牛顿法', question: '解释', answer: lessonText });
    const rootSource = (await store.getSession(session.id)).sources[0];
    const parent = await store.enterBranch({
      sessionId: session.id, sourceId: rootSource.id, anchor: '一阶泰勒展开',
      question: '泰勒展开是什么？', answer: '它是局部近似。',
    });
    await store.enterBranch({
      sessionId: session.id, sourceId: parent.source.id, anchor: '局部近似',
      question: '局部是什么意思？', answer: '在指定点附近。',
    });
    const result = await store.returnFromBranch({
      sessionId: session.id, target: 'root', disposition: 'paused',
    });
    const snapshot = await store.getSession(session.id);

    assert.equal(result.activeNodeId, 'root');
    assert.match(result.resumeExcerpt, /一阶泰勒展开近似函数/);
    assert.equal(snapshot.branches[0].status, 'paused');
    assert.equal(snapshot.branches[1].status, 'paused');
  });
});

test('a paused branch can be resumed without deleting its messages', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '牛顿法', question: '解释', answer: lessonText });
    const source = (await store.getSession(session.id)).sources[0];
    const branch = await store.enterBranch({
      sessionId: session.id, sourceId: source.id, anchor: '一阶泰勒展开',
      question: '讲讲泰勒展开', answer: '局部多项式近似。',
    });
    await store.returnFromBranch({ sessionId: session.id, target: 'parent', disposition: 'paused' });
    const beforeResume = await store.getSession(session.id);
    const resumed = await store.resumeBranch({ sessionId: session.id, branchId: branch.branch.id });

    assert.equal(resumed.activeNodeId, branch.branch.nodeId);
    assert.equal(resumed.session.revision, beforeResume.session.revision + 1);
    assert.match(resumed.context.map((turn) => turn.text).join('\n'), /局部多项式近似/);
    assert.equal(resumed.path.at(-1).status, 'active');
    assert.equal(resumed.branches[0].status, 'active');
  });
});

test('returning to a parent branch keeps its tree status in sync', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '牛顿法', question: '解释', answer: lessonText });
    const rootSource = (await store.getSession(session.id)).sources[0];
    const parent = await store.enterBranch({ sessionId: session.id, sourceId: rootSource.id,
      anchor: '一阶泰勒展开', question: '泰勒展开是什么？', answer: '它是局部近似。' });
    await store.enterBranch({ sessionId: session.id, sourceId: parent.source.id,
      anchor: '局部近似', question: '局部是什么意思？', answer: '在指定点附近。' });
    await store.returnFromBranch({ sessionId: session.id, disposition: 'paused' });
    const current = await store.getSession(session.id);
    assert.equal(current.activeNodeId, parent.branch.nodeId);
    assert.equal(current.branches.find((branch) => branch.id === parent.branch.id).status, 'active');
    assert.equal(current.branches.find((branch) => branch.id !== parent.branch.id).status, 'paused');
  });
});

test('a mistaken branch can be abandoned without erasing its history', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '牛顿法', question: '解释', answer: lessonText });
    const source = (await store.getSession(session.id)).sources[0];
    const branch = await store.enterBranch({
      sessionId: session.id, sourceId: source.id, anchor: '一阶泰勒展开',
      question: '什么是泰勒展开？', answer: '它是局部近似。',
    });
    await store.abandonBranch({ sessionId: session.id });
    const snapshot = await store.getSession(session.id);

    assert.equal(snapshot.session.activeNodeId, 'root');
    assert.equal(snapshot.branches[0].status, 'abandoned');
    assert.equal(snapshot.sources.some((sourceItem) => sourceItem.id === branch.source.id), true);
  });
});

test('stale revisions are rejected before a write', async () => {
  await withStore(async (store) => {
    const session = await store.start({ title: '牛顿法', question: '解释', answer: lessonText });
    const first = await store.getSession(session.id);
    await store.appendTurn({
      sessionId: session.id, userText: '再举个例子。', answer: '用 x²-2 做示例。',
      expectedRevision: first.session.revision,
    });
    await assert.rejects(
      store.appendTurn({
        sessionId: session.id, userText: '继续。', answer: '下一句。',
        expectedRevision: first.session.revision,
      }),
      (error) => error instanceof StoreError && error.code === 'REVISION_CONFLICT',
    );
    const after = await store.getSession(session.id);
    assert.equal(after.session.revision, first.session.revision + 1);
    assert.equal(after.context.at(-1).text, '用 x²-2 做示例。');
  });
});

test('a branch cannot anchor to another branch or session and resolved branches need a summary', async () => {
  await withStore(async (store) => {
    const first = await store.start({ title: '牛顿法', question: '解释', answer: lessonText });
    const second = await store.start({ title: '插值', question: '解释插值', answer: '差商构造插值多项式。' });
    const rootSource = (await store.getSession(first.id)).sources[0];
    await assert.rejects(
      store.enterBranch({
        sessionId: first.id, sourceId: (await store.getSession(second.id)).sources[0].id,
        anchor: '插值', question: '解释', answer: '回答',
      }),
      (error) => error instanceof StoreError && error.code === 'SOURCE_NOT_CURRENT',
    );
    await store.enterBranch({
      sessionId: first.id, sourceId: rootSource.id, anchor: '一阶泰勒展开',
      question: '解释', answer: '回答',
    });
    await assert.rejects(
      store.returnFromBranch({ sessionId: first.id, target: 'parent', disposition: 'resolved' }),
      (error) => error instanceof StoreError && error.code === 'SUMMARY_REQUIRED',
    );
    assert.equal((await store.getSession(first.id)).path.at(-1).status, 'active');
  });
});
