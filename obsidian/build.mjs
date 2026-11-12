import {build} from 'esbuild';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const common = {bundle: true, minify: true, target: 'es2022', legalComments: 'none', logLevel: 'warning'};
const worker = await build({...common, entryPoints: ['src/worker.ts'], format: 'iife', platform: 'browser', write: false});
const workerSource = worker.outputFiles[0].text;
await build({
  ...common, entryPoints: ['src/main.ts'], outfile: 'main.js', format: 'cjs', platform: 'browser', external: ['obsidian'],
  define: {__WORKER_SOURCE__: JSON.stringify(workerSource)},
});
console.log('worker', (workerSource.length / 1024).toFixed(0), 'KB; main.js', (readFileSync('main.js').length / 1024).toFixed(0), 'KB');
