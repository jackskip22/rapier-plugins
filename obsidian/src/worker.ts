import * as engine from './core/engine.js';

type Call = {id: number; op: string; args: unknown[]; ack?: number; seq?: number; stop?: boolean};
// A part waits here until the page has taken it (or has no use for more): the decode runs no further ahead than that.
const taking = new Map<string, (stop: boolean) => void>();
type Op = (...a: never[]) => unknown;
const ops: Record<string, Op> = {
  convert: engine.convert, analyze: engine.analyze, toPng: engine.toPng, toJpeg: engine.toJpeg,
  canRestoreJpeg: engine.canRestoreJpeg, verifyJxl: engine.verifyJxl, verifyPng: engine.verifyPng, verifyJpeg: engine.verifyJpeg, display: engine.display, isAnimated: engine.isAnimated, size: engine.size, remake: engine.remake,
};
const scope = self as unknown as {postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<Call>) => void) | null};
async function handle(e: MessageEvent<Call>) {
  if (e.data.ack !== undefined) { const key = `${e.data.ack}:${e.data.seq}`; const done = taking.get(key); taking.delete(key); done?.(e.data.stop === true); return; }
  const {id, op, args} = e.data;
  try {
    // A call that shows pictures as it goes (display) is given a way to post each part before its reply.
    let seq = 0;
    const emit = (part: {png: Uint8Array}) => new Promise<void>((resolve, reject) => {
      const n = ++seq;
      taking.set(`${id}:${n}`, stop => { stop ? reject(new DOMException('Stopped', 'AbortError')) : resolve(); });
      scope.postMessage({id, part, seq: n}, [part.png.buffer]);
    });
    const result: unknown = op === 'display'
      ? await (ops.display as unknown as (...a: unknown[]) => unknown)(args[0], args[1], args[2], emit, args[3])
      : await ops[op](...(args as never[]));
    const transfer: Transferable[] = [];
    const walk = (v: unknown) => {
      if (v instanceof Uint8Array && v.buffer instanceof ArrayBuffer) transfer.push(v.buffer);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(result);
    scope.postMessage({id, ok: true, result}, [...new Set(transfer)]);
  } catch (err) {
    scope.postMessage({id, ok: false, error: err instanceof Error ? err.message : String(err)});
  }
}
scope.onmessage = e => { void handle(e); };
