import {readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';

const START = '<script type="text/markdown" id="rapier-document"';
const DRAWING_START = '<script type="text/plain" id="rapier-drawing"';
const END = '</script>';

// One encoding, exactly reversible (docs/page-door.md, "What a block may hold"): no `<` before `/` or `!`, no CR, no NUL.
// engine.js _rapierDecodeCarried is its inverse.
function encodeCarried(text) {
	return String(text).replace(/[\\\r\0]|<[/!]/g, m =>
		m === '\\' ? '\\\\' : m === '\r' ? '\\r' : m === '\0' ? '\\0' : m === '</' ? '\\/' : '\\!');
}
function decodeCarried(text) {
	return String(text).replace(/\\([\\/!r0])/g, (_, c) =>
		c === '\\' ? '\\' : c === 'r' ? '\r' : c === '0' ? '\0' : c === '/' ? '</' : '<!');
}
export {encodeCarried, decodeCarried};

function safeName(name, fallback) {
	return String(name || fallback).replace(/[\\/\0"<>&]/g, '-').slice(0, 255) || fallback;
}

export function wrap(pageHtml, text, name, options) {
	if (typeof pageHtml !== 'string' || !pageHtml.includes('</body>')) throw new Error('not a Rapier page: no </body>');
	if (typeof text !== 'string') throw new Error('the document must be text');
	const opts = options || {};
	const docName = safeName(name, 'document.md');
	const block = START + ' data-name="' + docName + '">' + encodeCarried(text) + END;
	let drawingBlock = '';
	if (opts.drawing != null) {
		if (typeof opts.drawing !== 'string') throw new Error('the drawing must be SVG text');
		const drawingName = safeName(opts.drawingName, 'drawing.svg');
		drawingBlock = '\n' + DRAWING_START + ' data-name="' + drawingName + '">' + encodeCarried(opts.drawing) + END;
	}
	const stripped = unwrap(pageHtml).html;
	// Before Rapier's scripts: parsed before the engine boots.
	const bodyTag = /<body[^>]*>/.exec(stripped);
	if (!bodyTag) throw new Error('not a Rapier page: no <body>');
	const at = bodyTag.index + bodyTag[0].length;
	// A function, not a string: `$'`, `$&` and `` $` `` are replacement patterns.
	const titled = stripped.replace(/<title>[^<]*<\/title>/, () => '<title>' + docName.replace(/&/g, '&amp;').replace(/</g, '&lt;') + ' — Rapier</title>');
	const shift = titled.length - stripped.length;
	return titled.slice(0, at + shift) + '\n' + block + drawingBlock + titled.slice(at + shift);
}
export function unwrap(pageHtml) {
	let html = pageHtml, text = null, name = null;
	const a = pageHtml.indexOf(START);
	if (a >= 0) {
		const open = pageHtml.indexOf('>', a), b = pageHtml.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried document without its end');
		name = /data-name="([^"]*)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
		text = decodeCarried(pageHtml.slice(open + 1, b));
		html = pageHtml.slice(0, a) + pageHtml.slice(b + END.length);
		if (a > 0 && html[a - 1] === '\n') html = html.slice(0, a - 1) + html.slice(a);
	}
	let drawing = null, drawingName = null;
	const d = html.indexOf(DRAWING_START);
	if (d >= 0) {
		const open = html.indexOf('>', d), b = html.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried drawing without its end');
		drawingName = /data-name="([^"]*)"/.exec(html.slice(d, open))?.[1] ?? null;
		drawing = decodeCarried(html.slice(open + 1, b));
		html = html.slice(0, d) + html.slice(b + END.length);
		if (d > 0 && html[d - 1] === '\n') html = html.slice(0, d - 1) + html.slice(d);
	}
	return {html, text, name, drawing, drawingName};
}
// Unknown options, a bare --drawing and a third name are refused, never dropped.
const USAGE = 'usage: rapier-html <document.md> [out.html] [--drawing sketch.svg]\n' +
	'  writes <document>.rapier.html beside the file: Rapier with the document inside it, one file, offline.\n' +
	'  It never overwrites: an output that already exists, the document itself included, is refused.\n' +
	'  --drawing   carries an SVG drawing alongside the document, opened on Draw as the page boots\n' +
	'  --          everything after it is a filename, even one that starts with a dash\n' +
	'  --help      this text';
export async function main(argv, pagesDir, {log = console.log} = {}) {
	const names = [];
	let drawingPath = null, onlyNames = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (onlyNames || !arg.startsWith('-')) names.push(arg);
		else if (arg === '--') onlyNames = true;
		else if (arg === '--help') { log(USAGE); return null; }
		else if (arg !== '--drawing') throw new Error('unknown option ' + arg + '\n' + USAGE);
		else if (drawingPath !== null || !argv[i + 1] || argv[i + 1].startsWith('-')) throw new Error('--drawing takes one SVG file (write a name that starts with a dash as ./-sketch.svg)');
		else drawingPath = argv[++i];
	}
	if (names.length < 1 || names.length > 2) throw new Error(USAGE);
	const [input, named] = names;
	const text = await readFile(input, 'utf8');
	const page = await readFile(join(pagesDir, 'rapier.html'), 'utf8');
	const name = basename(input);
	const out = named || join(dirname(input), name.replace(/\.(md|markdown|txt)$/i, '') + '.rapier.html');
	const wrapOptions = {};
	if (drawingPath) { wrapOptions.drawing = await readFile(drawingPath, 'utf8'); wrapOptions.drawingName = basename(drawingPath); }
	// R85b: always a new file; 'wx' refuses any existing path, links included.
	try { await writeFile(out, wrap(page, text, name, wrapOptions), {flag: 'wx'}); }
	catch (error) { throw error.code === 'EEXIST' ? new Error(out + ' already exists, and rapier-html never overwrites a file: name a new one') : error; }
	log(out + ' (' + name + ', ' + Buffer.byteLength(text) + ' bytes of document' +
		(drawingPath ? ', ' + basename(drawingPath) + ' drawing' : '') + ')');
	return out;
}
