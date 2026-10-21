// SPDX-License-Identifier: MIT
import {sha256State} from './ledger/hash.mjs';
import {splitOpeningFrontmatter} from '../spec/frontmatter.mjs';

export function projectMarkdown(parsed) {
  const {source, revision, grammar, tokens, env = {}, bodyOffset = 0, complete} = parsed || {};
  requireSource(source, revision);
  if (complete !== true || !Array.isArray(tokens)) throw new TypeError('A completed Markdown parse is required');
  const front = splitOpeningFrontmatter(source);
  if (!Number.isSafeInteger(bodyOffset) || bodyOffset < 0 || bodyOffset > source.length ||
      bodyOffset !== 0 && bodyOffset !== front.bodyOffset) throw new TypeError('The parse must cover the document body');
  const grammarCopy = copyGrammar(grammar), counts = new Map();
  const omitted = (domain, reason) => {
    const key = domain + ':' + reason;
    const row = counts.get(key) || {domain, reason, count: 0};
    row.count++; counts.set(key, row);
  };
  const lines = [bodyOffset], normalizedLines = [0];
  let collapsed = 0;
  for (const match of source.slice(bodyOffset).matchAll(/\r\n?|\n/g)) {
    const end = match.index + match[0].length;
    collapsed += match[0].length - 1;
    lines.push(bodyOffset + end); normalizedLines.push(end - collapsed);
  }
  const originalOffset = offset => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length - bodyOffset - collapsed)
      throw new TypeError('A Markdown layout target has an invalid source offset');
    let low = 0, high = normalizedLines.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (normalizedLines[middle] <= offset) low = middle; else high = middle;
    }
    return lines[low] + offset - normalizedLines[low];
  };
  const metadata = token => {
    const meta = copyJSON(token.meta ?? null, () => omitted('metadata', 'not-json'));
    const target = meta?.mdLayoutSource;
    if (!target) return meta;
    const marker = target.marker ? Object.freeze({...target.marker, start: originalOffset(target.marker.start),
      end: originalOffset(target.marker.end), unit: 'utf16'}) : null;
    return Object.freeze({...meta, mdLayoutSource: Object.freeze({...target, start: originalOffset(target.start),
      end: originalOffset(target.end), insert: target.insert == null ? null : originalOffset(target.insert), marker, unit: 'utf16'})});
  };
  const span = token => {
    const map = token.map;
    if (map == null) {
      omitted('spans', token.block ? 'block-range-not-retained' : 'inline-range-not-retained');
      return null;
    }
    if (!Array.isArray(map) || map.length !== 2 || map.some(at => !Number.isSafeInteger(at) || at < 0) ||
        map[0] > map[1] || map[0] >= lines.length || map[1] > lines.length)
      throw new TypeError('A Markdown token has an invalid line range');
    if (map[0] === map[1]) { omitted('spans', token.block ? 'block-range-not-retained' : 'inline-range-not-retained'); return null; }
    return Object.freeze({start: lines[map[0]], end: lines[map[1]] ?? source.length, unit: 'utf16', scope: 'lines'});
  };
  let count = 0;
  const copyTokens = input => Object.freeze(input.map(token => {
    if (!token || typeof token.type !== 'string' || ![-1, 0, 1].includes(token.nesting) ||
        token.children != null && !Array.isArray(token.children)) throw new TypeError('Invalid Markdown token');
    count++;
    const scalar = key => {
      if (token[key] == null) return '';
      if (typeof token[key] !== 'string') throw new TypeError('Invalid Markdown token ' + key);
      return token[key];
    };
    return Object.freeze({
      type: token.type, tag: scalar('tag'), nesting: token.nesting,
      level: Number.isSafeInteger(token.level) && token.level >= 0 ? token.level : null,
      block: token.block === true, hidden: token.hidden === true,
      content: scalar('content'), markup: scalar('markup'), info: scalar('info'),
      attrs: copyJSON(token.attrs ?? null, () => omitted('attributes', 'not-json')),
      meta: metadata(token),
      span: span(token), children: token.children ? copyTokens(token.children) : null,
    });
  }));
  const projected = copyTokens(tokens);
  const definitions = copyJSON({
    references: env.references || {}, abbreviations: env.abbreviations || {},
    footnotes: (env.footnotes?.list || []).map(note => ({label: note.label ?? null, count: note.count ?? 0})),
  }, () => omitted('definitions', 'not-json'));
  const omissions = [
    ...counts.values(),
    {domain: 'source', reason: 'original-text-and-unrepresented-gaps-are-not-included'},
    {domain: 'frontmatter', reason: 'metadata-is-not-interpreted'},
    {domain: 'rendering', reason: 'html-dom-heading-ids-layout-and-decoded-assets-are-not-included'},
    {domain: 'authority', reason: 'will-permissions-and-edit-admission-are-not-evaluated'},
    {domain: 'environment', reason: 'only-reference-abbreviation-and-footnote-definitions-are-included'},
  ];
  return Object.freeze({
    format: 'rapier-parsed/1',
    source: Object.freeze({revision, chars: source.length,
      hash: Object.freeze({algorithm: 'sha256', encoding: 'utf16le', value: sourceHash(source)})}),
    grammar: grammarCopy,
    body: Object.freeze({start: bodyOffset, end: source.length, unit: 'utf16'}),
    frontmatter: bodyOffset ? Object.freeze({start: 0, end: bodyOffset, unit: 'utf16'}) : null,
    tokens: projected, definitions,
    coverage: Object.freeze({tokens: 'complete', tokenCount: count,
      spans: counts.has('spans:block-range-not-retained') || counts.has('spans:inline-range-not-retained') ? 'partial' : 'complete'}),
    omissions: Object.freeze(omissions.map(Object.freeze)),
  });
}

export function projectionMatches(projection, {source, revision, grammar} = {}) {
  requireSource(source, revision);
  const expected = copyGrammar(grammar);
  if (!(projection?.format === 'rapier-parsed/1' && projection.source?.revision === revision &&
    projection.source.chars === source.length && projection.source.hash?.algorithm === 'sha256' &&
    projection.source.hash.encoding === 'utf16le' && projection.source.hash.value === sourceHash(source))) return false;
  try { return JSON.stringify(copyGrammar(projection.grammar)) === JSON.stringify(expected); }
  catch (_) { return false; }
}

function requireSource(source, revision) {
  if (typeof source !== 'string' || !(typeof revision === 'string' && revision.length ||
      Number.isSafeInteger(revision) && revision >= 0)) throw new TypeError('Exact source and its revision are required');
}

function copyGrammar(grammar) {
  const copy = copyJSON(grammar, () => { throw new TypeError('Grammar identity and options must be JSON data'); });
  if (!copy || typeof copy.id !== 'string' || !copy.id || !copy.options ||
      typeof copy.options !== 'object' || Array.isArray(copy.options))
    throw new TypeError('A grammar identity and its options are required');
  return copy;
}

function copyJSON(value, omit, ancestors = new Set()) {
  if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (!value || typeof value !== 'object' || ancestors.has(value) ||
      !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) { omit(); return null; }
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) result = Array.from({length: value.length}, (_, index) => {
    const property = Object.getOwnPropertyDescriptor(value, index);
    if (!property || !Object.hasOwn(property, 'value')) { omit(); return null; }
    return copyJSON(property.value, omit, ancestors);
  });
  else result = Object.fromEntries(Object.keys(value).sort().map(key => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(property, 'value')) { omit(); return [key, null]; }
    return [key, copyJSON(property.value, omit, ancestors)];
  }));
  ancestors.delete(value);
  return Object.freeze(result);
}

function sourceHash(source) {
  const hash = sha256State(), bytes = new Uint8Array(32768);
  for (let at = 0; at < source.length;) {
    let used = 0;
    while (at < source.length && used < bytes.length) {
      const code = source.charCodeAt(at++); bytes[used++] = code & 255; bytes[used++] = code >>> 8;
    }
    hash.update(bytes.subarray(0, used));
  }
  return hash.finish();
}
