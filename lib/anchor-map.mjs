// Only map a selection when we can reconstruct the whole visible answer from
// the same, versioned Markdown source. Unknown syntax rejects.
// Every offset uses JavaScript UTF-16 code units.

export function fingerprintText(value) {
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

export function resolveRawAnchor({ candidate, renderedText, sourceText, sourceRef } = {}) {
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
