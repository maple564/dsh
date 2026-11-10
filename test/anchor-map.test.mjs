import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintText, resolveRawAnchor } from '../lib/anchor-map.mjs';

function input(renderedText, sourceText, start, end, overrides = {}) {
  const sourceRef = { sessionId: 'session-test', nodeKey: '14:assistant-step1:1',
    finalSeq: 19, messageId: 'message-test', digest: fingerprintText(sourceText) };
  return {
    candidate: { status: 'candidate', quote: renderedText.slice(start, end),
      start, end, nodeKey: sourceRef.nodeKey, sourceRef,
      digest: fingerprintText(renderedText), textLength: renderedText.length },
    renderedText, sourceText, sourceRef, ...overrides,
  };
}

function resolve(renderedText, sourceText, start, end) {
  return resolveRawAnchor(input(renderedText, sourceText, start, end));
}

test('maps contiguous visible text through Markdown and UTF-16 offsets', () => {
  assert.deepEqual(resolve('前文 核心 后文', '前文 **核心** 后文', 3, 5),
    { status: 'mapped', anchor: '核心', anchorStart: 5, anchorEnd: 7 });
  assert.equal(resolve('😀核心', '😀**核心**', 2, 4).anchorStart, 4);
});

test('maps exact repeated and overlapping selections by projected position', () => {
  assert.equal(resolve('核心 核心', '**核心** 核心', 0, 2).anchorStart, 2);
  assert.equal(resolve('核心 核心', '**核心** 核心', 3, 5).anchorStart, 7);
  assert.equal(resolve('aaaaa', 'aaaaa', 1, 4).anchorStart, 1);
  assert.equal(resolve('aaaaa', '**aaaaa**', 1, 4).anchorStart, 3);
});

test('maps headings, list text, code and repeated phrases without guessing by ordinal', () => {
  const rendered = '二分查找\n\n二分查找\n\nbinary_search\n\n再用 binary_search';
  const source = '# 二分查找\n\n- **二分查找**\n\n```python\nbinary_search\n```\n\n再用 binary_search';
  const first = rendered.indexOf('二分查找');
  const second = rendered.indexOf('二分查找', first + 1);
  const code = rendered.indexOf('binary_search');
  assert.equal(resolve(rendered, source, first, first + 4).anchorStart, source.indexOf('二分查找'));
  assert.equal(resolve(rendered, source, second, second + 4).anchorStart,
    source.indexOf('二分查找', source.indexOf('二分查找') + 1));
  assert.equal(resolve(rendered, source, code, code + 13).anchorStart, source.indexOf('binary_search'));
});

test('keeps paragraph breaks and code blank lines without counting fence lines', () => {
  const source = '先解释。\n\n```python\nreturn -1\n\n\nnums\n```\n\n继续解释。';
  const rendered = '先解释。\n\nreturn -1\n\n\nnums\n\n继续解释。';
  const start = rendered.indexOf('nums');
  assert.equal(resolve(rendered, source, start, start + 4).anchorStart,
    source.indexOf('nums'));
});

test('rejects hidden Markdown destinations and titles, even when quote is unique in raw source', () => {
  const link = '前文 [**核**心思想](https://x/核心思想) 后文';
  const visible = '前文 核心思想 后文';
  assert.notEqual(resolve(visible, link, 3, 7).status, 'mapped');
  assert.notEqual(resolve('前文核心思想后文', link, 2, 6).status, 'mapped');
  assert.notEqual(resolve('核心', '[**核**心](https://example.com "核心")', 0, 2).status, 'mapped');
  const source = '[查看](https://x/核心) 核心';
  assert.equal(resolve('查看 核心', source, 3, 5).anchorStart, source.lastIndexOf('核心'));
});

test('rejects HTML attributes and unsupported rendered syntax', () => {
  assert.equal(resolve('可见 核心 结束',
    '可见 <span title="核心">核</span><b>心</b> 结束', 3, 5).code,
  'SOURCE_PROJECTION_UNSUPPORTED');
});

test('rejects selections crossing Markdown markers and mismatched projections', () => {
  assert.equal(resolve('核心思想', '**核心**思想', 0, 4).code, 'SOURCE_NOT_FOUND');
  assert.equal(resolve('核心 核心', '**核心** 核心 多余', 0, 2).code,
    'SOURCE_PROJECTION_MISMATCH');
});

test('requires a matching source event and source text fingerprint', () => {
  const original = input('核心', '**核心**', 0, 2);
  assert.equal(resolveRawAnchor({ ...original, candidate: { ...original.candidate,
    sourceRef: undefined } }).code, 'SOURCE_VERSION_REQUIRED');
  assert.equal(resolveRawAnchor({ ...original, sourceRef: { ...original.sourceRef,
    finalSeq: 20 } }).code, 'SOURCE_VERSION_MISMATCH');
  assert.equal(resolveRawAnchor({ ...original, sourceText: '另一版本 **核心**' }).code,
    'SOURCE_STALE');
});

test('rejects stale or inconsistent rendered candidates', () => {
  const original = input('对', '对', 0, 1);
  assert.equal(resolveRawAnchor({ ...original, candidate: { ...original.candidate,
    quote: '错' } }).code, 'RENDERED_MISMATCH');
  assert.equal(resolveRawAnchor({ ...original, candidate: { ...original.candidate,
    digest: 'bad' } }).code, 'RENDERED_STALE');
  assert.equal(resolveRawAnchor({ ...original, candidate: { ...original.candidate,
    start: -1 } }).code, 'INVALID_CANDIDATE');
});
