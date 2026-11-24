import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const entries = ['test/core.test.ts', 'test/batch.test.ts', 'test/live.test.ts'];
// JXL_LOCAL_DECODE=<path to a decode.mjs>: test against that decoder, not the installed package (for an onFrame the release has not shipped yet).
// JXL_LOCAL_PACKAGE=<a built package>: test against its modules, for what the release has not shipped yet (frames as an iterable).
const local = process.env.JXL_LOCAL_PACKAGE;
const alias = process.env.JXL_LOCAL_DECODE || local ? {...(local && Object.fromEntries(['animation', 'jpeg', 'decode', 'metadata'].map(m => ['jpegxl/' + m, local + '/dist/' + m + '.mjs']))), ...(process.env.JXL_LOCAL_DECODE && {'jpegxl/decode': process.env.JXL_LOCAL_DECODE})} : undefined;
await build({alias, entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: '.test', outExtension: {'.js': '.mjs'}, packages: 'external', logLevel: 'error'});
process.exit(spawnSync('node', ['--test', ...entries.map(e => '.test/' + e.split('/').pop().replace('.ts', '.mjs')), 'test/client-lifecycle.test.mjs'], {stdio: 'inherit'}).status ?? 1);
