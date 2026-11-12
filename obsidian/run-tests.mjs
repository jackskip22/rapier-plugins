import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const entries = ['test/core.test.ts', 'test/batch.test.ts'];
await build({entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: '.test', outExtension: {'.js': '.mjs'}, packages: 'external', logLevel: 'error'});
process.exit(spawnSync('node', ['--test', ...entries.map(e => '.test/' + e.split('/').pop().replace('.ts', '.mjs'))], {stdio: 'inherit'}).status ?? 1);
