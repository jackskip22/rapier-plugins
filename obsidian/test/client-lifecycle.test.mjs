// The shipped, minified plug-in against a controlled worker host. JXL_PACKAGE selects the built codec package;
// JXL_OBSIDIAN_SOURCE can point at an unchanged checkout to reproduce these failures before the fix.
import {before, test} from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let bundle;
before(async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'jxl-obsidian-lifecycle-'));
  try {
    const source = resolve(process.env.JXL_OBSIDIAN_SOURCE || here);
    await cp(join(source, 'src'), join(scratch, 'src'), {recursive: true});
    for (const file of ['build.mjs', 'worker-core.mjs']) await cp(join(source, file), join(scratch, file));
    await mkdir(join(scratch, 'node_modules'));
    await symlink(resolve(process.env.JXL_PACKAGE || join(here, 'node_modules/jpegxl')), join(scratch, 'node_modules/jpegxl'), 'dir');
    await symlink(dirname(require.resolve((process.env.ESBUILD || 'esbuild') + '/package.json')), join(scratch, 'node_modules/esbuild'), 'dir');
    const built = spawnSync(process.execPath, ['build.mjs'], {cwd: scratch, encoding: 'utf8'});
    assert.equal(built.status, 0, built.stderr);
    bundle = await readFile(join(scratch, 'main.js'), 'utf8');
  } finally { await rm(scratch, {recursive: true, force: true}); }
});

function host(imageDecoder) {
  const state = {imageDecoder, created: [], revoked: [], scripts: [], workers: [], constructorError: null, postError: null,
    dom: 0, notices: [], views: new Map(), layout: [], frames: new Map(), canceledFrames: [], observers: [],
    registered: [], modals: [], reads: 0, resourcePaths: 0, writes: 0, editorWrites: 0, nextFrame: 1, pathCalls: 0,
    attachmentPath: async name => name,
    loadData: async () => null, readBinary: async () => new Uint8Array([1, 2, 3]).buffer,
    probe: async () => { throw new Error('no native decoder'); }};
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.dataset = {}; this.children = []; this.attrs = new Map(); }
    empty() { state.dom++; this.children = []; }
    addClass() { state.dom++; }
    addClasses() { state.dom++; }
    createEl(tag) { state.dom++; const child = tag === 'img' ? new Image() : new Element(tag); this.children.push(child); return child; }
    createSpan() { return this.createEl('span'); }
    createDiv() { return this.createEl('div'); }
    setAttribute(name, value) { state.dom++; this.attrs.set(name, value); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { state.dom++; this.attrs.delete(name); }
    querySelector(selector) { return selector === 'img' ? this.children.find(child => child.tag === 'img') ?? null : null; }
    querySelectorAll(selector) { return selector === '.internal-embed[src]' ? this.embeds ?? [] : []; }
    contains(child) { return this.children.includes(child); }
    set textContent(value) { state.dom++; this.text = value; }
    set src(value) { state.dom++; this.source = value; }
    get src() { return this.source ?? ''; }
  }
  class Image extends Element {
    constructor() { super('img'); this.shown = []; }
    set src(value) { this.shown.push(value); this._src = value; }
    get src() { return this._src; }
  }
  class Worker {
    constructor(url) {
      if (state.constructorError) throw state.constructorError;
      this.url = url; this.messages = []; this.terminated = 0; state.workers.push(this);
    }
    postMessage(message) { if (state.postError) throw state.postError; this.messages.push(message); }
    terminate() { this.terminated++; }
    reply(result, message = this.messages.shift()) { this.onmessage?.({data: {id: message.id, ok: true, result}}); }
  }
  const app = {
    workspace: {
      onLayoutReady(callback) { state.layout.push(callback); }, on(name) { return name; },
      getLeavesOfType: () => [], getActiveFile: () => null, getActiveViewOfType: () => null,
    },
    vault: {
      async readBinary(file) { state.reads++; return state.readBinary(file); },
      getResourcePath(file) { state.resourcePaths++; return 'vault:' + file.path; },
      async createBinary(path) { state.writes++; return {path}; },
    },
    metadataCache: {getFirstLinkpathDest: () => state.file, getCache: () => null},
    fileManager: {getAvailablePathForAttachment(...args) { state.pathCalls++; return state.attachmentPath(...args); }, generateMarkdownLink: file => '[[' + file.path + ']]'},
  };
  class Plugin {
    constructor() { this.app = app; }
    loadData() { return state.loadData(); }
    addSettingTab() { state.registered.push('settings'); }
    registerView(type, factory) { state.views.set(type, factory); }
    registerExtensions() { state.registered.push('extensions'); }
    registerMarkdownPostProcessor(callback) { state.markdown = callback; }
    registerEvent() { state.registered.push('event'); }
    registerDomEvent() { state.registered.push('dom'); }
    addCommand() { state.registered.push('command'); }
  }
  const obsidian = {
    Plugin, FileView: class { constructor(leaf) { this.contentEl = leaf.contentEl; } },
    Modal: class { constructor() { this.contentEl = new Element(); state.modals.push(this); } setTitle() {} open() { this.onOpen(); } close() { this.onClose(); } },
    PluginSettingTab: class {}, Platform: {isMobile: false},
    Setting: class { addButton(callback) { const button = {setButtonText() { return this; }, onClick() { return this; }, setCta() { return this; }, setDisabled() { return this; }}; callback(button); return this; } },
    Notice: class { constructor(text) { this.text = text; state.notices.push(this); } hide() { this.hidden = true; } },
  };
  const module = {exports: {}}, body = new Element();
  runInNewContext(bundle, {
    module, exports: module.exports,
    require: name => { assert.equal(name, 'obsidian'); return obsidian; },
    Worker, Blob, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Error, DOMException, AbortController, atob, btoa,
    ImageDecoder: state.imageDecoder, HTMLImageElement: Image, activeDocument: {body}, createImageBitmap: (...args) => state.probe(...args),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; state.observers.push(this); }
      observe() { this.observing = true; } disconnect() { this.observing = false; }
    },
    window: {
      setTimeout: (f, ms) => globalThis.setTimeout(f, ms), clearTimeout: id => globalThis.clearTimeout(id),
      requestAnimationFrame(callback) { const id = state.nextFrame++; state.frames.set(id, callback); return id; },
      cancelAnimationFrame(id) { state.canceledFrames.push(id); state.frames.delete(id); },
    },
    URL: {
      createObjectURL(blob) { const url = `blob:worker-${state.created.length}`; state.created.push(url); state.scripts.push(blob); return url; },
      revokeObjectURL(url) { state.revoked.push(url); },
    },
  }, {filename: 'main.js'});
  const plugin = new module.exports.default();
  return {state, plugin, body, Element, engine: plugin.engine, unload: () => plugin.onunload()};
}
const bytes = () => new Uint8Array([1, 2, 3]);
const settled = promise => promise.then(value => ({value}), error => ({error}));
async function completes(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('worker call did not settle')), 1000); })]);
  } finally { clearTimeout(timer); }
}
const listeners = controller => getEventListeners(controller.signal, 'abort').length;
const clean = h => {
  assert.deepEqual([...h.state.revoked].sort(), [...h.state.created].sort());
  assert.ok(h.state.workers.every(w => w.terminated === 1 && w.onmessage === null && w.onerror === null));
};

test('failed worker construction releases its URL and abort listener', {timeout: 2000}, async t => {
  const h = host(), old = new AbortController();
  t.after(h.unload);
  h.state.constructorError = new Error('worker construction failed');
  await assert.rejects(h.engine.analyze(bytes(), 'png', old.signal), /worker construction failed/);
  const worker = Buffer.from(await h.state.scripts[0].arrayBuffer());
  t.diagnostic(JSON.stringify({pluginBytes: Buffer.byteLength(bundle), workerBytes: worker.length, workerSHA256: createHash('sha256').update(worker).digest('hex')}));
  assert.deepEqual([...h.state.revoked], [...h.state.created]);
  assert.equal(listeners(old), 0);
  h.state.constructorError = null;
  const retry = settled(h.engine.analyze(bytes(), 'png'));
  old.abort();
  h.state.workers[0].reply('retried');
  assert.deepEqual(await retry, {value: 'retried'});
  h.unload();
  clean(h);
});

test('failed posting cannot cancel another call when its old signal aborts', {timeout: 2000}, async t => {
  const h = host(), old = new AbortController();
  t.after(h.unload);
  h.state.postError = new Error('posting failed');
  await assert.rejects(h.engine.analyze(bytes(), 'png', old.signal), /posting failed/);
  h.state.postError = null;
  const retry = settled(h.engine.analyze(bytes(), 'png'));
  old.abort();
  h.state.workers[0].reply('retried');
  assert.deepEqual(await retry, {value: 'retried'});
  assert.equal(listeners(old), 0);
  assert.equal(h.state.workers.length, 1);
  h.unload();
  clean(h);
});

test('plug-in unload settles calls without abort signals and releases the worker once', {timeout: 2000}, async () => {
  const h = host();
  const display = settled(h.engine.display(bytes(), 100));
  const png = settled(h.engine.toPng(bytes()));
  h.unload();
  h.unload();
  assert.equal((await completes(display)).error?.message, 'The converter stopped.');
  assert.equal((await completes(png)).error?.message, 'The converter stopped.');
  clean(h);
});

test('cancel preserves each caller error and the next worker can complete', {timeout: 2000}, async t => {
  const h = host(), controller = new AbortController();
  t.after(h.unload);
  const canceled = settled(h.engine.analyze(bytes(), 'png', controller.signal));
  const peer = settled(h.engine.toPng(bytes()));
  controller.abort();
  assert.equal((await canceled).error?.name, 'AbortError');
  assert.equal((await canceled).error?.message, 'Canceled');
  assert.equal((await peer).error?.message, 'Canceled');
  assert.equal(listeners(controller), 0);
  const retry = h.engine.toPng(bytes());
  h.state.workers[1].reply('retried');
  assert.equal(await retry, 'retried');
  h.unload();
  clean(h);
});

test('a failed worker settles all jobs and its late error cannot stop its replacement', {timeout: 2000}, async t => {
  const h = host(), controller = new AbortController();
  t.after(h.unload);
  const first = settled(h.engine.analyze(bytes(), 'png', controller.signal));
  const peer = settled(h.engine.toPng(bytes()));
  const oldError = h.state.workers[0].onerror;
  oldError({message: 'worker failed'});
  assert.equal((await first).error?.message, 'worker failed');
  assert.equal((await peer).error?.message, 'worker failed');
  assert.equal(listeners(controller), 0);
  const retry = settled(h.engine.toPng(bytes()));
  oldError({message: 'late worker error'});
  h.state.workers[1].reply('retried');
  assert.deepEqual(await retry, {value: 'retried'});
  h.unload();
  clean(h);
});


const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const file = () => ({path: 'picture.jxl', basename: 'picture', stat: {mtime: 1, size: 3}});

test('unload during a vault read cannot restart the engine or refill its cache', async t => {
  const h = host(), read = deferred(); t.after(h.unload);
  h.state.readBinary = () => read.promise;
  const result = settled(h.plugin.decodedUrl(file()));
  h.unload(); read.resolve(bytes().buffer); await turn();
  if (h.state.workers.length) h.state.workers[0].reply({png: bytes()});
  const done = await completes(result);
  assert.equal(h.state.workers.length, 0);
  assert.equal(h.state.created.length, 0);
  assert.equal(h.plugin.cache.size, 0);
  assert.equal(done.error?.message, 'The converter stopped.');
});

test('a completed worker reply cannot publish its URL after unload', async t => {
  const h = host(); t.after(h.unload);
  const result = settled(h.plugin.decodedUrl(file())); await turn();
  h.state.workers[0].reply({png: bytes()});
  h.unload();
  const done = await completes(result);
  assert.equal(h.state.created.length, 1, 'only the retired worker URL was created');
  assert.equal(h.plugin.cache.size, 0);
  assert.equal(done.error?.message, 'The converter stopped.');
  clean(h);
});

for (const supported of [true, false]) test(`a late native probe cannot publish or decode after unload (${supported})`, async t => {
  const h = host(), probe = deferred(); t.after(h.unload);
  let closed = 0; h.state.probe = () => probe.promise;
  const result = settled(h.plugin.url(file())); h.unload();
  if (supported) probe.resolve({close() { closed++; }}); else probe.reject(new Error('no native decoder'));
  await turn();
  if (h.state.workers.length) h.state.workers[0].reply({png: bytes()});
  const done = await completes(result);
  assert.equal(closed, supported ? 1 : 0);
  assert.equal(h.state.resourcePaths, 0); assert.equal(h.state.reads, 0);
  assert.equal(h.state.workers.length, 0); assert.equal(h.state.created.length, 0);
  assert.equal(done.error?.message, 'The converter stopped.');
});

test('unload before saved settings resolve cannot register the plugin', async () => {
  const h = host(), settings = deferred(); h.state.loadData = () => settings.promise;
  const loading = h.plugin.onload(); h.unload(); settings.resolve(null); await loading;
  assert.equal(h.state.registered.length, 0); assert.equal(h.state.layout.length, 0); assert.equal(h.state.views.size, 0);
});

test('a deferred layout callback cannot install after unload', async () => {
  const h = host(); await h.plugin.onload(); h.unload();
  const registrations = h.state.registered.length, dom = h.state.dom;
  h.state.layout[0]();
  assert.equal(h.state.observers.length, 0); assert.equal(h.state.registered.length, registrations); assert.equal(h.state.dom, dom);
});

test('unload cancels its frame and a late callback cannot hydrate', async () => {
  const h = host(); let hydrated = 0; h.plugin.hydrate = () => { hydrated++; };
  h.plugin.schedule(); const callback = [...h.state.frames.values()][0]; h.unload(); callback(); h.plugin.schedule();
  assert.equal(hydrated, 0); assert.equal(h.state.frames.size, 0); assert.equal(h.state.canceledFrames.length, 1);
});

test('a native-probe continuation cannot update a file view after plugin unload', async () => {
  const h = host(), probe = deferred(); h.state.probe = () => probe.promise; await h.plugin.onload();
  const contentEl = new h.Element(), view = h.state.views.get('jxl-picture')({contentEl});
  const loading = view.onLoadFile(file()); h.unload(); const dom = h.state.dom;
  probe.resolve({close() {}}); await loading;
  assert.equal(h.state.dom, dom); assert.equal(h.state.resourcePaths, 0);
});

test('a file view closed during native probing stays empty', async t => {
  const h = host(), probe = deferred(); t.after(h.unload); h.state.probe = () => probe.promise; await h.plugin.onload();
  const contentEl = new h.Element(), view = h.state.views.get('jxl-picture')({contentEl});
  const loading = view.onLoadFile(file()); await view.onUnloadFile(); const dom = h.state.dom;
  probe.resolve({close() {}}); await turn(); if (h.state.workers.length) h.state.workers[0].reply(false); await loading;
  assert.equal(h.state.dom, dom); assert.equal(contentEl.children.length, 0);
});

test('an embed fallback failure after unload cannot replace its DOM', async t => {
  const h = host(), read = deferred(); t.after(h.unload); h.state.file = file(); h.state.readBinary = () => read.promise;
  const embed = new h.Element(); embed.attrs.set('src', 'picture.jxl'); h.body.embeds = [embed];
  h.plugin.hydrate(h.body, 'note.md'); await turn(); h.unload(); const dom = h.state.dom;
  read.reject(new Error('vault read failed')); await turn(); await turn();
  assert.equal(h.state.dom, dom); assert.equal(h.state.workers.length, 0); assert.equal(h.state.created.length, 0);
});

test('a pasted file read after unload cannot restart conversion or publish a notice or link', async () => {
  const h = host(), read = deferred(), input = {name: 'picture.png', type: 'image/png', arrayBuffer: () => read.promise};
  const editor = {replaceRange() { h.state.editorWrites++; }};
  const importing = h.plugin.importAll([input], editor, {line: 0, ch: 0}, 'note.md');
  h.unload(); read.resolve(bytes().buffer); await turn();
  if (h.state.workers.length) h.state.workers[0].reply({bytes: null, reason: 'No smaller.'});
  await completes(importing);
  assert.equal(h.state.workers.length, 0); assert.equal(h.state.writes, 0); assert.equal(h.state.editorWrites, 0);
  assert.equal(h.state.notices.length, 1); assert.equal(h.state.notices[0].hidden, true);
});


test('a deferred attachment path cannot start a vault write after unload', async () => {
  const h = host(), path = deferred(), input = {name: 'picture.png', type: 'image/png', arrayBuffer: async () => bytes().buffer};
  h.state.attachmentPath = () => path.promise;
  const editor = {replaceRange() { h.state.editorWrites++; }};
  const importing = h.plugin.importAll([input], editor, {line: 0, ch: 0}, 'note.md'); await turn();
  h.state.workers[0].reply({bytes: null, reason: 'No smaller.'}); await turn(); assert.equal(h.state.pathCalls, 1);
  h.unload(); path.resolve('picture.png'); await completes(importing);
  assert.equal(h.state.writes, 0); assert.equal(h.state.editorWrites, 0); assert.equal(h.state.notices.length, 1);
});

for (const closePlugin of [true, false]) test(`late modal analysis cannot redraw a closed owner (${closePlugin})`, async t => {
  const h = host(), read = deferred(); t.after(h.unload);
  h.plugin.port = {exists: () => false, read: () => read.promise};
  h.plugin.convert([{...file(), path: 'picture.png', extension: 'png'}], 'Convert this picture');
  const modal = h.state.modals[0];
  if (closePlugin) h.unload(); else modal.close();
  const dom = h.state.dom; read.resolve(bytes()); await turn();
  if (h.state.workers.length) h.state.workers[0].reply({kind: 'still', look: 'photo'});
  await turn();
  assert.equal(h.state.workers.length, 0); assert.equal(h.state.dom, dom);
});


test('a live display publishes the same bytes, reuses its cache and releases both URLs on unload', async () => {
  const h = host(), picture = file(), png = bytes();
  const reading = h.plugin.decodedUrl(picture); await turn(); h.state.workers[0].reply({png});
  const url = await reading;
  assert.equal(await h.plugin.decodedUrl(picture), url); assert.equal(h.state.reads, 1);
  assert.deepEqual(new Uint8Array(await h.state.scripts[1].arrayBuffer()), png);
  assert.equal(h.plugin.cache.size, 1); h.unload(); assert.equal(h.plugin.cache.size, 0); clean(h);
});

test('a live file view publishes its native URL after the bitmap is closed', async t => {
  const h = host(); t.after(h.unload); let closed = 0;
  h.state.probe = async () => ({close() { closed++; }}); await h.plugin.onload();
  const contentEl = new h.Element(), view = h.state.views.get('jxl-picture')({contentEl});
  const loading = view.onLoadFile(file());
  await turn(); h.state.workers[0].reply(false); await loading; // not animated: the app's own decoder shows it
  assert.equal(closed, 1); assert.equal(contentEl.children[0].src, 'vault:picture.jxl');
  assert.equal(h.state.workers.length, 1);
});

test('where the app animates JPEG XL itself, an animation shows natively with no decode and no read', async t => {
  const h = host(class {
    static async isTypeSupported() { return true; }
    constructor() { this.tracks = {ready: Promise.resolve(), selectedTrack: {frameCount: 2}}; }
    close() {}
  }); t.after(h.unload);
  h.state.probe = async () => ({close() {}}); await h.plugin.onload();
  const contentEl = new h.Element(), view = h.state.views.get('jxl-picture')({contentEl});
  await view.onLoadFile(file());
  assert.equal(contentEl.children[0].src, 'vault:picture.jxl');
  assert.equal(h.state.workers.length, 0); assert.equal(h.state.reads, 0);
});

test('an animation plays its first loop as its frames arrive, then the whole animation takes over', async t => {
  const h = host(); t.after(h.unload);
  h.state.probe = async () => { throw new Error('no native JPEG XL'); }; await h.plugin.onload();
  const contentEl = new h.Element(), view = h.state.views.get('jxl-picture')({contentEl});
  const loading = view.onLoadFile(file());
  await turn(); const worker = h.state.workers[0], call = worker.messages[0];
  const part = (index, loops = 0) => worker.onmessage({data: {id: call.id, part: {index, delayMs: 30, png: bytes(), width: 1, height: 1, loops}}});
  part(0); await new Promise(r => setTimeout(r, 10));
  const img = contentEl.children[0];
  assert.equal(img.shown.length, 1, 'the first frame shows at once');
  part(1); part(2);
  worker.reply({png: bytes(), animated: true, frames: 3, width: 1, height: 1});
  await loading;
  // three frames, then the whole animation: the last frame has had its time before the swap
  assert.equal(img.shown.length, 4);
  assert.equal(h.state.revoked.filter(u => img.shown.slice(0, 3).includes(u)).length >= 2, true, 'earlier frames are released');
  assert.equal(img.shown[3], 'blob:worker-4', 'the whole animation is the last url');
});

test('an animation that plays once waits for the whole animation', async t => {
  const h = host(); t.after(h.unload);
  h.state.probe = async () => { throw new Error('no native JPEG XL'); }; await h.plugin.onload();
  const contentEl = new h.Element(), view = h.state.views.get('jxl-picture')({contentEl});
  const loading = view.onLoadFile(file());
  await turn(); const worker = h.state.workers[0], call = worker.messages[0];
  worker.onmessage({data: {id: call.id, part: {index: 0, delayMs: 30, png: bytes(), width: 1, height: 1, loops: 1}}});
  await new Promise(r => setTimeout(r, 10));
  const img = contentEl.children[0];
  assert.equal(img.shown.length, 0);
  worker.reply({png: bytes(), animated: true, frames: 2, width: 1, height: 1});
  await loading;
  assert.equal(img.shown.length, 1);
});

test('a live file view plays an animation with the package decoder', async t => {
  const h = host(); t.after(h.unload);
  h.state.probe = async () => ({close() {}}); await h.plugin.onload();
  const contentEl = new h.Element(), view = h.state.views.get('jxl-picture')({contentEl});
  const loading = view.onLoadFile(file());
  await turn(); h.state.workers[0].reply(true);
  await turn(); h.state.workers[0].reply({png: bytes(), animated: true});
  await loading;
  assert.match(contentEl.children[0].src, /^blob:/);
});


for (const stage of ['convert', 'verify']) test(`a completed import reply cannot acquire an attachment path after unload (${stage})`, async () => {
  const h = host(), input = {name: 'picture.png', type: 'image/png', arrayBuffer: async () => bytes().buffer};
  const editor = {replaceRange() { h.state.editorWrites++; }};
  const importing = h.plugin.importAll([input], editor, {line: 0, ch: 0}, 'note.md'); await turn();
  if (stage === 'verify') {
    h.state.workers[0].reply({bytes: bytes(), kept: 'pixels'}); await turn();
    h.state.workers[0].reply({ok: true});
  } else h.state.workers[0].reply({bytes: null, reason: 'No smaller.'});
  h.unload(); await completes(importing);
  assert.equal(h.state.pathCalls, 0); assert.equal(h.state.writes, 0); assert.equal(h.state.editorWrites, 0);
  assert.equal(h.state.notices.length, 1); assert.equal(h.state.notices[0].hidden, true); clean(h);
});
