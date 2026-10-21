// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, writeFile, mkdir, lstat, realpath} from 'node:fs/promises';
import {resolve, dirname, relative, isAbsolute, basename, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {offlinePluginBuild} from './reader-plugin-offline.mjs';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (kind, bytes) => createHash(kind).update(bytes).digest('hex');
const inside = (parent, child) => { const path = relative(parent, child); return !path || !path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path); };
export function identity(bytes) {
  return {bytes: bytes.length, sha256: hash('sha256', bytes), sha384: hash('sha384', bytes),
    gitBlob: hash('sha1', Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes]))};
}
export function checkOutput(files, expected) {
  if (!expected || Object.keys(files).sort().join('\n') !== Object.keys(expected).sort().join('\n')) throw new Error('Reader plug-in output set differs from the expected manifest');
  const outputs = {};
  for (const [file, bytes] of Object.entries(files)) {
    if (basename(file) !== file || !/^rapier-[a-z]+-[0-9]+\.[0-9]+\.[0-9]+\.js$/.test(file)) throw new Error('Invalid reader plug-in output path: ' + file);
    const actual = identity(bytes), pinned = expected[file];
    for (const key of ['bytes', 'sha256', 'sha384', 'gitBlob']) if (actual[key] !== pinned[key]) throw new Error('Reader plug-in output identity differs: ' + file + ' ' + key);
    outputs[file] = actual;
  }
  return outputs;
}
export async function checkSources(root, entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('Reader plug-in source manifest has no inputs');
  const seen = new Set();
  for (const entry of entries) {
    const path = entry.path;
    if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || seen.has(path)) throw new Error('Invalid reader plug-in source path: ' + path);
    seen.add(path);
    const full = resolve(root, path);
    if (!(await lstat(full)).isFile() || await realpath(full) !== full) throw new Error('Reader plug-in source must be a regular file without symlinks: ' + path);
    const actual = identity(await readFile(full));
    for (const key of ['bytes', 'sha256', 'gitBlob']) if (actual[key] !== entry[key]) throw new Error('Reader plug-in source identity differs: ' + path + ' ' + key);
  }
  return [...seen];
}
export function checkMode(version, toolchain, env = process.env) {
  if (version !== toolchain.node.version) throw new Error('Reader plug-ins require canonical Node ' + toolchain.node.version + '; got ' + version);
  if (env.RAPIER_READER_NOMINIFY !== undefined && env.RAPIER_READER_NOMINIFY !== '0' || env.RAPIER_PACK !== undefined && env.RAPIER_PACK !== 'release' || env.RAPIER_PROFILE !== undefined && env.RAPIER_PROFILE !== 'reader') throw new Error('Reader plug-ins require release, minified reader mode');
}
export async function buildPluginOffer({out, manifest, root = HERE}) {
  if (!out || !manifest) throw new Error('Usage: node tools/reader-plugin-build.mjs --manifest <source-manifest.json> --out <new-output-directory>');
  root = await realpath(root);
  const toolchain = JSON.parse(await readFile(resolve(root, 'tools/toolchain.json'), 'utf8'));
  checkMode(process.version, toolchain);
  const destination = resolve(out);
  if (inside(root, destination) || inside(destination, root)) throw new Error('Reader plug-in output must be outside the source tree');
  const parent = await realpath(dirname(destination));
  if (parent !== dirname(destination)) throw new Error('Reader plug-in output must be outside the source tree, without symlinks');
  try { await lstat(destination); throw new Error('Reader plug-in output already exists: ' + destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifestBytes = await readFile(resolve(manifest)), offer = JSON.parse(manifestBytes);
  if (offer.schema !== 'rapier-reader-plugin-source/1') throw new Error('Unsupported reader plug-in source manifest');
  const paths = await checkSources(root, offer.sources);
  process.env.RAPIER_PACK_CACHE = 'off';
  const boundary = offlinePluginBuild(root, paths);
  let generated, observation;
  try {
    const {VERSION} = await import('../version.mjs');
    if (offer.version !== VERSION) throw new Error('Reader plug-in source offer version differs from version.mjs');
    const {buildReaderPlugins} = await import('./reader-plugin-generator.mjs');
    generated = await buildReaderPlugins({root});
  } finally { observation = boundary.finish(); }
  await checkSources(root, offer.sources);
  const outputs = checkOutput(generated.files, offer.outputs);
  const receipt = {schema: 'rapier-reader-plugin-build/1', version: offer.version, node: process.version, canonical: true,
    mode: 'release', sourceManifestSha256: hash('sha256', manifestBytes), sourceFiles: paths.length, ...observation, outputs};
  await mkdir(destination);
  for (const [file, bytes] of Object.entries(generated.files)) await writeFile(resolve(destination, file), bytes, {flag: 'wx'});
  await writeFile(resolve(destination, 'BUILD.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  return receipt;
}
export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let at = 0; at < args.length; at += 2) {
    const key = args[at];
    if (!['--out', '--manifest'].includes(key) || !args[at + 1] || args[at + 1].startsWith('--') || options[key.slice(2)]) throw new Error('Expected --manifest <source-manifest.json> --out <new-output-directory>');
    options[key.slice(2)] = args[at + 1];
  }
  const receipt = await buildPluginOffer(options);
  console.log(JSON.stringify(receipt, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
