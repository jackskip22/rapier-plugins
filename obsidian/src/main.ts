// The only file that imports Obsidian. Everything it decides comes from ./core (plain functions over bytes and strings);
// this file maps Obsidian's API onto that core. If Obsidian's plugin API changes, rewrite this file and nothing else.
import {
  App, Editor, FileView, MarkdownFileInfo, MarkdownView, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, normalizePath,
} from 'obsidian';
import {Engine} from './core/client.js';
import {maxPixelsFor, type Mode} from './core/engine.js';
import {embedSizeInNote, embedSizeNow, embedsInText, type EmbedAttrs, type Size} from './core/text.js';
import {bytes as fmt, IMAGE_EXTENSIONS, pictures} from './core/format.js';
import {KEEPS} from './core/estimate.js';
import {TINY_JXL} from './core/tiny.js';
import {journalOf, pending, plan, runBatch, undoRun, type BatchPort, type Job, type JournalEntry, type Outcome} from './core/batch.js';
import {split} from './core/plan.js';

interface Settings {
  convertOnImport: boolean;
  quality: number;
  look: Mode;
  removeOriginals: boolean;
  lastRun: JournalEntry[];
}
const DEFAULTS: Settings = {convertOnImport: false, quality: 90, look: 'auto', removeOriginals: false, lastRun: []};

const VIEW_TYPE = 'jxl-picture';
const MOBILE_PIXELS = 40_000_000;
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const isConvertible = (f: TFile) => IMAGE_EXTENSIONS.includes(f.extension.toLowerCase());
const maxPixels = () => maxPixelsFor(Platform.isMobile);
const imageKind = (f: File): string | null => {
  const t = /^image\/(png|jpeg|webp|gif)$/.exec(f.type)?.[1];
  if (t) return t === 'jpeg' ? 'jpg' : t;
  const e = /\.(png|jpe?g|webp|gif)$/i.exec(f.name)?.[1]?.toLowerCase();
  return e ? (e === 'jpeg' ? 'jpg' : e) : null;
};
const toBuffer = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

function failureText(e: unknown): string {
  const m = message(e);
  return /dimension|pixel|limit|memory/i.test(m) ? 'This picture is too large to show on this device.' : `Can't show this picture. ${m}`;
}

/** The core's view of the vault, over Obsidian's documented vault, file manager and metadata cache. */
class VaultPort implements BatchPort {
  constructor(private app: App) {}
  private file(path: string): TFile {
    const f = this.app.vault.getFileByPath(normalizePath(path));
    if (!f) throw new Error(`Missing file: ${path}`);
    return f;
  }
  exists(path: string) { return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null; }
  stat(path: string) { const f = this.app.vault.getFileByPath(normalizePath(path)); return f ? {size: f.stat.size, mtime: f.stat.mtime} : null; }
  async read(path: string) { return new Uint8Array(await this.app.vault.readBinary(this.file(path))); }
  // createBinary never replaces: it fails if the path is taken.
  async create(path: string, bytes: Uint8Array) { await this.app.vault.createBinary(normalizePath(path), toBuffer(bytes)); }
  private referrers(path: string): string[] {
    const links = this.app.metadataCache.resolvedLinks;
    return Object.keys(links).filter(note => links[note][path]);
  }
  noteReferrers(path: string) {
    const cached = this.referrers(path).filter(p => p.endsWith('.md'));
    // The link cache can lag behind a note being typed in: include every open note too.
    const open = this.app.workspace.getLeavesOfType('markdown').map(l => (l.view as MarkdownView).file?.path).filter((p): p is string => !!p);
    return [...new Set([...cached, ...open])];
  }
  otherReferrers(path: string) { return this.referrers(path).filter(p => !p.endsWith('.md')); }
  async processNote(path: string, change: (text: string) => string) { await this.app.vault.process(this.file(path), change); }
  async readNote(path: string) { return this.app.vault.read(this.file(path)); }
  refersTo(note: string, target: string, file: string) {
    const link = target.split('#')[0].split('^')[0];
    return this.app.metadataCache.getFirstLinkpathDest(link, note)?.path === file;
  }
  nameIsUnique(name: string) { return this.app.vault.getFiles().filter(f => f.name === name).length <= 1; }
  // The person's own trash setting, never a permanent delete chosen by this plugin.
  async trash(path: string) { await this.app.fileManager.trashFile(this.file(path)); }
}

class JxlView extends FileView {
  navigation = true;
  constructor(leaf: WorkspaceLeaf, private plugin: JxlPlugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getIcon() { return 'image'; }
  async onLoadFile(file: TFile) {
    this.contentEl.empty();
    this.contentEl.addClass('jxl-view');
    try {
      const img = this.contentEl.createEl('img', {cls: 'jxl-view-image'});
      img.onerror = () => { img.onerror = null; void this.plugin.decodedUrl(file).then(u => { img.src = u; }, e => this.contentEl.createEl('p', {text: failureText(e), cls: 'jxl-error'})); };
      img.src = await this.plugin.url(file);
    } catch (e) {
      this.contentEl.createEl('p', {text: failureText(e), cls: 'jxl-error'});
    }
  }
  async onUnloadFile() { this.contentEl.empty(); }
}

export default class JxlPlugin extends Plugin {
  settings: Settings = {...DEFAULTS};
  engine = new Engine();
  port!: VaultPort;
  private nativeSupport: Promise<boolean> | null = null;
  private cache = new Map<string, string>();
  private observer?: MutationObserver;

  async onload() {
    this.settings = {...DEFAULTS, ...((await this.loadData()) as Partial<Settings> | null)};
    this.port = new VaultPort(this.app);
    this.addSettingTab(new JxlSettingTab(this.app, this));

    // Documented: a file view for .jxl, and a reading-view post-processor.
    this.registerView(VIEW_TYPE, leaf => new JxlView(leaf, this));
    this.registerExtensions(['jxl'], VIEW_TYPE);
    this.registerMarkdownPostProcessor((el, ctx) => this.hydrate(el, ctx.sourcePath));
    // Not documented, behind one function with a feature check: live preview embeds and markdown images.
    this.app.workspace.onLayoutReady(() => this.installEmbedFallback());

    this.registerEvent(this.app.workspace.on('editor-paste', (evt, editor, info) => this.paste(evt, evt.clipboardData?.files, editor, info)));
    this.registerEvent(this.app.workspace.on('editor-drop', (evt, editor, info) => this.paste(evt, evt.dataTransfer?.files, editor, info)));

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile)) return;
      if (isConvertible(file)) menu.addItem(i => i.setTitle('Convert to JPEG XL').setIcon('image').onClick(() => this.convert([file], 'Convert this picture')));
      if (file.extension === 'jxl') {
        menu.addItem(i => i.setTitle('Convert back to PNG').setIcon('image').onClick(() => this.back([file], 'png')));
        menu.addItem(i => i.setTitle('Restore the original JPEG').setIcon('image').onClick(() => this.back([file], 'jpg')));
      }
    }));
    this.addCommand({
      id: 'convert-picture', name: 'Convert this picture',
      checkCallback: c => { const f = this.activePicture(); if (!f || !isConvertible(f)) return false; if (!c) this.convert([f], 'Convert this picture'); return true; },
    });
    this.addCommand({
      id: 'convert-note', name: 'Convert all pictures in this note',
      checkCallback: c => { const n = this.app.workspace.getActiveFile(); if (!n || n.extension !== 'md') return false; if (!c) this.convertNote(n); return true; },
    });
    this.addCommand({
      id: 'convert-vault', name: 'Convert all pictures in the vault',
      callback: () => this.convert(this.app.vault.getFiles().filter(isConvertible), 'Convert all pictures'),
    });
    this.addCommand({
      id: 'to-png', name: 'Convert this picture back to PNG',
      checkCallback: c => { const f = this.activePicture(); if (!f || f.extension !== 'jxl') return false; if (!c) this.back([f], 'png'); return true; },
    });
    this.addCommand({
      id: 'to-jpeg', name: 'Restore the original JPEG',
      checkCallback: c => { const f = this.activePicture(); if (!f || f.extension !== 'jxl') return false; if (!c) this.back([f], 'jpg'); return true; },
    });
    this.addCommand({
      id: 'cancel-conversion', name: 'Cancel the conversion',
      checkCallback: c => { if (!this.running) return false; if (!c) this.running.abort(); return true; },
    });
    this.addCommand({
      id: 'undo', name: 'Undo the last conversion',
      checkCallback: c => { if (!this.settings.lastRun.length) return false; if (!c) void this.undo(); return true; },
    });
  }

  onunload() {
    this.running?.abort();
    this.engine.stop();
    this.observer?.disconnect();
    for (const url of this.cache.values()) URL.revokeObjectURL(url);
    this.cache.clear();
  }

  async saveSettings() { await this.saveData(this.settings); }

  private activePicture(): TFile | null { return this.app.workspace.getActiveViewOfType(FileView)?.file ?? null; }

  // ---- showing ----

  private hasNative(): Promise<boolean> {
    this.nativeSupport ??= (async () => {
      try {
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(TINY_JXL), c => c.charCodeAt(0))], {type: 'image/jxl'}));
        bitmap.close();
        return true;
      } catch { return false; }
    })();
    return this.nativeSupport;
  }

  /** The app's own decoder where it has one. */
  async url(file: TFile): Promise<string> {
    return (await this.hasNative()) ? this.app.vault.getResourcePath(file) : this.decodedUrl(file);
  }

  /** The package's decoder, always available. */
  async decodedUrl(file: TFile): Promise<string> {
    const key = `${file.path}:${file.stat.mtime}:${file.stat.size}`;
    const hit = this.cache.get(key);
    if (hit) { this.cache.delete(key); this.cache.set(key, hit); return hit; }
    const shown = await this.engine.display(new Uint8Array(await this.app.vault.readBinary(file)), MOBILE_PIXELS);
    const url = URL.createObjectURL(new Blob([shown.png as BlobPart], {type: 'image/png'}));
    this.cache.set(key, url);
    while (this.cache.size > 24) {
      const [oldest] = this.cache.keys();
      URL.revokeObjectURL(this.cache.get(oldest)!);
      this.cache.delete(oldest);
    }
    return url;
  }

  /**
   * Embeds. Reading view uses the documented post-processor. Live preview has no documented hook for a file type Obsidian
   * does not know, so this watches the page for the placeholder Obsidian draws (`.internal-embed[src]`, its `alt` holding the width).
   * Missing (no MutationObserver, or the markup changed): embeds show Obsidian's own placeholder, and the file still opens in its own view.
   */
  private queued = false;
  private schedule() {
    if (this.queued) return;
    this.queued = true;
    window.requestAnimationFrame(() => { this.queued = false; this.hydrate(activeDocument.body, this.app.workspace.getActiveFile()?.path ?? ''); });
  }

  private installEmbedFallback() {
    if (typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver(() => this.schedule());
    // Live preview may set an embed's size after it draws the embed: watch those attributes too.
    this.observer.observe(activeDocument.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['alt', 'width', 'height']});
    this.hydrate(activeDocument.body, this.app.workspace.getActiveFile()?.path ?? '');
    // The plug-in may be turned on with notes already open: reading view drew them without it, so draw those again.
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) (leaf.view as MarkdownView).previewMode?.rerender(true);
    // The embed follows the note's text on every edit.
    this.registerEvent(this.app.workspace.on('editor-change', () => this.observer && this.schedule()));
    // A markdown image `![](x.jxl)` the page could not decode: error events do not bubble, so listen in the capture phase.
    this.registerDomEvent(activeDocument, 'error', e => this.imageFailed(e), true);
  }

  /** The note an embed belongs to: the pane that holds it, else the one the caller knows. */
  private sourceOf(el: HTMLElement, fallback: string): string {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view as MarkdownView;
      if (view.file && view.containerEl.contains(el)) return view.file.path;
    }
    return fallback;
  }

  /** What the note's own text says, when it can be matched embed for embed. The text is always current; Obsidian's markup may lag it. */
  private sizeInText(el: HTMLElement, src: string, sourcePath: string): Size | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file || view.file.path !== sourcePath || !view.containerEl.contains(el)) return null;
    const drawn = [...view.containerEl.querySelectorAll<HTMLElement>('.internal-embed[src]')].filter(e => /\.jxl(#|$)/i.test(e.getAttribute('src') ?? ''));
    const written = embedsInText(view.editor.getValue());
    const i = drawn.indexOf(el);
    if (i < 0 || drawn.length !== written.length) return null;
    const name = (t: string) => t.split('/').pop()!.toLowerCase();
    return name(written[i].target) === name(src) ? written[i].size : null;
  }

  private hydrate(root: HTMLElement, fallbackPath: string) {
    root.querySelectorAll<HTMLElement>('.internal-embed[src]').forEach(el => {
      const src = (el.getAttribute('src') ?? '').split('#')[0];
      if (!/\.jxl$/i.test(src)) return;
      const sourcePath = this.sourceOf(el, fallbackPath);
      const file = this.app.metadataCache.getFirstLinkpathDest(src, sourcePath);
      if (!file) return;
      const attrs: EmbedAttrs = {alt: el.getAttribute('alt'), width: el.getAttribute('width'), height: el.getAttribute('height')};
      const prev: EmbedAttrs | null = el.dataset.jxlAttrs ? JSON.parse(el.dataset.jxlAttrs) as EmbedAttrs : null;
      let img = el.dataset.jxl ? el.querySelector('img') : null;
      let size = this.sizeInText(el, src, sourcePath) ?? embedSizeNow(img ? prev : null, attrs, el.dataset.jxlSize ? JSON.parse(el.dataset.jxlSize) as Size : undefined);
      if (!img && !size.width) size = embedSizeInNote(this.app.metadataCache.getCache(sourcePath)?.embeds, link => this.app.metadataCache.getFirstLinkpathDest(link.split('#')[0], sourcePath)?.path === file.path);
      el.dataset.jxlAttrs = JSON.stringify(attrs);
      el.dataset.jxlSize = JSON.stringify(size);
      const place = (i: HTMLImageElement) => {
        // Set or clear both: a size taken out of the note, or `200x100` edited to `200`, must not leave the old one behind.
        for (const k of ['width', 'height'] as const) {
          const want = size[k] ? String(size[k]) : null;
          if (i.getAttribute(k) === want) continue; // an unchanged attribute would still wake the observer
          if (want) i.setAttribute(k, want); else i.removeAttribute(k);
        }
      };
      if (img) { place(img); return; }
      el.dataset.jxl = '1';
      el.empty();
      el.addClasses(['image-embed', 'is-loaded', 'jxl-embed']);
      img = el.createEl('img');
      place(img);
      const shown = img;
      shown.alt = file.basename;
      const decoded = () => this.decodedUrl(file).then(u => { shown.src = u; }, e => { el.empty(); el.createSpan({text: failureText(e), cls: 'jxl-error'}); });
      shown.onerror = () => { shown.onerror = null; void decoded(); };
      this.url(file).then(u => { shown.src = u; }, () => void decoded());
    });
  }

  private imageFailed(e: Event) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.jxlTried || !/\.jxl(\?|$)/i.test(img.src)) return;
    img.dataset.jxlTried = '1';
    // The resource URL is the vault's resource prefix plus the file's path.
    const prefix = this.app.vault.adapter.getResourcePath('').split('?')[0];
    const clean = img.src.split('?')[0];
    const file = clean.startsWith(prefix) ? this.app.vault.getFileByPath(decodeURIComponent(clean.slice(prefix.length))) : null;
    if (file) this.decodedUrl(file).then(u => { img.src = u; }, () => undefined);
  }

  // ---- converting what is there ----

  private convertNote(note: TFile) {
    const links = this.app.metadataCache.resolvedLinks[note.path] ?? {};
    const files = Object.keys(links).map(p => this.app.vault.getFileByPath(p)).filter((f): f is TFile => !!f && isConvertible(f));
    if (!files.length) { new Notice('No pictures to convert in this note.'); return; }
    this.convert(files, 'Convert pictures in this note');
  }

  private jxlJob(): Job {
    const {quality, look, removeOriginals} = this.settings;
    return {
      destExt: 'jxl', removeOriginals,
      transform: async (b, ext, signal) => {
        const r = await this.engine.convert(b, ext, {mode: look, quality, maxPixels: maxPixels()}, signal);
        return r.bytes ? {bytes: r.bytes, kept: r.kept} : {bytes: null, reason: r.reason ?? 'Not converted.'};
      },
      verify: (src, ext, out, kept) => this.engine.verifyJxl(src, ext, out, (kept ?? 'lossy') as 'pixels'),
    };
  }

  private backJob(ext: 'png' | 'jpg'): Job {
    return {
      destExt: ext, removeOriginals: false,
      transform: async b => {
        try {
          if (ext === 'png') return {bytes: (await this.engine.toPng(b)).bytes};
          if (!(await this.engine.canRestoreJpeg(b))) return {bytes: null, reason: 'This file does not hold a JPEG.'};
          return {bytes: await this.engine.toJpeg(b)};
        } catch (e) { return {bytes: null, reason: message(e)}; }
      },
      verify: async (src, _e, out) => (ext === 'png' ? this.engine.verifyPng(src, out) : this.engine.verifyJpeg(out)),
    };
  }

  private busy(): boolean {
    if (this.running) new Notice('A conversion is already running.');
    return !!this.running;
  }
  private convert(files: TFile[], title: string) { if (!this.busy()) new ConvertModal(this.app, this, files, title, 'jxl').open(); }
  private back(files: TFile[], ext: 'png' | 'jpg') { if (!this.busy()) new ConvertModal(this.app, this, files, ext === 'png' ? 'Convert back to PNG' : 'Restore the original JPEG', ext).open(); }

  private running: AbortController | null = null;

  /**
   * Runs a planned batch in the background. Progress is a notice, where Obsidian shows background work, never a modal:
   * the person keeps typing, and each note changes in one atomic step (`vault.process`), so what they type stays.
   * Clicking a notice dismisses it in Obsidian; the run goes on, and the "Cancel the conversion" command still reaches it.
   */
  startRun(kind: 'jxl' | 'png' | 'jpg', planned: ReturnType<typeof plan>) {
    const controller = new AbortController();
    this.running = controller;
    const box = activeDocument.createDocumentFragment();
    const text = activeDocument.createElement('span');
    const cancel = activeDocument.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.className = 'jxl-cancel';
    cancel.addEventListener('click', e => { e.stopPropagation(); controller.abort(); text.textContent = 'Canceling…'; });
    box.append(text, cancel);
    text.textContent = `Converting 1 of ${planned.length}`;
    const notice = new Notice(box, 0);
    void (async () => {
      let results: Outcome[];
      try {
        results = await runBatch(this.port, this.job(kind), planned, controller.signal, (i) => { if (!controller.signal.aborted) text.textContent = `Converting ${i + 1} of ${planned.length}`; });
      } finally {
        this.running = null;
        notice.hide();
      }
      await this.finish(results, controller.signal.aborted);
    })();
  }

  job(kind: 'jxl' | 'png' | 'jpg'): Job { return kind === 'jxl' ? this.jxlJob() : this.backJob(kind); }

  async finish(results: Outcome[], canceled: boolean) {
    this.settings.lastRun = journalOf(results);
    await this.saveSettings();
    const done = results.filter((r): r is Extract<Outcome, {status: 'done'}> => r.status === 'done');
    const left = results.length - done.length;
    const text = done.length
      ? `${pictures(done.length)}, ${fmt(done.reduce((s, r) => s + r.before, 0))} to ${fmt(done.reduce((s, r) => s + r.after, 0))}`
      : results.length ? 'Nothing was converted.' : 'No pictures to convert.';
    const why = results.find(r => r.status === 'skipped');
    new Notice(canceled ? `Canceled. ${text}` : left ? `${text}. ${left} left as they were.${done.length === 0 && why?.status === 'skipped' ? ' ' + why.reason : ''}` : text, 8000);
  }

  private async undo() {
    if (this.busy()) return;
    const journal = this.settings.lastRun;
    const out = await undoRun(this.port, journal, async e => this.engine.remake(split(e.src).ext, await this.port.read(e.dest), e.kept));
    this.settings.lastRun = [];
    await this.saveSettings();
    new Notice(out.left.length ? `Undid ${pictures(out.undone)}. ${out.left.length} left as they are: ${out.left[0].reason}` : `Undid ${pictures(out.undone)}.`, 10000);
  }

  // ---- converting on the way in ----

  // Drops: this listens to Obsidian's `editor-drop`, which carries `dataTransfer.files`. A file dragged from a Linux file manager (Thunar, seen in
  // Obsidian 1.15.0) never reached it: the host did not deliver the drop to plug-ins, so only paste and drops from inside Obsidian work there.
  private paste(evt: ClipboardEvent | DragEvent, list: FileList | null | undefined, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
    if (!this.settings.convertOnImport || evt.defaultPrevented || !list?.length) return;
    // A file dragged from the file manager can arrive without a type: its name says what it is.
    const files = [...list].filter(f => imageKind(f) !== null);
    if (!files.length || files.length !== list.length) return;
    evt.preventDefault();
    void this.importAll(files, editor, editor.getCursor(), info.file?.path ?? '');
  }

  private async importAll(files: File[], editor: Editor, at: {line: number; ch: number}, sourcePath: string) {
    const links: string[] = [];
    const notes: string[] = [];
    // A large picture takes a while: say so, and take the notice away when it is done.
    const working = new Notice(files.length > 1 ? `Converting ${files.length} pictures…` : 'Converting…', 0);
    try {
    for (const f of files) {
      try { const r = await this.importOne(f, sourcePath); links.push(r.link); if (r.note) notes.push(r.note); }
      catch (e) { new Notice(`Not saved. ${message(e)}`); }
    }
    } finally { working.hide(); }
    if (links.length) editor.replaceRange(links.join('\n'), at);
    if (notes.length) new Notice(notes.join(' '), 8000);
  }

  private async importOne(f: File, sourcePath: string): Promise<{link: string; note: string}> {
    const input = new Uint8Array(await f.arrayBuffer());
    const ext = imageKind(f)!;
    const base = f.name && !/^image\.\w+$/.test(f.name) ? split(f.name).base : `Pasted image ${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    const out = await this.engine.convert(input, ext, {mode: this.settings.look, quality: this.settings.quality, maxPixels: maxPixels()});
    // The pasted picture is the only copy: the converted file is used only after it is read back and checked against it.
    let bytes: Uint8Array = input, outExt = ext, note = '';
    if (out.bytes) {
      const check = await this.engine.verifyJxl(input, ext, out.bytes, out.kept ?? 'lossy');
      if (check.ok) { bytes = out.bytes; outExt = 'jxl'; note = `Saved as JPEG XL, ${fmt(input.length)} to ${fmt(bytes.length)}.`; }
      else note = `Saved as ${ext.toUpperCase()}. ${check.reason}`;
    } else if (out.reason !== 'No smaller.') note = `Saved as ${ext.toUpperCase()}. ${out.reason ?? ''}`;
    const path = await this.app.fileManager.getAvailablePathForAttachment(`${base}.${outExt}`, sourcePath);
    const file = await this.app.vault.createBinary(path, toBuffer(bytes));
    let link = this.app.fileManager.generateMarkdownLink(file, sourcePath);
    if (!link.startsWith('!')) link = '!' + link;
    return {link, note};
  }
}

/** Plans the whole batch, shows exactly that plan, then runs it with progress and a cancel button. */
class ConvertModal extends Modal {
  private controller = new AbortController();
  private started = false;
  constructor(app: App, private plugin: JxlPlugin, private files: TFile[], private title: string, private kind: 'jxl' | 'png' | 'jpg') { super(app); }

  onOpen() {
    this.setTitle(this.title);
    this.contentEl.createEl('p', {text: 'Checking…'});
    void this.dry();
  }

  private async dry() {
    const {contentEl} = this;
    const {port, engine} = this.plugin;
    const all = this.files.map(f => ({path: f.path, size: f.stat.size, mtime: f.stat.mtime}));
    // Many pictures: one that already has its converted file beside it is not converted again under a new name.
    const {todo, done} = this.files.length > 1 ? pending(port, all, this.kind) : {todo: all, done: 0};
    const items = plan(port, todo, this.kind);
    let before = 0, after = 0;
    const rows: {src: string; dest: string; size: number; look: string}[] = [];
    try {
      for (const it of items) {
        if (this.controller.signal.aborted) return;
        let look = this.kind === 'jxl' ? '' : '', guess = 1;
        if (this.kind === 'jxl') {
          const a = await engine.analyze(await port.read(it.src.path), split(it.src.path).ext, this.controller.signal).catch(() => null);
          if (!a) continue;
          look = a.kind === 'still' ? a.look : a.kind;
          guess = a.kind === 'jpeg' ? KEEPS.jpeg : a.kind === 'gif' ? KEEPS.gif : a.kind === 'lossy-webp' ? 1 : a.look === 'photo' ? KEEPS['png-photo'] : KEEPS['png-screenshot'];
        }
        before += it.src.size; after += it.src.size * Math.min(1, guess);
        rows.push({src: it.src.path, dest: it.dest, size: it.src.size, look});
      }
    } catch { return; }
    contentEl.empty();
    contentEl.createEl('p', {text: (rows.length ? `${pictures(rows.length)}${this.kind === 'jxl' ? `, about ${fmt(before)} to ${fmt(after)}` : ''}.` : 'No pictures to convert.') + (done ? ` ${done} already converted.` : '')});
    const list = contentEl.createDiv({cls: 'jxl-list'});
    for (const r of rows.slice(0, 200)) {
      const line = list.createDiv({cls: 'jxl-row'});
      line.createSpan({text: `${r.src} → ${r.dest}`, cls: 'jxl-row-name'});
      line.createSpan({text: [fmt(r.size), r.look].filter(Boolean).join(' · '), cls: 'jxl-row-size'});
    }
    if (rows.length > 200) list.createDiv({text: `and ${rows.length - 200} more`, cls: 'jxl-row'});
    contentEl.createEl('p', {
      text: this.plugin.settings.removeOriginals && this.kind === 'jxl' ? 'Originals go to the trash once their links are updated.' : 'Originals stay where they are.',
      cls: 'setting-item-description',
    });
    contentEl.createEl('p', {text: 'Other devices open JPEG XL pictures only where this plugin is installed.', cls: 'setting-item-description'});
    const planned = items.filter(i => rows.some(r => r.src === i.src.path));
    new Setting(contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setButtonText('Convert').setCta().setDisabled(!rows.length).onClick(() => this.run(planned)));
  }

  private run(planned: ReturnType<typeof plan>) {
    this.started = true;
    this.close();
    this.plugin.startRun(this.kind, planned);
  }

  onClose() { if (!this.started) this.controller.abort(); this.contentEl.empty(); }
}

class JxlSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: JxlPlugin) { super(app, plugin); }

  display(): void {
    const {containerEl} = this;
    const s = this.plugin.settings;
    containerEl.empty();
    new Setting(containerEl)
      .setName('Convert pasted and dropped pictures')
      .setDesc('PNG, JPEG, WebP and GIF are saved as JPEG XL.')
      .addToggle(t => t.setValue(s.convertOnImport).onChange(async v => { s.convertOnImport = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Photo quality')
      .setDesc('Screenshots and diagrams always keep every pixel. JPEG files are kept exactly and can be restored.')
      .addSlider(sl => sl.setLimits(50, 100, 1).setValue(s.quality).onChange(async v => { s.quality = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Treat pictures as')
      .setDesc('Automatic looks at the colors in each picture.')
      .addDropdown(d => d.addOptions({auto: 'Automatic', screenshot: 'Screenshots', photo: 'Photographs'}).setValue(s.look)
        .onChange(async v => { s.look = v as Mode; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Remove originals')
      .setDesc('After a picture is converted, checked and its links updated, move the original to the trash. Off: originals stay.')
      .addToggle(t => t.setValue(s.removeOriginals).onChange(async v => { s.removeOriginals = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Other devices').setHeading();
    containerEl.createEl('p', {text: 'A converted vault opens on another device only where this plugin is installed.', cls: 'setting-item-description'});
  }
}
