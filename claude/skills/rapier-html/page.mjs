import {readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';

const START = '<script type="text/markdown" id="rapier-document"';
const DRAWING_START = '<script type="text/plain" id="rapier-drawing"';
// The text the document was proposed against (docs/page-door.md, "2. A change carried"): the page opens on its diff.
const BASE_START = '<script type="text/markdown" id="rapier-base"';
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
	// `view`: the view the page opens on with the document behind it, `draw` or `notes` (docs/page-door.md).
	if (opts.view != null && !['draw', 'notes'].includes(opts.view)) throw new Error('the view is draw or notes');
	const block = START + ' data-name="' + docName + '"' + (opts.view ? ' data-view="' + opts.view + '"' : '') + '>' + encodeCarried(text) + END;
	let carriedBlocks = '';
	if (opts.drawing != null) {
		if (typeof opts.drawing !== 'string') throw new Error('the drawing must be SVG text');
		const drawingName = safeName(opts.drawingName, 'drawing.svg');
		carriedBlocks = '\n' + DRAWING_START + ' data-name="' + drawingName + '">' + encodeCarried(opts.drawing) + END;
	}
	if (opts.base != null) {
		if (typeof opts.base !== 'string') throw new Error('the base must be text');
		carriedBlocks += '\n' + BASE_START + ' data-name="' + safeName(opts.baseName, docName) + '">' + encodeCarried(opts.base) + END;
	}
	const stripped = unwrap(pageHtml).html;
	// Before Rapier's scripts: parsed before the engine boots.
	const bodyTag = /<body[^>]*>/.exec(stripped);
	if (!bodyTag) throw new Error('not a Rapier page: no <body>');
	const at = bodyTag.index + bodyTag[0].length;
	// A function, not a string: `$'`, `$&` and `` $` `` are replacement patterns.
	const titled = stripped.replace(/<title>[^<]*<\/title>/, () => '<title>' + docName.replace(/&/g, '&amp;').replace(/</g, '&lt;') + ' — Rapier</title>');
	const shift = titled.length - stripped.length;
	return titled.slice(0, at + shift) + '\n' + block + carriedBlocks + titled.slice(at + shift);
}
export function unwrap(pageHtml) {
	let html = pageHtml, text = null, name = null, view = null;
	const a = pageHtml.indexOf(START);
	if (a >= 0) {
		const open = pageHtml.indexOf('>', a), b = pageHtml.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried document without its end');
		name = /data-name="([^"]*)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
		view = /data-view="(draw|notes)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
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
	let base = null, baseName = null;
	const e = html.indexOf(BASE_START);
	if (e >= 0) {
		const open = html.indexOf('>', e), b = html.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried base without its end');
		baseName = /data-name="([^"]*)"/.exec(html.slice(e, open))?.[1] ?? null;
		base = decodeCarried(html.slice(open + 1, b));
		html = html.slice(0, e) + html.slice(b + END.length);
		if (e > 0 && html[e - 1] === '\n') html = html.slice(0, e - 1) + html.slice(e);
	}
	return {html, text, name, view, drawing, drawingName, base, baseName};
}
// Unknown options, a bare --drawing or --base and a third name are refused, never dropped.
const USAGE = 'usage: rapier-html <document.md> [out.html] [--view draw|notes] [--drawing sketch.svg] [--base original.md]\n' +
	'  writes <document>.rapier.html beside the file: Rapier with the document inside it, one file, offline.\n' +
	'  It never overwrites: an output that already exists, the document itself included, is refused.\n' +
	'  --view      opens the page on Draw (sketch and paint, the document behind it) or on Notes\n' +
	'  --drawing   carries an SVG drawing alongside the document, opened on Draw as the page boots\n' +
	'  --base      carries the text the document was proposed against; the page opens on their diff\n' +
	'  --          everything after it is a filename, even one that starts with a dash\n' +
	'  --help      this text';
export async function main(argv, pagesDir, {log = console.log} = {}) {
	const names = [];
	let drawingPath = null, basePath = null, view = null, onlyNames = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (onlyNames || !arg.startsWith('-')) names.push(arg);
		else if (arg === '--') onlyNames = true;
		else if (arg === '--help') { log(USAGE); return null; }
		else if (arg === '--view') {
			if (view !== null || !['draw', 'notes'].includes(argv[i + 1])) throw new Error('--view takes draw or notes');
			view = argv[++i];
		}
		else if (arg === '--base') {
			if (basePath !== null || !argv[i + 1] || argv[i + 1].startsWith('-')) throw new Error('--base takes one text file (write a name that starts with a dash as ./-original.md)');
			basePath = argv[++i];
		}
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
	if (basePath) { wrapOptions.base = await readFile(basePath, 'utf8'); wrapOptions.baseName = basename(basePath); }
	if (view) wrapOptions.view = view;
	// R85b: always a new file; 'wx' refuses any existing path, links included.
	try { await writeFile(out, wrap(page, text, name, wrapOptions), {flag: 'wx'}); }
	catch (error) { throw error.code === 'EEXIST' ? new Error(out + ' already exists, and rapier-html never overwrites a file: name a new one') : error; }
	log(out + ' (' + name + ', ' + Buffer.byteLength(text) + ' bytes of document' +
		(view ? ', opens on ' + (view === 'draw' ? 'Draw' : 'Notes') : '') + (drawingPath ? ', ' + basename(drawingPath) + ' drawing' : '') + (basePath ? ', its diff from ' + basename(basePath) : '') + ')');
	return out;
}
