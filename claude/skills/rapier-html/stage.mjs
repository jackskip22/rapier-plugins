// Prepack: build this checkout, then stage exactly the bytes the build's receipt names.
import {readFile, writeFile, copyFile, rm, stat, mkdir} from 'node:fs/promises';
import {openSync, closeSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {VERSION} from '../../version.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..', '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
for (const name of ['rapier.html', 'LICENSE', 'BUILD.json']) await rm(join(here, name), {force: true});

const pkg = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'));
if (pkg.name !== 'rapier-html' || pkg.version !== VERSION || pkg.license !== 'AGPL-3.0-only')
	throw new Error('rapier-html carries the editor it wraps: its package.json must say version ' + VERSION + ' (version.mjs) and AGPL-3.0-only; it says ' + pkg.version + ', ' + pkg.license);
if (process.env.RAPIER_PACK === 'fast') throw new Error('a package carries a release build; unset RAPIER_PACK=fast');

await mkdir(join(root, 'dist'), {recursive: true});
const log = join(root, 'dist', 'npm-build.log'), started = Date.now(), fd = openSync(log, 'w');
let built;
try { built = spawnSync(process.execPath, [join(root, 'tools', 'build.mjs')], {cwd: root, env: {...process.env, RAPIER_PROFILE: 'full'}, stdio: ['ignore', fd, fd]}); }
finally { closeSync(fd); }
if (built.error || built.status !== 0) throw new Error('the release build failed (' + (built.error?.message || 'exit ' + built.status) + '); see ' + log);

// The receipt must be this run's and name the bytes on disk.
const receipt = JSON.parse(await readFile(join(root, 'dist', 'BUILD.json'), 'utf8'));
const page = await readFile(join(root, 'rapier.html')), {mtimeMs} = await stat(join(root, 'rapier.html'));
const record = receipt.profiles?.full;
if (receipt.release !== VERSION || receipt.profile !== 'full' || receipt.mode !== 'release' || receipt.packing !== 'zopfli' ||
	receipt.node !== process.version || !(Date.parse(receipt.builtAt) >= started - 2000) || mtimeMs < started - 2000 ||
	record?.path !== 'rapier.html' || record.bytes !== page.length || record.sha256 !== sha256(page))
	throw new Error('the build did not leave a fresh rapier.html matching its own receipt (dist/BUILD.json); nothing staged');

const canonical = receipt.toolchain?.canonical === true;
await writeFile(join(here, 'rapier.html'), page);
await copyFile(join(root, 'LICENSE'), join(here, 'LICENSE'));
await writeFile(join(here, 'BUILD.json'), JSON.stringify({package: pkg.name, version: VERSION, path: 'rapier.html', bytes: page.length, sha256: sha256(page),
	builtAt: receipt.builtAt, node: receipt.node, canonical, packing: receipt.packing, validation: 'a release build; not a browser test'}, null, 2) + '\n');
console.log('staged rapier.html: ' + page.length + ' bytes, sha256 ' + sha256(page) + ', built on ' + receipt.node +
	(canonical ? '' : ' (NOT the pinned ' + receipt.toolchain?.node?.expected + ')') + '; with LICENSE and BUILD.json; nothing published');
