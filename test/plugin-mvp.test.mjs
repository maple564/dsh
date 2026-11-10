import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const client = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),
  '../dsh-plugin/client.js'), 'utf8');

test('mapped selection opens a child Session and returns with a visible card and tree', async () => {
  const slots = new Map();
  const hooks = new Map();
  const listeners = new Map();
  const browserListeners = new Map();
  let component;
  let hookIndex = 0;
  let current = 'main';
  let selection;
  let submitted;
  let created = 0;
  let branchIds = 0;
  const storage = new Map();
  const sourceText = '前文核心思想后文';
  const sourceNode = { data: { status: 'settled',
    blocks: [{ kind: 'text', text: sourceText }],
    finalNode: { seq: 19, messageId: 'answer-1' },
  } };
  const childNode = { data: { status: 'settled',
    blocks: [{ kind: 'text', text: '支线真实回答' }],
    finalNode: { seq: 25, messageId: 'child-answer' },
  } };
  const chats = {
    main: { nodes: new Map([['14:assistant-step1:1', sourceNode]]), timeline: {
      turns: new Map([[1, { end: { seq: 21 }, data: new Map([
        ['turn-tail', { closing: { finalNode: { messageId: 'answer-1' } } }],
      ]) }]]),
    } },
    child: { nodes: new Map([['14:assistant-step1:1', childNode]]) },
  };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const owner = component;
      const index = hookIndex++;
      let state = hooks.get(owner);
      if (!state) { state = []; hooks.set(owner, state); }
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (next) => { state[index] = next; }];
    },
    useEffect(effect) { effect(); },
    useRef(initial) { return React.useState({ current: initial })[0]; },
  };
  function render(fn, props = {}) {
    component = fn;
    hookIndex = 0;
    const result = fn(props);
    component = null;
    return result;
  }
  const ctx = {
    slots: { inject(_name, callback) { callback(); },
      register(options, fn) { slots.set(options.name, fn); } },
    uiSession: { current: { getSnapshot: () => ({ key: current }), subscribe: () => () => {} } },
    uiConversation: { binding(id) { return { target() {
      return { getSnapshot: () => chats[id] };
    } }; } },
    sessions: {
      list: { getSnapshot: () => ({ byId: { main: { cwd: 'D:/workspace' } } }) },
      create: async () => (++created === 1 ? 'child' : 'grandchild'),
      retain: () => ({ ready: Promise.resolve({ session: { prompt: async (content) => {
        submitted = content[0].text;
        return { ok: true };
      } } }), release() {} }),
    },
    uiWorkspace: { openSession(id) { current = id; } },
  };
  const textNode = { nodeType: 3, nodeValue: sourceText };
  const scroll = { nodeType: 1, scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0 }),
    closest: () => null };
  const row = { nodeType: 1, tagName: 'DIV', childNodes: [textNode],
    parentElement: scroll,
    getAttribute(name) { return {
      'data-chat-flow-kind': 'assistant-step', 'data-chat-group-part': 'response',
      'data-chat-node-key': '14:assistant-step1:1',
      'data-chat-anchor-key': '14:assistant-step1:1', 'data-chat-turn': '1',
    }[name] ?? null; },
    hasAttribute(name) { return name.startsWith('data-chat-'); },
    closest(selector) { return selector === '[data-chat-flow-kind]' ? this : scroll; },
    getBoundingClientRect: () => ({ top: 100 }),
  };
  textNode.parentElement = row;
  scroll.childNodes = [row];
  scroll.hasAttribute = (name) => name === 'data-conversation-scroll';
  scroll.closest = (selector) => selector === '[data-conversation-scroll]' ? scroll : null;
  const start = sourceText.indexOf('核心思想');
  selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => ({
    startContainer: textNode, endContainer: textNode, startOffset: start,
    endOffset: start + 4, commonAncestorContainer: textNode,
    toString: () => '核心思想',
  }) };
  const browser = {
    getSelection: () => selection,
    localStorage: { getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => `branch-${++branchIds}` },
    dispatchEvent(event) { browserListeners.get(event.type)?.forEach((fn) => fn()); },
    addEventListener(name, fn) {
      const callbacks = browserListeners.get(name) ?? [];
      callbacks.push(fn);
      browserListeners.set(name, callbacks);
    },
    removeEventListener() {},
    setTimeout() {},
    __ModuleLoader__: { load(module) { module.factory(() => React).apply(ctx); } },
  };
  const document = { addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener() {}, querySelectorAll: () => [] };
  vm.runInNewContext(client, { window: browser, document,
    Event: class { constructor(type) { this.type = type; } },
    requestAnimationFrame: (fn) => { fn(); return 1; },
    cancelAnimationFrame() {} });
  const Dock = slots.get('conversation.composer.dock');
  render(Dock);
  listeners.get('selectionchange')();
  const dock = render(Dock);
  assert.equal(dock.props['data-anchor-status'], 'mapped');
  const controls = dock.children.find((child) => child?.props?.onClear);
  let form = render(controls.type, controls.props);
  form.children[0].props.onChange({ target: { value: '请解释这个片段' } });
  form = render(controls.type, controls.props);
  await form.children[1].props.onClick();
  assert.equal(current, 'child');
  assert.match(submitted, /前文核心思想/);
  assert.doesNotMatch(submitted, /后文/);
  textNode.nodeValue = '支线真实回答';
  selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => ({
    startContainer: textNode, endContainer: textNode, startOffset: 0,
    endOffset: 2, commonAncestorContainer: textNode, toString: () => '支线',
  }) };
  listeners.get('selectionchange')();
  const nestedDock = render(Dock);
  assert.equal(nestedDock.props['data-anchor-status'], 'mapped');
  const nestedControls = nestedDock.children.find((child) => child?.props?.onClear);
  let nested = render(nestedControls.type, nestedControls.props);
  assert.equal(nested.children[0].children[2].children[0], '返回原文');
  assert.equal(nested.children[1].children[1].children[0], '深入追问');
  nested.children[1].children[0].props.onChange({ target: { value: '嵌套问题' } });
  nested = render(nestedControls.type, nestedControls.props);
  await nested.children[1].children[1].props.onClick();
  assert.equal(current, 'grandchild');
  assert.equal(JSON.parse(storage.get('conversation-structure/branches/v1'))[1].parentSessionId, 'child');
  current = 'child';
  assert.ok(render(slots.get('conversation.chat.assistant-actions'),
    { messageId: 'child-answer' }));
  const childDock = render(Dock);
  const childControls = childDock.children.find((child) => child?.props?.onClear);
  form = render(childControls.type, childControls.props);
  form.children[0].children[2].props.onClick();
  assert.equal(current, 'main');
  const saved = JSON.parse(storage.get('conversation-structure/branches/v1'));
  assert.equal(saved[0].status, 'paused');
  assert.equal(saved[0].answerPreview, '支线真实回答');
  const card = render(slots.get('conversation.chat.assistant-actions'), { messageId: 'answer-1' });
  assert.ok(card);
  assert.match(JSON.stringify(card), /已暂停/);
  assert.equal(slots.has('shell.overlay'), true);
  const TreePanel = slots.get('shell.overlay');
  let tree = render(TreePanel);
  tree.children[0].props.onClick();
  tree = render(TreePanel);
  assert.match(JSON.stringify(tree), /支线 · 进行中/);
});
