window.__ModuleLoader__.load({
  id: '@local/conversation-structure-ui',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // Only map a selection when we can reconstruct the whole visible answer from
// the same, versioned Markdown source. Unknown syntax rejects.
// Every offset uses JavaScript UTF-16 code units.

function fingerprintText(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function reject(code) {
  return { status: 'rejected', code };
}

function validRef(ref) {
  return ref && typeof ref.sessionId === 'string' && ref.sessionId.length > 0 &&
    typeof ref.nodeKey === 'string' && ref.nodeKey.length > 0 &&
    Number.isSafeInteger(ref.finalSeq) && ref.finalSeq >= 0 &&
    typeof ref.messageId === 'string' && ref.messageId.length > 0 &&
    typeof ref.digest === 'string' && /^[0-9a-f]{8}$/.test(ref.digest);
}

function closingBracket(source, start, end) {
  let depth = 1;
  for (let i = start; i < end; i += 1) {
    if (source[i] === '\\') { i += 1; continue; }
    if (source[i] === '[') depth += 1;
    if (source[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

function closingParenthesis(source, start, end) {
  let depth = 1;
  for (let i = start; i < end; i += 1) {
    if (source[i] === '\\') { i += 1; continue; }
    if (source[i] === '(') depth += 1;
    if (source[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function projectInline(source, from, to, add) {
  for (let i = from; i < to;) {
    const char = source[i];
    if (char === '\\' && i + 1 < to && /[\\`*_{}\[\]()#+.!~>-]/.test(source[i + 1])) {
      add(source[i + 1], i + 1);
      i += 2;
      continue;
    }
    if (char === '!' && source[i + 1] === '[') return false; // Image alt rendering varies.
    if (char === '[') {
      const bracket = closingBracket(source, i + 1, to);
      if (bracket !== -1 && source[bracket + 1] === '(') {
        const close = closingParenthesis(source, bracket + 2, to);
        if (close !== -1) {
          if (!projectInline(source, i + 1, bracket, add)) return false;
          i = close + 1; // Destination and optional title are not visible.
          continue;
        }
      }
    }
    if (char === '`') {
      let runLength = 1;
      while (source[i + runLength] === '`') runLength += 1;
      const marker = '`'.repeat(runLength);
      const close = source.indexOf(marker, i + runLength);
      if (close !== -1 && close < to) {
        for (let j = i + runLength; j < close; j += 1) add(source[j], j);
        i = close + runLength;
        continue;
      }
    }
    if (char === '<' && /^<\/?[a-zA-Z!]/.test(source.slice(i, i + 4))) return false;
    if (char === '&' && /^&(?:#[0-9]+|#x[0-9a-f]+|[a-z]+);/i.test(source.slice(i))) return false;
    if ('*_~'.includes(char)) {
      const marker = char === '~' ? '~~' : source[i + 1] === char ? char + char : char;
      if (char !== '~' || source[i + 1] === '~') {
        const close = source.indexOf(marker, i + marker.length);
        if (close > i + marker.length && close < to && source[close - 1] !== '\\') {
          if (!projectInline(source, i + marker.length, close, add)) return false;
          i = close + marker.length;
          continue;
        }
      }
    }
    add(char, i);
    i += 1;
  }
  return true;
}

function projectSource(source) {
  const characters = [];
  const offsets = [];
  const add = (char, offset) => { characters.push(char); offsets.push(offset); };
  let fence = null;

  for (let start = 0; start < source.length;) {
    const newline = source.indexOf('\n', start);
    const next = newline === -1 ? source.length : newline;
    const end = next > start && source[next - 1] === '\r' ? next - 1 : next;
    const line = source.slice(start, end);
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    let fenceLine = false;

    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length &&
          !marker[2].trim()) {
        fence = null;
        fenceLine = true;
      } else {
        for (let i = start; i < end; i += 1) add(source[i], i);
      }
    } else if (marker) {
      fence = marker[1];
      fenceLine = true;
    } else {
      const prefix = line.match(/^ {0,3}(?:#{1,6}[ \t]+|>[ \t]?|(?:[-+*]|[0-9]+[.)])[ \t]+)/);
      const from = start + (prefix?.[0].length ?? 0);
      let contentEnd = end;
      while (contentEnd > from && source[contentEnd - 1] === ' ') contentEnd -= 1;
      if (!projectInline(source, from, contentEnd, add)) return null;
    }
    // The fence line itself is UI chrome. The preceding paragraph break and
    // the code's own trailing newline already delimit the visible code block.
    if (newline !== -1 && !fenceLine) add('\n', newline);
    start = next + 1;
  }
  if (fence) return null;

  // Keep paragraph and code-internal blank lines. Empty leading raw lines do
  // not create DOM text; the probe trims trailing newlines from the answer.
  let first = 0;
  let last = characters.length;
  while (characters[first] === '\n') first += 1;
  while (last > first && characters[last - 1] === '\n') last -= 1;
  return { text: characters.slice(first, last).join(''),
    offsets: offsets.slice(first, last) };
}

function resolveRawAnchor({ candidate, renderedText, sourceText, sourceRef } = {}) {
  if (typeof renderedText !== 'string' || typeof sourceText !== 'string' ||
      candidate?.status !== 'candidate' || typeof candidate.quote !== 'string' ||
      !Number.isSafeInteger(candidate.start) || !Number.isSafeInteger(candidate.end) ||
      candidate.start < 0 || candidate.end <= candidate.start ||
      candidate.end > renderedText.length || !candidate.quote.trim()) {
    return reject('INVALID_CANDIDATE');
  }

  const { quote, start, end } = candidate;
  if (renderedText.slice(start, end) !== quote) return reject('RENDERED_MISMATCH');
  if (candidate.textLength !== undefined && candidate.textLength !== renderedText.length)
    return reject('RENDERED_STALE');
  if (candidate.digest !== undefined && candidate.digest !== fingerprintText(renderedText))
    return reject('RENDERED_STALE');

  if (!validRef(candidate.sourceRef) || !validRef(sourceRef))
    return reject('SOURCE_VERSION_REQUIRED');
  const fields = ['sessionId', 'nodeKey', 'finalSeq', 'messageId', 'digest'];
  if (fields.some((field) => candidate.sourceRef[field] !== sourceRef[field]) ||
      (candidate.nodeKey !== undefined && candidate.nodeKey !== sourceRef.nodeKey))
    return reject('SOURCE_VERSION_MISMATCH');
  if (sourceRef.digest !== fingerprintText(sourceText)) return reject('SOURCE_STALE');

  const projected = sourceText === renderedText
    ? { text: sourceText, offsets: Array.from({ length: sourceText.length }, (_, i) => i) }
    : projectSource(sourceText);
  if (!projected) return reject('SOURCE_PROJECTION_UNSUPPORTED');
  if (projected.text !== renderedText) return reject('SOURCE_PROJECTION_MISMATCH');

  const rawStart = projected.offsets[start];
  for (let i = start; i < end; i += 1) {
    if (projected.offsets[i] !== rawStart + i - start) return reject('SOURCE_NOT_FOUND');
  }
  return { status: 'mapped', anchor: quote, anchorStart: rawStart,
    anchorEnd: rawStart + quote.length };
}

    let appCtx;
    const STYLE_ID = 'conversation-structure-ui-styles';
    const UI_STYLES = `
      .cs-ui {
        --cs-panel: rgba(23, 28, 36, .97); --cs-card: #1d242e; --cs-card-active: #242d38;
        --cs-border: #35404e; --cs-border-soft: #2b3440; --cs-text: #e7e9ed;
        --cs-muted: #a2aab5; --cs-accent: #9bb8ad; --cs-accent-strong: #b2d0c3;
        --cs-accent-wash: rgba(155, 184, 173, .12); --cs-danger: #e0a38e;
        color: var(--cs-text); font-family: inherit;
      }
      .cs-ui button, .cs-ui input { font: inherit; }
      .cs-field {
        background: #171c23; color: var(--cs-text); border: 1px solid var(--cs-border);
        border-radius: 8px; padding: 8px 10px; transition: border-color .16s, box-shadow .16s;
      }
      .cs-field::placeholder { color: #87919e; }
      .cs-field:focus { outline: none; border-color: var(--cs-accent); box-shadow: 0 0 0 3px var(--cs-accent-wash); }
      .cs-button {
        background: #34443f; color: #e6eee9; border: 1px solid #50635b; border-radius: 8px;
        padding: 7px 11px; cursor: pointer; transition: background .16s, border-color .16s, transform .16s;
      }
      .cs-button:hover { background: #40534b; border-color: #73877d; transform: translateY(-1px); }
      .cs-button:active { transform: translateY(0); }
      .cs-button:disabled { opacity: .5; cursor: default; transform: none; }
      .cs-button--quiet { background: #252c35; border-color: var(--cs-border); color: #c6cbd2; }
      .cs-tree-shell { position: fixed; right: 18px; top: 80px; z-index: 1000; font-size: 13px; pointer-events: auto; }
      .cs-tree-trigger { background: #252e34; color: #e3ebe7; border: 1px solid #4b5b54; border-radius: 9px; padding: 8px 12px; cursor: pointer; transition: all .18s; }
      .cs-tree-trigger:hover { background: #303d38; border-color: var(--cs-accent); }
      .cs-tree-panel {
        box-sizing: border-box; width: min(350px, calc(100vw - 36px)); max-height: min(70vh, 720px); overflow-y: auto; margin-top: 8px;
        border: 1px solid var(--cs-border); border-radius: 14px; padding: 14px;
        background: var(--cs-panel); color: var(--cs-text); box-shadow: 0 18px 48px rgba(0,0,0,.34);
        backdrop-filter: blur(16px); animation: cs-panel-in .2s cubic-bezier(.2,.75,.3,1) both;
      }
      .cs-tree-title { font-weight: 650; letter-spacing: .02em; margin: 0; }
      .cs-tree-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .cs-tree-count { color: var(--cs-muted); font-size: 11px; border: 1px solid var(--cs-border-soft); border-radius: 20px; padding: 3px 8px; }
      .cs-tree-location { color: var(--cs-accent-strong); font-size: 12px; line-height: 1.6; padding: 9px 10px; margin: 8px 0; background: var(--cs-accent-wash); border-radius: 8px; overflow-wrap: anywhere; }
      .cs-tree-legend { color: var(--cs-muted); font-size: 11px; line-height: 1.5; margin: 10px 0 2px; }
      .cs-current-badge { display: inline-flex; align-items: center; gap: 5px; color: #d4e9df; background: #35483f; border: 1px solid #506c5d; border-radius: 20px; padding: 2px 7px; font-size: 10px; margin-right: 5px; vertical-align: middle; }
      .cs-current-badge::before { content: ''; width: 5px; height: 5px; background: #b2d0c3; border-radius: 50%; box-shadow: 0 0 7px #9bb8ad66; }
      .cs-tree-root, .cs-tree-collapse { background: transparent; border: 0; color: var(--cs-muted); cursor: pointer; padding: 5px 6px; }
      .cs-tree-root:hover, .cs-tree-collapse:hover { color: var(--cs-text); }
      .cs-tree-children, .cs-tree-nested { margin: 10px 0 0; display: grid; gap: 8px; }
      .cs-tree-node-wrap { position: relative; min-width: 0; padding-left: 24px; }
      .cs-tree-node-wrap::before { content: ''; position: absolute; left: 3px; top: 0; bottom: -8px; width: 1px; background: var(--cs-border-soft); }
      .cs-tree-node-wrap:last-child::before { bottom: auto; height: 22px; }
      .cs-tree-edge { position: absolute; left: 0; top: 0; width: 24px; height: 36px; overflow: visible; pointer-events: none; fill: none; }
      .cs-tree-edge-base, .cs-tree-edge-arrow { stroke: #47534f; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
      .cs-tree-edge-flow { display: none; stroke: #c2dece; stroke-width: 1.8; stroke-linecap: round; stroke-dasharray: 7 20; animation: cs-path-flow 1.8s linear infinite; }
      .cs-tree-node-wrap[data-on-path="true"] > .cs-tree-edge .cs-tree-edge-base { stroke: #708f80; }
      .cs-tree-node-wrap[data-on-path="true"] > .cs-tree-edge .cs-tree-edge-arrow { stroke: #b2d0c3; }
      .cs-tree-node-wrap[data-on-path="true"] > .cs-tree-edge .cs-tree-edge-flow { display: block; }
      .cs-tree-node-wrap[data-on-path="true"] > .cs-tree-node { border-color: #52675b; }
      .cs-tree-node {
        background: #1b222b; color: var(--cs-text); border: 1px solid var(--cs-border-soft);
        border-radius: 9px; padding: 9px 10px; transition: background .16s, border-color .16s;
      }
      .cs-tree-node:hover { border-color: #526057; background: #202831; }
      .cs-tree-node[data-active="true"] { border-color: #71867b; background: #26332f; box-shadow: inset 2px 0 var(--cs-accent); }
      .cs-tree-node[data-active="true"] > summary { color: #edf5ef; }
      .cs-ui button:focus-visible, .cs-ui summary:focus-visible { outline: 2px solid var(--cs-accent-strong); outline-offset: 3px; }
      .cs-tree-node summary, .cs-card summary { cursor: pointer; list-style-position: outside; }
      .cs-tree-node summary { color: #e4e8e6; }
      .cs-tree-preview { color: var(--cs-muted); font-size: 12px; line-height: 1.55; white-space: pre-wrap; margin: 7px 0; }
      .cs-tree-empty { color: var(--cs-muted); padding: 7px; }
      .cs-card {
        border: 1px solid var(--cs-border); border-radius: 10px; background: #1b222b;
        color: var(--cs-text); padding: 9px 12px; transition: border-color .18s, background .18s;
      }
      .cs-card:hover, .cs-card[open] { border-color: #65786e; background: #202831; }
      .cs-card summary { color: #dfe5e1; font-size: 13px; }
      .cs-card-content { padding: 9px 2px 2px; color: #cbd1d5; font-size: 12px; line-height: 1.65; }
      .cs-card-answer { white-space: pre-wrap; color: #e0e3e5; margin-top: 6px; }
      .cs-status { color: var(--cs-muted); }
      .cs-experiment-option { display: inline-flex; align-items: center; gap: 6px; color: var(--cs-muted); font-size: 11px; padding: 3px 2px; }
      .cs-experiment-option input { accent-color: var(--cs-accent); }
      [data-anchor-status="mapped"] .cs-status { color: var(--cs-accent-strong); animation: cs-anchor-in .32s ease-out both; }
      [data-anchor-status="rejected"] .cs-status { color: var(--cs-danger); }
      @keyframes cs-panel-in { from { opacity: 0; transform: translateY(7px) scale(.99); } to { opacity: 1; transform: none; } }
      @keyframes cs-anchor-in { from { opacity: .45; transform: translateY(2px); } to { opacity: 1; transform: none; } }
      @keyframes cs-path-flow { to { stroke-dashoffset: -27; } }
      .cs-tree-shell[data-motion="off"] *, .cs-tree-shell[data-motion="off"] *::before, .cs-tree-shell[data-motion="off"] *::after { animation: none !important; transition: none !important; }
      .cs-tree-shell[data-motion="off"] .cs-tree-edge-flow { display: none !important; }
      @media (prefers-reduced-motion: reduce) {
        .cs-ui *, .cs-ui *::before, .cs-ui *::after { animation: none !important; transition: none !important; }
        .cs-tree-edge-flow { display: none !important; }
      }
    `;
    function installStyles() {
      if (!document?.head?.appendChild || document.getElementById?.(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = UI_STYLES;
      document.head.appendChild(style);
    }

    // This diagnostic probe reads DSH 0.2.1-rc.3 Chat DOM attributes.
    // They are version-dependent; re-check them when DSH changes.
    const CHAT_SCROLL = '[data-conversation-scroll]';
    const FLOW_ROW = '[data-chat-flow-kind]';

    // Block-level tags whose boundaries readers see as line breaks. The
    // canonical text below inserts one newline at these boundaries and
    // ignores UI chrome (code banners, copy buttons, icons).
    const BLOCK_TAGS = new Set([
      'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
      'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5',
      'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
      'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
    ]);
    const SKIP_TAGS = new Set(['BUTTON', 'INPUT', 'OPTION', 'SCRIPT', 'SELECT', 'STYLE', 'SVG', 'TEXTAREA']);

    function elementOf(node) {
      return node?.nodeType === 1 ? node : node?.parentElement;
    }

    function rejected(reason, row) {
      return {
        status: 'rejected',
        reason,
        nodeKey: row?.getAttribute('data-chat-node-key') ?? null,
        anchorKey: row?.getAttribute('data-chat-anchor-key') ?? null,
      };
    }

    // Build the answer's rendered text and index every mapped text node.
    // Offsets refer to this string, not to the Markdown source.
    function buildCanonical(root) {
      const map = new Map();
      let text = '';

      const walk = (node) => {
        if (node.nodeType === 3) {
          map.set(node, { start: text.length, end: text.length + node.nodeValue.length });
          text += node.nodeValue;
          return;
        }
        if (node.nodeType !== 1) return;
        if (SKIP_TAGS.has(node.tagName)) return;
        if (node.hasAttribute('data-code-block-banner')) return;
        if (node.getAttribute('aria-hidden') === 'true' && node.querySelector('[data-chat-anchor-key]') === null) return;
        if (node.tagName === 'BR') {
          text += '\n';
          return;
        }
        const block = BLOCK_TAGS.has(node.tagName);
        if (block && text.length > 0 && !text.endsWith('\n')) text += '\n';
        for (const child of node.childNodes) walk(child);
        if (block && text.length > 0 && !text.endsWith('\n')) text += '\n';
      };

      walk(root);
      while (text.endsWith('\n')) text = text.slice(0, -1);
      return { text, map };
    }

    function firstIndex(map, node) {
      if (node.nodeType === 3) {
        const entry = map.get(node);
        return entry ? entry.start : null;
      }
      if (node.nodeType !== 1) return null;
      for (const child of node.childNodes) {
        const found = firstIndex(map, child);
        if (found !== null) return found;
      }
      return null;
    }

    function lastIndex(map, node) {
      if (node.nodeType === 3) {
        const entry = map.get(node);
        return entry ? entry.end : null;
      }
      if (node.nodeType !== 1) return null;
      let found = null;
      for (const child of node.childNodes) {
        const childIndex = lastIndex(map, child);
        if (childIndex !== null) found = childIndex;
      }
      return found;
    }

    // A Range boundary can sit on an element (triple-click, drag past the
    // end of a paragraph); resolve it to the nearest mapped text position.
    function boundaryIndex(map, container, offset, edge) {
      if (container.nodeType === 3) {
        const entry = map.get(container);
        return entry && offset >= 0 && offset <= container.nodeValue.length ? entry.start + offset : null;
      }
      if (container.nodeType !== 1) return null;
      const children = [...container.childNodes];
      if (edge === 'start') {
        for (let i = offset; i < children.length; i += 1) {
          const found = firstIndex(map, children[i]);
          if (found !== null) return found;
        }
        return null;
      }
      for (let i = offset - 1; i >= 0; i -= 1) {
        const found = lastIndex(map, children[i]);
        if (found !== null) return found;
      }
      return null;
    }

    function countOccurrences(haystack, needle) {
      if (!needle) return 0;
      let count = 0;
      let index = 0;
      while ((index = haystack.indexOf(needle, index)) !== -1) {
        count += 1;
        index += 1;
      }
      return count;
    }

    function occurrenceOrdinal(haystack, needle, start) {
      let count = 0;
      let index = 0;
      while ((index = haystack.indexOf(needle, index)) !== -1) {
        count += 1;
        if (index === start) return count;
        index += 1;
      }
      return 0;
    }

    // Small content fingerprint so a stale anchor can be recognised after
    // the answer text changes. Not a cryptographic digest.
    function fingerprint(value) {
      let hash = 0x811c9dc5;
      for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function inspectSelection() {
      const picked = window.getSelection();
      if (!picked || picked.isCollapsed || !picked.rangeCount) return null;
      const range = picked.getRangeAt(0);
      if (!range.toString().trim()) return null;

      const startRow = elementOf(range.startContainer)?.closest?.(FLOW_ROW) ?? null;
      const endRow = elementOf(range.endContainer)?.closest?.(FLOW_ROW) ?? null;
      const insideChat = elementOf(range.commonAncestorContainer)?.closest?.(CHAT_SCROLL) ?? null;

      // Selections outside the transcript (sidebar, composer, settings) are
      // not anchor attempts; show the idle hint instead of a rejection.
      if (!startRow && !endRow && !insideChat) return null;
      if (!startRow || !endRow) return rejected('选区没有落在可识别的消息行内');
      if (startRow !== endRow) {
        const sameNode = startRow.getAttribute('data-chat-node-key') === endRow.getAttribute('data-chat-node-key');
        return rejected(sameNode ? '选区跨越了同一回答的多个片段' : '选区跨越了多条消息');
      }

      const kind = startRow.getAttribute('data-chat-flow-kind');
      if (kind !== 'assistant-step') {
        if (kind?.startsWith('user')) return rejected('只能选择 AI 回答正文（当前是用户消息）', startRow);
        if (kind === 'turn-process') return rejected('只能选择 AI 回答正文（当前是处理过程）', startRow);
        return rejected('只能选择 AI 回答正文（当前是 ' + (kind || '未知') + '）', startRow);
      }

      // A step is split into named parts; "reasoning" is the model's thinking
      // trace, not the answer body.
      const part = startRow.getAttribute('data-chat-group-part');
      if (part && part !== 'response') return rejected(part === 'reasoning'
        ? '选中的是思考过程，不是回答正文'
        : '当前片段不是回答正文（' + part + '）', startRow);

      const anchorKey = startRow.getAttribute('data-chat-anchor-key');
      const nodeKey = startRow.getAttribute('data-chat-node-key');
      if (!anchorKey || !nodeKey) return rejected('消息身份缺失', startRow);

      const { text, map } = buildCanonical(startRow);
      let start = boundaryIndex(map, range.startContainer, range.startOffset, 'start');
      let end = boundaryIndex(map, range.endContainer, range.endOffset, 'end');
      if (start === null || end === null) return rejected('选区包含无法映射的界面元素', startRow);
      if (start > end) [start, end] = [end, start];
      if (end > text.length) end = text.length;

      while (start < end && /\s/.test(text[start])) start += 1;
      while (end > start && /\s/.test(text[end - 1])) end -= 1;
      if (start >= end) return rejected('选区只有空白', startRow);

      const quote = text.slice(start, end);
      const occurrences = countOccurrences(text, quote);

      const candidate = {
        status: 'candidate',
        quote,
        start,
        end,
        occurrences,
        ordinal: occurrenceOrdinal(text, quote, start),
        textLength: text.length,
        digest: fingerprint(text),
        prefix: text.slice(Math.max(0, start - 40), start),
        suffix: text.slice(end, end + 40),
        nodeKey,
        anchorKey,
        turn: startRow.getAttribute('data-chat-turn'),
      };
      const sessionId = appCtx?.uiSession?.current?.getSnapshot?.()?.key;
      const chat = sessionId && appCtx?.uiConversation?.binding?.(sessionId)?.target?.('chat')?.getSnapshot?.();
      const node = chat?.nodes?.get?.(nodeKey);
      const final = node?.data?.status === 'settled' ? node.data.finalNode : null;
      if (!final) return candidate;
      const textBlocks = node.data.blocks?.filter((block) => block.kind === 'text') ?? [];
      if (textBlocks.length !== 1 || typeof textBlocks[0].text !== 'string' ||
          !Number.isSafeInteger(final.seq) || !final.messageId) {
        return rejected('这条回答的原文结构暂不支持开支线', startRow);
      }
      const sourceText = textBlocks[0].text;
      const sourceRef = { sessionId, nodeKey, finalSeq: final.seq,
        messageId: final.messageId, digest: fingerprintText(sourceText) };
      const mapped = resolveRawAnchor({ candidate: { ...candidate, sourceRef },
        renderedText: text, sourceText, sourceRef });
      if (mapped.status !== 'mapped') {
        return rejected('原文锚点无法确认（' + mapped.code + '）', startRow);
      }
      const scroller = startRow.closest(CHAT_SCROLL);
      return { ...candidate, status: 'mapped', sourceRef,
        anchorStart: mapped.anchorStart, anchorEnd: mapped.anchorEnd,
        sourcePrefix: sourceText.slice(0, mapped.anchorEnd),
        viewportOffset: scroller
          ? startRow.getBoundingClientRect().top - scroller.getBoundingClientRect().top
          : 0 };
    }

    function Truncated(value, limit) {
      return value.length > limit ? value.slice(0, limit) + '…' : value;
    }

    function describe(selection) {
      if (selection.status === 'rejected') {
        return '无法建立锚点：' + selection.reason;
      }
      const repeat = selection.occurrences > 1
        ? ' · 第 ' + selection.ordinal + '/' + selection.occurrences + ' 处'
        : ' · 唯一';
      return (selection.status === 'mapped' ? '锚点已确认：“' : '锚点候选：“') +
        Truncated(selection.quote, 40) + '” · ' + selection.nodeKey +
        ' · ' + (selection.status === 'mapped'
          ? '原文 ' + selection.anchorStart + '–' + selection.anchorEnd
          : '渲染文本 ' + selection.start + '–' + selection.end + ' · 未映射原文') + repeat;
    }

    function titleOf(selection) {
      if (selection.status === 'rejected') {
        return '未创建锚点：' + selection.reason;
      }
      return [
        '消息节点：' + selection.nodeKey,
        '锚点行：' + selection.anchorKey,
        '轮次：' + (selection.turn ?? '未知'),
        selection.status === 'mapped'
          ? '已映射原文偏移：' + selection.anchorStart + '–' + selection.anchorEnd
          : '渲染文本偏移：' + selection.start + '–' + selection.end + '（共 ' + selection.textLength + ' 字）',
        '内容指纹：' + selection.digest,
        ...(selection.sourceRef ? ['原文事件：' + selection.sourceRef.finalSeq +
          ' / ' + selection.sourceRef.messageId] : []),
        '上下文：…' + selection.prefix + '【' + selection.quote + '】' + selection.suffix + '…',
        selection.status === 'mapped'
          ? '说明：选区已与原始回答核对，可用于建立支线。'
          : '说明：当前偏移仅用于定位渲染文本，尚未映射到原始 Markdown。',
      ].join('\n');
    }

    const BRANCHES_KEY = 'conversation-structure/branches/v1';
    const BRANCH_CHANGE = 'conversation-structure:branches';
    function readBranches() {
      try {
        const value = JSON.parse(window.localStorage?.getItem(BRANCHES_KEY) || '[]');
        return Array.isArray(value) ? value : [];
      } catch { return []; }
    }
    function saveBranches(branches) {
      window.localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches));
      window.dispatchEvent(new Event(BRANCH_CHANGE));
    }
    function currentSessionId() {
      return appCtx?.uiSession?.current?.getSnapshot?.()?.key;
    }
    function rootSessionId(id, records = readBranches()) {
      const seen = new Set();
      while (id && !seen.has(id)) {
        seen.add(id);
        const parent = records.find((item) => item.childSessionId === id);
        if (!parent) return id;
        id = parent.parentSessionId;
      }
      return id;
    }
    const TITLES_KEY = 'conversation-structure/root-titles/v1';
    function rootTitles() {
      try { return JSON.parse(window.localStorage.getItem(TITLES_KEY) || '{}') || {}; }
      catch { return {}; }
    }
    function sessionTitle(id) {
      return rootTitles()[id] || appCtx.sessions.list?.getSnapshot?.()?.byId?.[id]?.title || '当前主线';
    }
    function submitOnEnter(event, submit, disabled) {
      if (event.key !== 'Enter' || event.isComposing || event.nativeEvent?.isComposing ||
          event.keyCode === 229 || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault(); event.stopPropagation();
      if (!disabled) void submit();
    }
    async function enterTopic({ originId, parentId, rootId, rootTitle, question }) {
      if (!originId || currentSessionId() !== originId) throw new Error('会话已切换，请重新打开新话题入口');
      if (!question.trim() || !rootTitle.trim()) throw new Error('请填写所属主线和问题');
      if (![originId, rootSessionId(originId)].includes(parentId)) throw new Error('新话题的所属会话已变化');
      const chat = appCtx.uiConversation.binding(parentId)?.target('chat')?.getSnapshot();
      const latest = [...(chat?.nodes?.entries?.() ?? [])]
        .filter(([, node]) => node?.kind === 'assistant-step' && node.data?.status === 'settled')
        .sort((a, b) => (b[1].data.finalNode?.seq ?? 0) - (a[1].data.finalNode?.seq ?? 0))[0];
      const sourceKey = latest?.[0] ?? null;
      const source = latest?.[1]?.data?.finalNode;
      const row = sourceKey && parentId === originId ? [...document.querySelectorAll('[data-chat-node-key]')]
        .find((element) => element.getAttribute('data-chat-node-key') === sourceKey &&
          element.getAttribute('data-chat-group-part') === 'response') : null;
      const scroll = row?.closest(CHAT_SCROLL);
      // Persist before submitting: fail before sending if local storage is unavailable.
      const titles = rootTitles(); titles[rootId] = rootTitle.trim();
      window.localStorage.setItem(TITLES_KEY, JSON.stringify(titles));
      const cwd = appCtx.sessions.list?.getSnapshot?.()?.byId?.[parentId]?.cwd;
      const childSessionId = await appCtx.sessions.create(cwd ? { cwd } : {});
      const record = { id: window.crypto.randomUUID(), kind: 'topic', parentSessionId: parentId,
        childSessionId, parentNodeKey: sourceKey, parentMessageId: source?.messageId ?? null,
        cardMessageId: chat?.timeline?.turns?.get?.(Number(row?.getAttribute('data-chat-turn')))
          ?.data?.get?.('turn-tail')?.closing?.finalNode?.messageId ?? source?.messageId ?? null,
        parentFinalSeq: source?.seq ?? null,
        anchor: question.trim(), anchorStart: null, anchorEnd: null,
        viewportOffset: scroll ? row.getBoundingClientRect().top - scroll.getBoundingClientRect().top : 0,
        question: question.trim(), status: 'paused', summary: '', answerPreview: '',
        contextMode: 'topic-only', forkedAtSeq: 0, createdAt: new Date().toISOString() };
      saveBranches([...readBranches(), record]);
      const retained = appCtx.sessions.retain(childSessionId, { source: 'conversation-structure-ui' });
      try {
        const binding = await retained.ready;
        const prompt = ['这是一个新的话题支线。只使用下方用户提供的主线名称和问题；没有继承其他支线的对话。',
          '必要条件不足时请询问，不要猜测先前对话。',
          '所属主线：' + rootTitle.trim(), '新话题问题：' + question.trim()].join('\n');
        const result = await binding.session.prompt([{ type: 'text', text: prompt }], 'queue');
        if (result?.ok === false) throw new Error(result.error?.message || '问题未被接收');
        const records = readBranches();
        const saved = records.find((item) => item.id === record.id);
        if (saved) saved.status = 'active';
        saveBranches(records);
      } catch (cause) {
        throw new Error((cause.message || String(cause)) + '；支线已保留在结构图中，可打开查看后继续。');
      } finally { retained.release(); }
      appCtx.uiWorkspace.openSession(childSessionId);
    }
    function TopicControls() {
      const records = useBranchRecords();
      const current = currentSessionId();
      const rootId = rootSessionId(current, records);
      const [open, setOpen] = React.useState(false);
      const [title, setTitle] = React.useState('');
      const [question, setQuestion] = React.useState('');
      const [parent, setParent] = React.useState('root');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const inFlight = React.useRef(false);
      React.useEffect(() => { setOpen(false); setQuestion(''); setError(''); setParent('root'); }, [current]);
      const submit = async () => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setError('');
        try {
          await enterTopic({ originId: current, parentId: parent === 'root' ? rootId : current,
            rootId, rootTitle: title, question });
          setOpen(false); setQuestion('');
        } catch (cause) { setError(cause.message || String(cause)); }
        finally { inFlight.current = false; setBusy(false); }
      };
      const disabled = busy || !question.trim() || !title.trim();
      return h('div', { className: 'cs-ui', style: { display: 'grid', gap: 6, whiteSpace: 'normal' } },
        h('button', { className: 'cs-button cs-button--quiet', type: 'button', disabled: !current || busy,
          'aria-expanded': open, onClick: () => { setTitle(sessionTitle(rootId)); setOpen(!open); } }, '新话题支线'),
        open && h('div', { style: { display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' } },
          h('input', { className: 'cs-field', value: title, 'aria-label': '所属主线名称',
            placeholder: '所属主线，例如：计算方法', disabled: busy, onChange: (event) => setTitle(event.target.value) }),
          current !== rootId && h('select', { className: 'cs-field', value: parent, disabled: busy,
            'aria-label': '新话题位置', onChange: (event) => setParent(event.target.value) },
            h('option', { value: 'root' }, '主线下的平行支线'), h('option', { value: 'current' }, '当前支线下的子话题')),
          h('input', { className: 'cs-field', value: question, disabled: busy, 'aria-label': '新话题问题',
            placeholder: '例如：991CN X 如何切换角度制？', style: { minWidth: 220, flex: 1 },
            onChange: (event) => setQuestion(event.target.value),
            onKeyDown: (event) => submitOnEnter(event, submit, disabled) }),
          h('button', { className: 'cs-button', type: 'button', disabled, onClick: submit }, busy ? '正在创建…' : '创建话题支线'),
          h('span', { className: 'cs-status' }, '无需选中文字；携带主线名称和本次问题，需要的条件请写进问题。')),
        error && h('span', { role: 'alert' }, error));
    }
    function branchPrompt(selection, question, compactContext) {
      const limit = compactContext ? 8000 : 16000;
      const prefix = selection.sourcePrefix.length > limit
        ? '…[前文已省略]\n' + selection.sourcePrefix.slice(-limit) : selection.sourcePrefix;
      const contextLines = compactContext ? [
        '模式：精简上下文实验。此新 Session 不含父 Session 的完整对话历史。',
        '<父支线路径>', compactContext.text || '（无可用的父支线摘要）', '</父支线路径>',
        '',
      ] : [];
      return [
        '你正在一条独立的对话支线中。下方只提供原回答截至选中片段的前缀；不要假定原回答后续内容存在。',
        '请直接回答用户对所选片段的追问。',
        ...contextLines,
        '',
        '<原回答前缀>',
        prefix,
        '</原回答前缀>',
        '选中片段：' + selection.quote,
        '追问：' + question,
      ].join('\n');
    }
    function compactPathContext(parentSessionId, chat, selection) {
      const records = readBranches();
      const chain = [];
      const visited = new Set();
      let sessionId = parentSessionId;
      while (sessionId && !visited.has(sessionId)) {
        visited.add(sessionId);
        const record = records.find((item) => item.childSessionId === sessionId);
        if (!record) break;
        chain.push(record);
        sessionId = record.parentSessionId;
      }
      chain.reverse();
      const lines = [];
      for (const record of chain) {
        lines.push('锚点：' + record.anchor, '父支线追问：' + record.question);
        if (record.summary) lines.push('已带回结论：' + record.summary);
        let excerpt = record.answerPreview || '';
        if (record.childSessionId === parentSessionId) {
          const earlier = [...(chat?.nodes?.values?.() ?? [])]
            .filter((node) => node?.kind === 'assistant-step' && node.data?.status === 'settled' &&
              Number.isSafeInteger(node.data.finalNode?.seq) &&
              node.data.finalNode.seq > (record.forkedAtSeq ?? 0) &&
              node.data.finalNode.seq < selection.sourceRef.finalSeq)
            .sort((a, b) => b.data.finalNode.seq - a.data.finalNode.seq);
          const latest = earlier[0]?.data?.blocks
            ?.filter((block) => block.kind === 'text').map((block) => block.text).join('\n');
          if (latest) excerpt = latest;
        }
        if (excerpt) lines.push('父支线最近回答摘录：' + Truncated(excerpt, 900));
      }
      const text = lines.join('\n');
      return { text, charCount: text.length };
    }
    async function enterBranch(selection, question, options = {}) {
      if (selection?.status !== 'mapped' || !question.trim()) throw new Error('请选择已确认的片段并填写问题');
      const parentSessionId = selection.sourceRef.sessionId;
      if (currentSessionId() !== parentSessionId) throw new Error('来源会话已切换，请重新选择片段');
      const chat = appCtx.uiConversation.binding(parentSessionId)?.target('chat')?.getSnapshot();
      const currentNode = chat?.nodes?.get(selection.nodeKey);
      const currentFinal = currentNode?.data?.finalNode;
      const currentText = currentNode?.data?.blocks?.filter((block) => block.kind === 'text');
      if (currentNode?.data?.status !== 'settled' ||
          currentFinal?.seq !== selection.sourceRef.finalSeq ||
          currentFinal?.messageId !== selection.sourceRef.messageId ||
          currentText?.length !== 1 ||
          typeof currentText[0].text !== 'string' ||
          fingerprintText(currentText[0].text) !== selection.sourceRef.digest) {
        throw new Error('来源回答已变化，请重新选择片段');
      }
      const cwd = appCtx.sessions.list?.getSnapshot?.()?.byId?.[parentSessionId]?.cwd;
      const compact = options.contextMode === 'compact' &&
        readBranches().some((item) => item.childSessionId === parentSessionId);
      if (options.contextMode === 'compact' && !compact) {
        throw new Error('精简上下文实验仅用于已有支线中的嵌套追问');
      }
      const compactContext = compact ? compactPathContext(parentSessionId, chat, selection) : null;
      const previousTurnEnd = [...(chat?.timeline?.turns?.values?.() ?? [])]
        .map((turn) => turn.end?.seq)
        .filter((seq) => Number.isSafeInteger(seq) && seq < selection.sourceRef.finalSeq)
        .sort((a, b) => b - a)[0];
      const childSessionId = compact
        ? await appCtx.sessions.create(cwd ? { cwd } : {})
        : previousTurnEnd === undefined
        ? await appCtx.sessions.create(cwd ? { cwd } : {})
        : await appCtx.sessions.fork({ sessionId: parentSessionId, atSeq: previousTurnEnd });
      const retained = appCtx.sessions.retain(childSessionId, { source: 'conversation-structure-ui' });
      try {
        const binding = await retained.ready;
        const result = await binding.session.prompt(
          [{ type: 'text', text: branchPrompt(selection, question.trim(), compactContext) }], 'queue');
        if (result?.ok === false) throw new Error(result.error?.message || '支线问题未被接收');
      } finally {
        retained.release();
      }
      const branch = {
        id: window.crypto.randomUUID(),
        parentSessionId,
        parentNodeKey: selection.nodeKey,
        parentMessageId: selection.sourceRef.messageId,
        cardMessageId: chat?.timeline?.turns?.get?.(Number(selection.turn))
          ?.data?.get?.('turn-tail')?.closing?.finalNode?.messageId ?? selection.sourceRef.messageId,
        parentFinalSeq: selection.sourceRef.finalSeq,
        childSessionId,
        contextMode: compact ? 'compact-path' :
          previousTurnEnd === undefined ? 'source-prefix' : 'forked-prefix',
        forkedAtSeq: compact ? 0 : previousTurnEnd ?? 0,
        pathContextChars: compactContext?.charCount ?? null,
        anchor: selection.quote,
        anchorStart: selection.anchorStart,
        anchorEnd: selection.anchorEnd,
        viewportOffset: selection.viewportOffset,
        question: question.trim(),
        status: 'active',
        summary: '',
        answerPreview: '',
        createdAt: new Date().toISOString(),
      };
      saveBranches([...readBranches(), branch]);
      appCtx.uiWorkspace.openSession(childSessionId);
    }
    function restoreReadingPosition(branch) {
      if (!branch.parentNodeKey) return;
      let attempts = 0;
      const locate = () => {
        if (currentSessionId() !== branch.parentSessionId) {
          if (attempts++ < 30) window.setTimeout(locate, 100);
          return;
        }
        const row = [...document.querySelectorAll('[data-chat-node-key]')].find((element) =>
          element.getAttribute('data-chat-node-key') === branch.parentNodeKey &&
          element.getAttribute('data-chat-group-part') === 'response');
        const scroll = row?.closest(CHAT_SCROLL);
        if (!row || !scroll) {
          if (attempts++ < 30) window.setTimeout(locate, 100);
          return;
        }
        scroll.scrollTop += row.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top - branch.viewportOffset;
        const before = row.style.outline;
        row.style.outline = '2px solid #55c7b7';
        window.setTimeout(() => { row.style.outline = before; }, 1800);
      };
      window.setTimeout(locate, 100);
    }
    function returnToParent(branch, summary) {
      const branches = readBranches();
      const found = branches.find((item) => item.id === branch.id);
      if (!found) throw new Error('支线记录已丢失');
      found.summary = summary.trim();
      const childChat = appCtx.uiConversation.binding(found.childSessionId)?.target('chat')?.getSnapshot();
      const answers = [...(childChat?.nodes?.values?.() ?? [])]
        .filter((node) => node?.data?.status === 'settled' &&
          node.data.finalNode?.seq > (found.forkedAtSeq ?? 0))
        .sort((a, b) => a.data.finalNode.seq - b.data.finalNode.seq);
      const latest = answers.at(-1)?.data?.blocks
        ?.filter((block) => block.kind === 'text')
        .map((block) => block.text).join('\n').trim();
      if (latest) found.answerPreview = Truncated(latest, 900);
      found.status = found.summary ? 'resolved' : 'paused';
      saveBranches(branches);
      appCtx.uiWorkspace.openSession(found.parentSessionId);
      restoreReadingPosition(found);
    }
    function openBranch(branch) {
      if (branch.status === 'paused') {
        const branches = readBranches();
        const found = branches.find((item) => item.id === branch.id);
        if (found) { found.status = 'active'; saveBranches(branches); }
      }
      appCtx.uiWorkspace.openSession(branch.childSessionId);
    }

    function BranchControls({ selection, onClear }) {
      const records = useBranchRecords();
      const [question, setQuestion] = React.useState('');
      const [summary, setSummary] = React.useState('');
      const [compactContext, setCompactContext] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const inFlight = React.useRef(false);
      const branch = records.find((item) => item.childSessionId === currentSessionId()) ?? null;
      React.useEffect(() => {
        setSummary(branch?.summary ?? '');
        setCompactContext(false);
      }, [branch?.id]);
      const fieldStyle = { flex: 1, minWidth: 190 };
      const submit = async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true); setError('');
        try {
          await enterBranch(selection, question,
            { contextMode: compactContext ? 'compact' : 'fork' });
          onClear(); setQuestion('');
        }
        catch (cause) { setError(cause.message || String(cause)); }
        finally { inFlight.current = false; setBusy(false); }
      };
      const createControls = selection?.status === 'mapped'
        ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' } },
          h('input', { className: 'cs-field', value: question, onChange: (event) => setQuestion(event.target.value),
            'aria-label': '片段追问', onKeyDown: (event) => submitOnEnter(event, submit, busy || !question.trim()),
            placeholder: '对选中片段追问什么？', style: fieldStyle }),
          h('button', { className: 'cs-button', type: 'button', disabled: busy || !question.trim(),
            onClick: submit }, busy ? '正在创建…' : '深入追问'),
          h('button', { className: 'cs-button cs-button--quiet', type: 'button', onClick: onClear }, '取消'),
          branch && h('label', { className: 'cs-experiment-option',
            title: '创建空白 Session，只传入支线路径和来源回答前缀；用于和完整 fork 对比' },
            h('input', { type: 'checkbox', checked: compactContext, disabled: busy,
              onChange: (event) => setCompactContext(event.target.checked) }),
            '精简上下文实验'),
          error && h('span', { role: 'alert' }, error))
        : null;
      if (branch) {
        return h('div', { style: { display: 'grid', gap: 7 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' } },
          h('span', null, (branch.kind === 'topic' ? '当前话题：“' : '支线来自：“') + Truncated(branch.anchor, 18) + '”'),
          h('input', { className: 'cs-field', value: summary, onChange: (event) => setSummary(event.target.value),
            placeholder: '带回主线的一句结论（可留空并暂停）', style: fieldStyle }),
          h('button', { className: 'cs-button', type: 'button',
            onClick: () => returnToParent(branch, summary) }, branch.kind === 'topic' ? '返回所属话题' : '返回原文'),
          error && !createControls && h('span', { role: 'alert' }, error)),
          createControls);
      }
      return createControls;
    }

    function useBranchRecords() {
      const [records, setRecords] = React.useState(readBranches());
      React.useEffect(() => {
        const update = () => setRecords(readBranches());
        window.addEventListener(BRANCH_CHANGE, update);
        window.addEventListener('storage', update);
        const unsubscribe = appCtx?.uiSession?.current?.subscribe?.(update);
        return () => {
          window.removeEventListener(BRANCH_CHANGE, update);
          window.removeEventListener('storage', update);
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }, []);
      return records;
    }

    function BranchCards({ messageId }) {
      const records = useBranchRecords();
      const parentSessionId = currentSessionId();
      const matching = records.filter((branch) =>
        branch.parentSessionId === parentSessionId &&
        (branch.cardMessageId ?? branch.parentMessageId) === messageId);
      if (!matching.length) return null;
      return h('div', { style: { display: 'grid', gap: 7, margin: '8px 0' } },
        ...matching.map((branch) => h('details', { key: branch.id, className: 'cs-ui cs-card' },
          h('summary', { title: branch.anchor },
            '支线 · ' + Truncated(branch.anchor, 24) + ' · ' +
            (branch.status === 'resolved' ? '已解决' :
              branch.status === 'paused' ? '已暂停' : '进行中')),
          h('div', { className: 'cs-card-content' },
            h('div', null, '追问：' + branch.question),
            h('div', { className: 'cs-card-answer' },
              branch.answerPreview || '支线回答尚未记录；打开完整支线查看。'),
            branch.summary && h('div', null, '带回结论：' + branch.summary),
            h('button', { className: 'cs-button', type: 'button', onClick: () => openBranch(branch),
              style: { marginTop: 8 } },
            '打开完整支线')))));
    }

    function SkillOverview({ rootId }) {
      const key = 'conversation-structure/skill-overviews/v1';
      const read = () => { try {
        const stored = JSON.parse(window.localStorage.getItem(key) || '[]');
        return Array.isArray(stored) ? stored : [];
      } catch { return []; } };
      const [items, setItems] = React.useState(read);
      const [error, setError] = React.useState('');
      const importFile = async (event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        setError('');
        try {
          if (file.size > 5 * 1024 * 1024) throw new Error('请导入小于 5 MB 的状态 JSON');
          const data = JSON.parse(await file.text());
          if (!data.session || typeof data.session.id !== 'string' || !Array.isArray(data.nodes) ||
              !data.nodes.length || data.nodes.length > 500) throw new Error('需要包含 session 和 nodes 的状态文件或 show 结果');
          const ids = new Set(data.nodes.map((node) => node.id));
          if (ids.size !== data.nodes.length || data.nodes.filter((node) => node.parentId == null).length !== 1)
            throw new Error('节点重复或根节点不唯一');
          const nodes = data.nodes.map((node) => {
            if (typeof node.id !== 'string' || typeof node.title !== 'string' ||
                (node.parentId != null && !ids.has(node.parentId))) throw new Error('节点信息不完整');
            const seen = new Set([node.id]); let parent = node.parentId;
            while (parent != null) {
              if (seen.has(parent)) throw new Error('节点包含循环关系');
              seen.add(parent); parent = data.nodes.find((item) => item.id === parent)?.parentId;
            }
            return { id: node.id, parentId: node.parentId ?? null, title: node.title,
              status: node.status, isCurrent: node.id === data.session.activeNodeId };
          });
          const next = read().filter((item) => !(item.rootId === rootId && item.id === data.session.id));
          next.push({ id: data.session.id, rootId, nodes });
          window.localStorage.setItem(key, JSON.stringify(next)); setItems(next);
        } catch (cause) { setError(cause.message || '无法读取状态文件'); }
      };
      const render = (nodes, node, depth = 0) => h('div', { key: node.id, style: { marginLeft: 10 } },
        h('div', null, (node.isCurrent ? '● ' : '· ') + Truncated(node.title, 50) + ' · ' +
          ({ active: '进行中', paused: '已暂停', resolved: '已解决', abandoned: '已放弃' }[node.status] || '已记录')),
        depth < 24 ? nodes.filter((child) => child.parentId === node.id).map((child) => render(nodes, child, depth + 1))
          : h('span', null, '更深层级请查看原状态文件'));
      return h('details', { className: 'cs-tree-preview' },
        h('summary', null, 'Skill 历史总览（只读）'),
        h('label', null, '导入 Skill 总览 ', h('input', { type: 'file', accept: '.json,application/json',
          'aria-label': '导入 Skill 总览', onChange: importFile, style: { maxWidth: '100%' } })),
        h('p', null, '选择本地状态 JSON。仅导入节点结构，不会转换成 DSH 子会话；原文件不变。'),
        ...items.filter((item) => item.rootId === rootId).map((item) => h('div', { key: item.id },
          render(item.nodes, item.nodes.find((node) => node.parentId == null)),
          h('button', { type: 'button', className: 'cs-tree-collapse', onClick: () => {
            const next = read().filter((record) => !(record.rootId === rootId && record.id === item.id));
            window.localStorage.setItem(key, JSON.stringify(next)); setItems(next);
          } }, '移除此导入'))),
        error && h('div', { role: 'alert' }, error));
    }

    function TreePanel() {
      const [open, setOpen] = React.useState(false);
      const [expanded, setExpanded] = React.useState(true);
      const [motion, setMotion] = React.useState(() => {
        try { return window.localStorage.getItem('conversation-structure/motion') !== 'off'; }
        catch { return true; }
      });
      const records = useBranchRecords();
      const current = currentSessionId();
      let rootId = current;
      const activePath = new Set();
      const route = [];
      const visited = new Set();
      while (rootId && !visited.has(rootId)) {
        visited.add(rootId);
        const parent = records.find((branch) => branch.childSessionId === rootId);
        if (!parent) break;
        activePath.add(parent.id);
        route.unshift(parent.anchor);
        rootId = parent.parentSessionId;
      }
      const rootTitle = sessionTitle(rootId);
      const renderBranch = (branch, depth = 0) => h('div', { key: branch.id,
        className: 'cs-tree-node-wrap', 'data-on-path': activePath.has(branch.id) },
        h('svg', { className: 'cs-tree-edge', viewBox: '0 0 24 36', 'aria-hidden': true, focusable: 'false' },
          h('path', { className: 'cs-tree-edge-base', d: 'M3 0 V14 Q3 22 11 22 H22' }),
          h('path', { className: 'cs-tree-edge-flow', d: 'M3 0 V14 Q3 22 11 22 H22' }),
          h('path', { className: 'cs-tree-edge-arrow', d: 'M18 18 L22 22 L18 26' })),
        h('details', { className: 'cs-ui cs-tree-node',
          open: activePath.has(branch.id), 'data-active': current === branch.childSessionId },
          h('summary', { title: branch.anchor, 'aria-current': current === branch.childSessionId ? 'location' : undefined },
            current === branch.childSessionId && h('span', { className: 'cs-current-badge' }, '当前位置'),
            Truncated(branch.anchor, 20) + ' · ' +
            (branch.status === 'resolved' ? '已解决' :
              branch.status === 'paused' ? '已暂停' : '进行中')),
          h('div', { className: 'cs-tree-preview' }, branch.question),
          branch.answerPreview && h('div', { className: 'cs-tree-preview' }, Truncated(branch.answerPreview, 250)),
          branch.summary && h('div', { className: 'cs-tree-preview' }, branch.summary),
          h('button', { className: 'cs-button', type: 'button', onClick: () => openBranch(branch),
            style: { padding: '5px 9px' } }, '查看完整支线'),
          depth < 16 && records.some((child) => child.parentSessionId === branch.childSessionId && child.id !== branch.id) &&
            h('div', { className: 'cs-tree-nested' }, records.filter((child) => child.parentSessionId === branch.childSessionId &&
              child.id !== branch.id).map((child) => renderBranch(child, depth + 1)))));
      const children = records.filter((branch) => branch.parentSessionId === rootId);
      return h('div', { className: 'cs-ui cs-tree-shell', 'data-motion': motion ? 'on' : 'off' },
        h('button', { className: 'cs-tree-trigger', type: 'button', onClick: () => setOpen(!open),
          'aria-expanded': open },
        open ? '收起结构图' : '展开结构图'),
        open && h('div', { className: 'cs-tree-panel' },
          h('div', { className: 'cs-tree-heading' },
            h('div', { className: 'cs-tree-title' }, '对话结构'),
            h('span', { className: 'cs-tree-count' }, children.length + ' 条一级支线')),
          h('button', { className: 'cs-tree-root', type: 'button', onClick: () => appCtx.uiWorkspace.openSession(rootId) },
          current === rootId && h('span', { className: 'cs-current-badge' }, '当前位置'), Truncated(rootTitle, 22)),
          h('div', { className: 'cs-tree-location', title: [rootTitle, ...route].join(' → ') },
            '所在路径 · ' + [Truncated(rootTitle, 22), ...route.map((title) => Truncated(title, 18))].join(' → ')),
          h('button', { className: 'cs-tree-collapse', type: 'button', onClick: () => setExpanded(!expanded),
            'aria-label': expanded ? '收起支线树' : '展开支线树' }, expanded ? '收起节点' : '展开节点'),
          h('button', { className: 'cs-tree-collapse', type: 'button', 'aria-pressed': motion,
            title: '系统开启减少动态效果时，连线自动保持静态',
            onClick: () => { setMotion(!motion); try {
              window.localStorage.setItem('conversation-structure/motion', motion ? 'off' : 'on');
            } catch { /* The current view still respects the selected preference. */ } } }, '路径动效：' + (motion ? '开' : '关')),
          expanded && h('div', { className: 'cs-tree-children' },
            ...(children.length ? children.map((branch) => renderBranch(branch)) :
              [h('span', { key: 'empty', className: 'cs-tree-empty' },
                '还没有支线')])) ,
          h('div', { className: 'cs-tree-legend' }, '高亮连线表示当前位置的路径，与模型是否生成无关。'),
          h(SkillOverview, { rootId, key: rootId })));
    }

    function Dock() {
      const [selection, setSelection] = React.useState(null);
      React.useEffect(() => {
        const update = () => {
          const found = inspectSelection();
          if (found) setSelection(found);
        };
        let pending = 0;
        const schedule = () => {
          if (pending) cancelAnimationFrame(pending);
          pending = requestAnimationFrame(() => {
            pending = 0;
            update();
          });
        };
        document.addEventListener('selectionchange', schedule);
        document.addEventListener('mouseup', schedule, true);
        document.addEventListener('keyup', schedule, true);
        const unsubscribe = appCtx?.uiSession?.current?.subscribe?.(() => setSelection(null));
        return () => {
          if (pending) cancelAnimationFrame(pending);
          document.removeEventListener('selectionchange', schedule);
          document.removeEventListener('mouseup', schedule, true);
          document.removeEventListener('keyup', schedule, true);
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }, []);
      return h('div', {
        className: 'cs-ui',
        'data-conversation-structure': 'anchor-inspector',
        'data-anchor-status': selection ? selection.status : 'idle',
        title: selection ? titleOf(selection) : undefined,
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          margin: '4px 0',
          fontSize: 12,
          minWidth: 0,
          whiteSpace: 'nowrap',
        },
      },
      h('strong', { style: { flex: 'none' } }, '对话结构'),
      h('span', { className: 'cs-status',
        role: 'status',
        'aria-live': 'polite',
        style: {
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: selection?.status === 'rejected' ? '#d97706' : undefined,
        },
      }, selection ? describe(selection) : '选中 AI 回答中的文字以检查锚点'),
      h(BranchControls, { selection, onClear: () => setSelection(null) }),
      h(TopicControls));
    }

    return {
      inject: ['slots', 'uiSession', 'uiConversation', 'sessions', 'uiWorkspace'],
      apply(ctx) {
        appCtx = ctx;
        installStyles();
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'conversation-structure-ui', order: 90,
        }, Dock));
        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions', id: 'conversation-structure-cards', order: 90,
        }, BranchCards));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'conversation-structure-tree', order: 90,
        }, TreePanel));
      },
    };
  },
});
