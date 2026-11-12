import type {Check, ConvertOptions, Converted, Kept} from './engine.js';
import type {Look} from './classify.js';

declare const __WORKER_SOURCE__: string;

type Reply = {id: number; ok: true; result: unknown} | {id: number; ok: false; error: string};
type Pending = {resolve: (v: unknown) => void; reject: (e: Error) => void};

/** One background worker, started on first use and stopped on unload. Cancelling stops the worker; the next call starts a new one. */
export class Engine {
  private worker: Worker | null = null;
  private url: string | null = null;
  private next = 1;
  private pending = new Map<number, Pending>();

  private start(): Worker {
    if (this.worker) return this.worker;
    this.url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], {type: 'text/javascript'}));
    const w = new Worker(this.url);
    w.onmessage = (e: MessageEvent<Reply>) => {
      const reply = e.data;
      const p = this.pending.get(reply.id);
      if (!p) return;
      this.pending.delete(reply.id);
      if (reply.ok) p.resolve(reply.result); else p.reject(new Error(reply.error));
    };
    w.onerror = e => this.fail(new Error(e.message || 'The converter stopped.'));
    this.worker = w;
    return w;
  }

  private fail(error: Error) {
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
    this.stop();
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private call<T>(op: string, args: unknown[], transfer: Transferable[] = [], signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Canceled', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
      const id = this.next++;
      const onAbort = () => {
        this.pending.delete(id);
        this.fail(new Error('Canceled'));
        reject(new DOMException('Canceled', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, {once: true});
      this.pending.set(id, {
        resolve: v => { signal?.removeEventListener('abort', onAbort); resolve(v as T); },
        reject: e => { signal?.removeEventListener('abort', onAbort); reject(e instanceof Error ? e : new Error(String(e))); },
      });
      try { this.start().postMessage({id, op, args}, transfer); }
      catch (e) { this.pending.delete(id); reject(e instanceof Error ? e : new Error(String(e))); }
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
  display(bytes: Uint8Array, maxPixels: number) {
    const b = this.copy(bytes);
    return this.call<{png: Uint8Array; width: number; height: number; frames: number}>('display', [b, maxPixels], [b.buffer]);
  }
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
