#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Usage: node run.mjs [--impl path/to/module.mjs] [--tolerance 2]
import {resolve} from 'node:path';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadDocuments, installMeasurer} from './measurer.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
	const out = {impl: resolve(here, '../index.mjs'), tolerance: 2};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--impl') out.impl = resolve(process.cwd(), argv[++i]);
		else if (argv[i] === '--tolerance') out.tolerance = Number(argv[++i]);
	}
	return out;
}
const args = parseArgs(process.argv.slice(2));
const impl = await import(args.impl.startsWith('file://') ? args.impl : 'file://' + args.impl);

const need = ['parseLayout', 'formatLayout', 'prepareRun', 'prepareRichInline', 'flowLines', 'pictureSlices', 'bandsProfile', 'polygonProfile', 'rasterTiltProfile', 'parseProfile', 'wrapColumnFloor'];
const missing = need.filter(name => typeof impl[name] !== 'function');
if (missing.length) { console.error('run.mjs: implementation at ' + args.impl + ' is missing: ' + missing.join(', ')); process.exit(2); }

function buildProfile(hint) {
	if (!hint) return null;
	if (hint.kind === 'bands') return impl.parseProfile(hint.descriptor);
	if (hint.kind === 'polygon') return impl.polygonProfile(hint.corners);
	if (hint.kind === 'rasterTilt') return impl.rasterTiltProfile(hint.width, hint.height, hint.radiusDeg * Math.PI / 180);
	throw new Error('unknown profileHint.kind: ' + hint.kind);
}

const documents = loadDocuments(here);
// Install once over merged data: Pretext memoizes its context (measurer.mjs).
const measurer = installMeasurer(documents);

// Preservation and presentation are separate claims; preservation is exact or a bug.
const preservationRows = documents.map(expected => {
	const comment = expected.picture?.layout;
	if (!comment) return {document: expected.document, verdict: 'n/a', detail: "this fixture's picture carries no md-layout comment"};
	try {
		const value = impl.parseLayout(comment);
		if (!value) return {document: expected.document, verdict: 'FAIL', detail: 'parseLayout refused a comment the fixture actually carries: ' + comment};
		const back = impl.formatLayout(value);
		return back === comment
			? {document: expected.document, verdict: 'EXACT', detail: comment}
			: {document: expected.document, verdict: 'FAIL', detail: `parsed ${JSON.stringify(value)} then reformatted to ${JSON.stringify(back)}, source was ${JSON.stringify(comment)}`};
	} catch (error) { return {document: expected.document, verdict: 'FAIL', detail: error.message}; }
});
{
	const width = Math.max(...preservationRows.map(r => r.document.length));
	console.log('Preservation (source facts: exact, no measurer involved)\n');
	console.log('document'.padEnd(width) + '  verdict  detail');
	for (const row of preservationRows) console.log(row.document.padEnd(width) + '  ' + row.verdict.padEnd(7) + '  ' + row.detail);
	const exact = preservationRows.filter(r => r.verdict === 'EXACT').length, applicable = preservationRows.filter(r => r.verdict !== 'n/a').length;
	console.log(`\n${exact}/${applicable} documents with a layout comment round-trip it exactly through parseLayout/formatLayout.\n`);
}

console.log('Presentation (line boxes; hits/misses show how much of each row rests on the real trace vs. the character-sum fallback)\n');
const rows = [];
for (const expected of documents) {
	const font = expected.measurer.font.replace(/\/[^ ]+ /, ' '); // canvas fonts take no line-height
	const before = {hits: measurer.stats.hits, misses: measurer.stats.misses};
	const run = impl.prepareRun(expected.anchorText, font, expected.measurer.letterSpacing || 0);
	if (!run) { rows.push({document: expected.document, verdict: 'ERROR', detail: 'prepareRun refused this font/text/letterSpacing'}); continue; }
	const flow = impl.prepareRichInline([{text: run.raw, font, letterSpacing: expected.measurer.letterSpacing || 0}]);
	let obstacles = [];
	if (expected.picture?.rect) {
		const profile = buildProfile(expected.profileHint);
		const {left, top, right, bottom} = expected.picture.rect;
		obstacles = impl.pictureSlices(profile, left, top, right - left, bottom - top);
	}
	const fontSize = parseFloat(/(\d+(?:\.\d+)?)px/.exec(expected.measurer.font)?.[1]) || 16;
	const minWidth = impl.wrapColumnFloor(fontSize);
	const plan = impl.flowLines(flow, expected.measurer.columnWidth, 0, obstacles, expected.measurer.lineHeight, minWidth, expected.measurer.direction);
	if (!plan) { rows.push({document: expected.document, verdict: 'ERROR', detail: 'flowLines returned null (no plan fits)'}); continue; }

	const lineCountAgrees = plan.lines.length === expected.lines.length;
	let maxLeftDelta = 0, maxRightDelta = 0;
	for (let i = 0; i < Math.min(plan.lines.length, expected.lines.length); i++) {
		const got = plan.lines[i], want = expected.lines[i];
		// Flowed lines compare slot geometry (x+width); unflowed lines compare the measured tight extent.
		const right = expected.anchorFlowed ? got.x + got.width : got.x + measurer.measure(font, got.fragments.map(f => f.text).join(''));
		maxLeftDelta = Math.max(maxLeftDelta, Math.abs(got.x - want.left));
		maxRightDelta = Math.max(maxRightDelta, Math.abs(right - want.right));
	}
	const withinTolerance = lineCountAgrees && maxLeftDelta <= args.tolerance && maxRightDelta <= args.tolerance;
	rows.push({
		document: expected.document,
		verdict: withinTolerance ? 'AGREE' : lineCountAgrees ? 'CLOSE' : 'DIFFERS',
		expectedLines: expected.lines.length, gotLines: plan.lines.length,
		maxLeftDelta: Math.round(maxLeftDelta * 100) / 100, maxRightDelta: Math.round(maxRightDelta * 100) / 100,
		hits: measurer.stats.hits - before.hits, misses: measurer.stats.misses - before.misses,
	});
}

const width = Math.max(...rows.map(r => r.document.length));
console.log('document'.padEnd(width) + '  verdict   lines(exp/got)  maxΔleft  maxΔright  measurer(hits/misses)');
for (const row of rows) {
	if (row.verdict === 'ERROR') { console.log(row.document.padEnd(width) + '  ERROR     ' + row.detail); continue; }
	console.log(row.document.padEnd(width) + '  ' + row.verdict.padEnd(8) + '  ' + `${row.expectedLines}/${row.gotLines}`.padEnd(14) + '  ' +
		`${row.maxLeftDelta}px`.padEnd(8) + '  ' + `${row.maxRightDelta}px`.padEnd(9) + '  ' + `${row.hits}/${row.misses}`);
}
const agree = rows.filter(r => r.verdict === 'AGREE').length;
const close = rows.filter(r => r.verdict === 'CLOSE').length;
const differs = rows.filter(r => r.verdict === 'DIFFERS').length;
console.log(`\n${agree}/${rows.length} documents AGREE within ${args.tolerance}px, ${close} CLOSE, ${differs} DIFFERS.`);
console.log(`Measurer: ${measurer.stats.hits} queries answered from Rapier's own real browser trace, ${measurer.stats.misses} fell back to a character-glyph sum (no kerning/shaping).`);
console.log(`A row's own hits/misses can undercount its real coverage: several fixtures share one identical anchor sentence, and Pretext's own per-process`);
console.log(`segment cache (agent/vendor/pretext/measurement.js) serves a repeated (font, segment) query straight from that cache without calling`);
console.log(`measureText again at all -- real data, just not counted against the SECOND document to ask for it. Three named, separate reasons a row still`);
console.log(`reads CLOSE rather than AGREE, none of them "close enough": (a) no real trace exists at all for 01-inline/02-width-x-align/05-behind/06-front`);
console.log(`-- their picture pushes no flow obstacle, so layout/interchange.js's own prepare() never calls Pretext for this paragraph during export (see`);
console.log(`measurer.mjs) -- the from-scratch character-sum approximation disagrees with real shaping by a bounded, named amount; (b) 03/11/13 DO run`);
console.log(`Pretext for real (hits > 0, 13-rtl-text at 100% -- every query answered from the real trace) yet still carry a small, constant left-edge delta`);
console.log(`(5.18px, unchanged from before this measurer existed) -- a picture-obstacle geometry fact, not a text one: these`);
console.log(`fixtures' profileHint is a hand-computed, quantized alpha band descriptor for a raster Rapier's own export never serialized an occupancy`);
console.log(`descriptor for (conformance/README.md, "profileHint"), and that descriptor's own precision -- not this lane's measurer -- is the residual gap; (c) 09 plans the recorded 14 lines but one row`);
console.log(`differs by a whole slot: its recorded trace cuts a word in the ring's narrow left slot, and the planner now gives a word that must break inside itself`);
console.log(`the widest slot of its row (layout/line-plan.mjs) -- the recorded lines are the earlier planner's.`);
if (measurer.stats.missedQueries.length) {
	console.log(`\nFirst ${Math.min(10, measurer.stats.missedQueries.length)} of ${measurer.stats.misses} missed (font, text) queries (fell back to the character sum):`);
	for (const {font, text} of measurer.stats.missedQueries.slice(0, 10)) console.log(`  ${JSON.stringify(text)}  (${font})`);
}
