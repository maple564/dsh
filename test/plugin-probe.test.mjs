import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = await readFile(path.join(here, '../dsh-plugin/client.js'), 'utf8');

function element(tag, attributes = {}, children = []) {
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(), childNodes: children,
    parentElement: null,
    getAttribute(name) { return attributes[name] ?? null; },
    hasAttribute(name) { return Object.hasOwn(attributes, name); },
    querySelector() { return null; },
    closest(selector) {
      if (selector === '[data-chat-flow-kind]' && this.hasAttribute('data-chat-flow-kind')) return this;
      if (selector === '[data-conversation-scroll]' && this.hasAttribute('data-conversation-scroll')) return this;
      return this.parentElement?.closest(selector) ?? null;
    },
  };
  for (const child of children) child.parentElement = node;
  return node;
}

function text(value) { return { nodeType: 3, nodeValue: value, parentElement: null }; }

function row(kind, part, children, key = '14:assistant-step1:1') {
  const chat = element('div', { 'data-conversation-scroll': '' });
  const answer = element('div', {
    'data-chat-flow-kind': kind,
    'data-chat-group-part': part,
    'data-chat-node-key': key,
    'data-chat-anchor-key': key,
    'data-chat-turn': '1',
  }, children);
  chat.childNodes.push(answer);
  answer.parentElement = chat;
  return answer;
}

function probe() {
  let selection = null;
  let state = null;
  let Dock;
  const listeners = new Map();
  const frames = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: () => [state, (value) => { state = value; }],
    useEffect: (effect) => { effect(); },
  };
  const window = {
    getSelection: () => selection,
    __ModuleLoader__: {
      load(module) {
        const plugin = module.factory((name) => {
          assert.equal(name, 'react');
          return React;
        });
        plugin.apply({ slots: {
          inject(_name, callback) { callback(); },
          register(options, component) {
            if (options.name === 'conversation.composer.dock') Dock = component;
          },
        } });
      },
    },
  };
  const document = { addEventListener(name, listener) { listeners.set(name, listener); }, removeEventListener() {} };
  vm.runInNewContext(client, { window, document,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
  });
  Dock();
  return {
    select(startContainer, startOffset, endContainer, endOffset, selectedText) {
      const range = {
        startContainer, startOffset, endContainer, endOffset,
        commonAncestorContainer: startContainer,
        toString: () => selectedText ?? (startContainer === endContainer
          ? startContainer.nodeValue.slice(startOffset, endOffset) : '跨节点选区'),
      };
      selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range };
      listeners.get('selectionchange')();
      while (frames.length) frames.shift()();
      const rendered = Dock();
      return { status: rendered.props['data-anchor-status'], message: rendered.children[1].children[0], title: rendered.props.title };
    },
  };
}

test('reasoning and non-answer selections show explicit rejection', () => {
  const inspect = probe();
  const thinking = text('思考过程');
  row('assistant-step', 'reasoning', [thinking]);
  assert.match(inspect.select(thinking, 0, thinking, 4).message, /思考过程，不是回答正文/);

  const user = text('请解释');
  row('user-step', null, [user]);
  assert.match(inspect.select(user, 0, user, 2).message, /用户消息/);

  const process = text('已完成');
  row('turn-process', null, [process]);
  assert.match(inspect.select(process, 0, process, 2).message, /处理过程/);
});

test('cross-message and code banner selections cannot become anchors', () => {
  const inspect = probe();
  const first = text('第一条回答');
  const second = text('第二条回答');
  row('assistant-step', 'response', [first]);
  row('assistant-step', 'response', [second], '14:assistant-step2:1');
  assert.match(inspect.select(first, 0, second, 2).message, /跨越了多条消息/);

  const language = text('python');
  const code = text('def search(): pass');
  row('assistant-step', 'response', [element('div', { 'data-code-block-banner': '' }, [language]), element('pre', {}, [code])]);
  const rejected = inspect.select(language, 0, code, 3, 'pythondef');
  assert.equal(rejected.status, 'rejected');
  assert.match(rejected.message, /界面元素/);
  const accepted = inspect.select(code, 0, code, 3);
  assert.equal(accepted.status, 'candidate');
  assert.match(accepted.message, /“def”/);
});

test('a repeated phrase reports its rendered occurrence without claiming a raw offset', () => {
  const inspect = probe();
  const answer = text('二分查找。然后二分查找。最后二分查找。');
  row('assistant-step', 'response', [answer]);
  const second = answer.nodeValue.indexOf('二分查找', 1);
  const result = inspect.select(answer, second, answer, second + 4);
  assert.equal(result.status, 'candidate');
  assert.match(result.message, /第 2\/3 处/);
  assert.match(result.message, /未映射原文/);
  assert.match(result.title, /内容指纹/);
});

test('paragraph boundary contributes a canonical rendered newline', () => {
  const inspect = probe();
  const first = text('第一段');
  const second = text('第二段');
  row('assistant-step', 'response', [element('p', {}, [first]), element('p', {}, [second])]);
  const result = inspect.select(second, 0, second, 3);
  assert.equal(result.status, 'candidate');
  assert.match(result.message, /渲染文本 4–7/);
});

test('text selected across inline formatting remains one anchor candidate', () => {
  const inspect = probe();
  const bold = text('二分查找');
  const plain = text('的核心思想');
  row('assistant-step', 'response', [element('strong', {}, [bold]), plain]);
  const result = inspect.select(bold, 2, plain, 4, '查找的核心思');
  assert.equal(result.status, 'candidate');
  assert.match(result.message, /查找的核心思/);
});
