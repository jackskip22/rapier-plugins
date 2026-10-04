// SPDX-License-Identifier: MIT
import {readLedger} from './format.mjs';
import {authorship as projectAuthorship, readAuthorship} from './authorship.mjs';
import {canonicalJSON, fault} from './data.mjs';
export function encodeCarried(text) {
  return String(text).replace(/[\\\r\0]|<[/!]/g, m => m === '\\' ? '\\\\' : m === '\r' ? '\\r' : m === '\0' ? '\\0' : m === '</' ? '\\/' : '\\!');
}
export function decodeCarried(text) {
  return String(text).replace(/\\([\\/!r0])/g, (_, c) => c === '\\' ? '\\' : c === 'r' ? '\r' : c === '0' ? '\0' : c === '/' ? '</' : '<!');
}
export function validateParts(text, {ledger = null, authorship = null} = {}) {
  // A file's leading BOM is metadata, as in the editor's source intake.
  const canonical = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const history = ledger === null ? null : readLedger(ledger, canonical).ledger;
  const runs = authorship === null ? null : readAuthorship(authorship, canonical);
  if (history && runs && canonicalJSON(projectAuthorship(history)) !== canonicalJSON(runs)) throw fault('authorship differs from ledger replay');
  return {ledger: history, authorship: runs};
}
export function writeParts(text, options) {
  const parts = validateParts(text, options);
  return Object.entries(parts).filter(([, value]) => value !== null).map(([name, value]) =>
    '<script type="application/json" id="rapier-' + name + '">' + encodeCarried(JSON.stringify(value)) + '</script>\n').join('');
}
// Pure adapter: the browser supplies inert script elements, Node supplies parsed script records.
export function readParts(text, elements) {
  const parts = {ledger: null, authorship: null};
  for (const element of elements) {
    const name = element.id === 'rapier-ledger' ? 'ledger' : element.id === 'rapier-authorship' ? 'authorship' : null;
    if (!name) continue;
    if (parts[name] !== null || element.type !== 'application/json' || (element.tagName && element.tagName.toLowerCase() !== 'script')) throw fault('duplicate or executable carried part');
    try { parts[name] = JSON.parse(decodeCarried(element.textContent)); }
    catch (_) { throw fault('invalid carried JSON'); }
    if (parts[name] === null) throw fault('empty carried part');
  }
  return validateParts(text, parts);
}
// The wrapper only removes whole script elements. Strings inside other scripts are not carriers.
export function takeParts(html, text) {
  const elements = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs, content) => {
    const attributes = [...attrs.matchAll(/(?:^|\s)([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)];
    const ids = attributes.filter(m => m[1].toLowerCase() === 'id').map(m => m[2] ?? m[3] ?? m[4]);
    if (!ids.some(id => id === 'rapier-ledger' || id === 'rapier-authorship')) return whole;
    const types = attributes.filter(m => m[1].toLowerCase() === 'type').map(m => m[2] ?? m[3] ?? m[4]);
    if (ids.length !== 1 || types.length !== 1) throw fault('ambiguous carried part');
    elements.push({id: ids[0], type: types[0].toLowerCase(), textContent: content}); return '';
  });
  if (elements.length && text === null) throw fault('carried history without a document');
  return {html: stripped, ...readParts(text ?? '', elements)};
}
const OPEN = '\n\n<!-- rapier-carried/1\n', CLOSE = '\n-->\n';
// One optional HTML comment at EOF; every other Markdown reader ignores it. Source is never rewritten.
export function writeDocument(text, options) {
  const parts = validateParts(text, options);
  if (!parts.ledger && !parts.authorship) return text;
  const json = JSON.stringify(parts).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return text + OPEN + json + CLOSE;
}
export function readDocument(source) {
  const at = source.lastIndexOf(OPEN);
  if (at < 0) return {text: source, ledger: null, authorship: null};
  if (!source.endsWith(CLOSE)) throw fault('unfinished document metadata');
  let parts;
  try { parts = JSON.parse(source.slice(at + OPEN.length, -CLOSE.length)); }
  catch (_) { throw fault('invalid document metadata'); }
  if (!parts || Object.keys(parts).length !== 2 || !Object.hasOwn(parts, 'ledger') || !Object.hasOwn(parts, 'authorship')) throw fault('invalid document parts');
  const text = source.slice(0, at);
  return {text, ...validateParts(text, parts)};
}
