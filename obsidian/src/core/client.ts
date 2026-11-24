import type {Check, ConvertOptions, Converted, Kept, Part} from './engine.js';
import type {Look} from './classify.js';

declare const __WORKER_SOURCE__: string;

type Reply = {id: number; ok: true; result: unknown} | {id: number; ok: false; error: string} | {id: number; part: unknown};
type Pending = {resolve: (v: unknown) => void; reject: (e: Error) => void; part?: (v: unknown) => unknown};

/** One background worker, started on first use and stopped on unload. Cancelling stops the worker; the next call starts a new one. */
export class Engine {
  private worker: Worker | null = null;
  private url: string | null = null;
  private next = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly lifetime: AbortSignal) {}

  private start(): Worker {
    if (this.worker) return this.worker;
    const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], {type: 'text/javascript'}));
    let w: Worker;
    try { w = new Worker(url); }
    catch (e) { URL.revokeObjectURL(url); throw e; }
    w.onmessage = (e: MessageEvent<Reply>) => {
      const reply = e.data;
      const p = this.pending.get(reply.id);
      if (!p) return;
      // Each part is acknowledged once its taker has dealt with it, so the worker decodes no further ahead than the page can show.
      // A taker that answers false has no use for more.
      if ('part' in reply) {
        const seq = (reply as {seq?: number}).seq;
        const ack = (more: unknown) => { if (this.worker === w && this.pending.get(reply.id) === p) w.postMessage({ack: reply.id, seq, stop: more === false}); };
        let taken: unknown;
        try { taken = p.part?.(reply.part); } catch { ack(false); return; }
        Promise.resolve(taken).then(ack, () => ack(false));
        return;
      }
      this.pending.delete(reply.id);
      if (reply.ok) p.resolve(reply.result); else p.reject(new Error(reply.error));
    };
    w.onerror = e => { if (this.worker === w) this.fail(new Error(e.message || 'The converter stopped.')); };
    this.worker = w;
    this.url = url;
    return w;
  }

  private fail(error: Error) {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.worker = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }

  stop() {
    this.fail(new Error('The converter stopped.'));
  }

  private call<T>(op: string, args: unknown[], transfer: Transferable[] = [], signal?: AbortSignal, part?: (v: unknown) => unknown): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Canceled', 'AbortError'));
    if (this.lifetime.aborted) return Promise.reject(this.lifetime.reason as Error);
    return new Promise<T>((resolve, reject) => {
      const id = this.next++;
      const onAbort = () => {
        this.pending.delete(id);
        this.fail(new Error('Canceled'));
        reject(new DOMException('Canceled', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, {once: true});
      this.pending.set(id, {
        part,
        resolve: v => { signal?.removeEventListener('abort', onAbort); resolve(v as T); },
        reject: e => { signal?.removeEventListener('abort', onAbort); reject(e instanceof Error ? e : new Error(String(e))); },
      });
      try { this.start().postMessage({id, op, args}, transfer); }
      catch (e) {
        const p = this.pending.get(id);
        this.pending.delete(id);
        p?.reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private copy(bytes: Uint8Array): Uint8Array { return bytes.slice(); }

  convert(bytes: Uint8Array, ext: string, o: ConvertOptions, signal?: AbortSignal) {
    const b = this.copy(bytes);
    return this.call<Converted>('convert', [b, ext, o], [b.buffer], signal);
  }
  analyze(bytes: Uint8Array, ext: string, signal?: AbortSignal) {
    const b = this.copy(bytes);
    return this.call<{look: Look; width: number; height: number; kind: 'jpeg' | 'gif' | 'still' | 'lossy-webp'}>('analyze', [b, ext], [b.buffer], signal);
  }
  toPng(bytes: Uint8Array) { const b = this.copy(bytes); return this.call<{bytes: Uint8Array}>('toPng', [b], [b.buffer]); }
  toJpeg(bytes: Uint8Array) { const b = this.copy(bytes); return this.call<Uint8Array>('toJpeg', [b], [b.buffer]); }
  canRestoreJpeg(bytes: Uint8Array) { const b = this.copy(bytes); return this.call<boolean>('canRestoreJpeg', [b], [b.buffer]); }
  remake(ext: string, jxl: Uint8Array, kept?: string) { const b = this.copy(jxl); return this.call<Uint8Array | null>('remake', [ext, b, kept], [b.buffer]); }
  /** A picture as a PNG. An animation also arrives frame by frame through onPart, each a plain PNG to show at once, before the whole animated PNG. */
  display(bytes: Uint8Array, maxPixels: number, bandBytes?: number, onPart?: (part: Part) => void | boolean | Promise<void | boolean>, keepBytes?: number) {
    const b = this.copy(bytes);
    return this.call<{png: Uint8Array; width: number; height: number; frames: number; animated: boolean; streamed?: true}>('display', [b, maxPixels, bandBytes, keepBytes], [b.buffer], undefined, onPart as ((v: unknown) => unknown) | undefined);
  }
  isAnimated(bytes: Uint8Array) { const b = this.copy(bytes); return this.call<boolean>('isAnimated', [b], [b.buffer]); }
  verifyJxl(source: Uint8Array, ext: string, jxl: Uint8Array, kept: Kept) {
    const a = this.copy(source), b = this.copy(jxl);
    return this.call<Check>('verifyJxl', [a, ext, b, kept], [a.buffer, b.buffer]);
  }
  verifyPng(jxl: Uint8Array, png: Uint8Array) {
    const a = this.copy(jxl), b = this.copy(png);
    return this.call<Check>('verifyPng', [a, b], [a.buffer, b.buffer]);
  }
  verifyJpeg(jpeg: Uint8Array) { const b = this.copy(jpeg); return this.call<Check>('verifyJpeg', [b], [b.buffer]); }
}
