import * as engine from './core/engine.js';

type Call = {id: number; op: string; args: unknown[]};
type Op = (...a: never[]) => unknown;
const ops: Record<string, Op> = {
  convert: engine.convert, analyze: engine.analyze, toPng: engine.toPng, toJpeg: engine.toJpeg,
  canRestoreJpeg: engine.canRestoreJpeg, verifyJxl: engine.verifyJxl, verifyPng: engine.verifyPng, verifyJpeg: engine.verifyJpeg, display: engine.display, size: engine.size, remake: engine.remake, checkRemade: engine.checkRemade,
};
const scope = self as unknown as {postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<Call>) => void) | null};
async function handle(e: MessageEvent<Call>) {
  const {id, op, args} = e.data;
  try {
    const result: unknown = await ops[op](...(args as never[]));
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
