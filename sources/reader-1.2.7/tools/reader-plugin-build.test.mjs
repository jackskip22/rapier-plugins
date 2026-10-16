// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {identity, checkSources, checkOutput, checkMode, buildPluginOffer, main} from './reader-plugin-build.mjs';
import acorn from '../agent/vendor/acorn.mjs';

const toolchain = JSON.parse(await readFile(new URL('./toolchain.json', import.meta.url), 'utf8'));
const tree = async path => acorn.parse(await readFile(new URL(path, import.meta.url), 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'});
function nodes(ast) {
  const result = [];
  const visit = node => { if (!node || typeof node !== 'object') return; if (node.type) result.push(node); for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value); };
  visit(ast); return result;
}
test('page and standalone consume the shared generator and retain reader report plumbing', async () => {
  const page = nodes(await tree('./reader-build.mjs')), cli = nodes(await tree('./reader-plugin-build.mjs')), generator = nodes(await tree('./reader-plugin-generator.mjs'));
  assert(page.some(node => node.type === 'ImportDeclaration' && node.source.value === './reader-plugin-generator.mjs' && node.specifiers.some(spec => spec.imported?.name === 'buildReaderPlugins')));
  for (const ast of [page, cli]) assert.equal(ast.filter(node => node.type === 'CallExpression' && node.callee.name === 'buildReaderPlugins').length, 1);
  const caller = page.find(node => node.type === 'VariableDeclarator' && node.init?.type === 'AwaitExpression' && node.init.argument.callee?.name === 'buildReaderPlugins');
  assert.deepEqual(caller.id.properties.map(row => row.key.name), ['built', 'files', 'flowRegistry', 'pdfRegistry']);
  const exported = generator.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'buildReaderPlugins');
  assert(exported);
  const returned = exported.declaration.body.body.findLast(node => node.type === 'ReturnStatement');
  assert.deepEqual(returned.argument.properties.map(row => row.key.name), ['built', 'files', 'flowRegistry', 'pdfRegistry', 'docxRegistry']);
  const reportKeys = page.filter(node => node.type === 'AssignmentExpression' && node.left.object?.name === 'report').map(node => node.left.property.name);
  for (const key of ['plugins', 'used', 'unresolved', 'script', 'css', 'parts']) assert(reportKeys.includes(key));
  assert.equal(generator.filter(node => node.type === 'CallExpression' && node.callee.name === 'bundleModules').length, 3);
  assert.equal(page.filter(node => node.type === 'CallExpression' && node.callee.name === 'builtPlugin').length, 0);
});
test('release mode requires the canonical runtime and minification', () => {
  checkMode(toolchain.node.version, toolchain, {});
  assert.throws(() => checkMode('v24.0.0', toolchain, {}), /canonical Node/);
  for (const env of [{RAPIER_READER_NOMINIFY: '1'}, {RAPIER_PACK: 'fast'}, {RAPIER_PROFILE: 'full'}]) assert.throws(() => checkMode(toolchain.node.version, toolchain, env), /release, minified/);
});
test('missing, changed, duplicate and unsafe source inputs fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reader-plugin-sources-'));
  try {
    const bytes = Buffer.from('source'); await writeFile(join(root, 'input.mjs'), bytes);
    const entry = {path: 'input.mjs', ...identity(bytes)};
    assert.deepEqual(await checkSources(root, [entry]), ['input.mjs']);
    await assert.rejects(checkSources(root, [{...entry, path: 'missing.mjs'}]), /ENOENT/);
    await writeFile(join(root, 'input.mjs'), 'changed');
    await assert.rejects(checkSources(root, [entry]), /source identity differs/);
    await assert.rejects(checkSources(root, [{...entry, path: '../outside'}]), /Invalid.*source path/);
    await writeFile(join(root, 'input.mjs'), bytes);
    await assert.rejects(checkSources(root, [entry, entry]), /Invalid.*source path/);
  } finally { await rm(root, {recursive: true, force: true}); }
});
test('changed output identities and sets fail before publication', () => {
  const files = {'rapier-pdf-9.8.7.js': Buffer.from('payload')};
  const expected = Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, identity(bytes)]));
  assert.deepEqual(checkOutput(files, expected), expected);
  assert.throws(() => checkOutput({...files, 'extra.js': Buffer.from('extra')}, expected), /output set differs/);
  assert.throws(() => checkOutput({'rapier-pdf-9.8.7.js': Buffer.from('changed')}, expected), /output identity differs/);
  assert.throws(() => checkOutput(files, {'rapier-pdf-9.8.7.js': {...expected['rapier-pdf-9.8.7.js'], sha384: 'wrong'}}), /sha384/);
});
test('CLI rejects ambiguous options, existing destinations and in-source output', async () => {
  await assert.rejects(main(['--out', '/tmp/a', '--out', '/tmp/b']), /Expected/);
  await assert.rejects(main(['--no-minify', 'true']), /Expected/);
  await assert.rejects(buildPluginOffer({out: new URL('../dist/plugins', import.meta.url).pathname, manifest: 'unused'}), /outside the source tree/);
  const root = await mkdtemp(join(tmpdir(), 'reader-plugin-output-'));
  try { await assert.rejects(buildPluginOffer({out: root, manifest: 'unused'}), /already exists/); }
  finally { await rm(root, {recursive: true, force: true}); }
});
test('offline boundary rejects caught network access and undeclared reads', () => {
  const guard = new URL('./reader-plugin-offline.mjs', import.meta.url).href;
  for (const body of ["try { await fetch('https://example.invalid'); } catch {}", "try { await readFile('/tmp/undeclared-reader-source'); } catch {}", "try { spawnSync(process.execPath, ['--version']); } catch {}"] ) {
    const script = `import {offlinePluginBuild} from ${JSON.stringify(guard)}; import {readFile} from 'node:fs/promises'; import {spawnSync} from 'node:child_process'; const boundary = offlinePluginBuild('/tmp', []); ${body}; boundary.finish();`;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8'});
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Reader plug-in offline boundary/);
  }
});
test('record mode lists reads inside the tree and still refuses reads outside it', () => {
  const guard = new URL('./reader-plugin-offline.mjs', import.meta.url).href, inside = new URL('../version.mjs', import.meta.url).pathname;
  const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const listed = `import {offlinePluginBuild} from ${JSON.stringify(guard)}; import {readFileSync} from 'node:fs'; const boundary = offlinePluginBuild(${JSON.stringify(root)}, [], {record: true}); readFileSync(${JSON.stringify(inside)}); process.stdout.write(JSON.stringify(boundary.finish().reads));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', listed], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), ['version.mjs']);
  const outside = `import {offlinePluginBuild} from ${JSON.stringify(guard)}; import {readFileSync} from 'node:fs'; const boundary = offlinePluginBuild(${JSON.stringify(root)}, [], {record: true}); try { readFileSync('/etc/hostname'); } catch {} boundary.finish();`;
  const refused = spawnSync(process.execPath, ['--input-type=module', '-e', outside], {encoding: 'utf8'});
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /undeclared input/);
});
