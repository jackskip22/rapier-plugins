import type {Part} from './core/engine.js';

/** Takes a picture's url; false when nothing is showing it any more. */
export type Show = (url: string) => boolean;

/** Frames a streamed animation holds at once: the decoder waits for the frame ahead of this many to be shown. */
const WINDOW = 3;

/**
 * An animation's frames shown as they arrive: each frame comes as a plain PNG and is shown at its place in time (never before
 * the one before it has had its time). `finish` waits for the last frame's time to pass, so a kept animation can take over at the
 * start of the next loop. add() waits while three frames are queued, so the decoder runs no further ahead. A streamed animation (too long
 * to keep as an animated PNG) has no whole animation to take over: its frames wait while the tab is hidden, and it ends when
 * nothing shows the picture any more.
 */
export class LiveFrames {
  private queue: {url: string; delayMs: number}[] = [];
  private current: string | null = null;
  private due = 0;
  private timer = 0;
  private ended: (() => void) | null = null;
  private stopped = false;
  private waiting: (() => void)[] = [];
  private watching = false;
  constructor(private readonly show: Show, private readonly active: () => boolean, public streaming = false) {}
  /** Nothing shows the picture any more (or it was stopped): the decoder has no use for more frames. */
  get over() { return this.stopped; }
  /** The frame on show, handed over to stay: the animation has played its last loop. Null where it ended early. */
  keep(): string | null {
    const url = this.stopped ? null : this.current;
    this.current = null; this.stop();
    return url;
  }
  add(part: Part): Promise<void> {
    // A kept animation that plays once has no next loop to hand over at: it waits for the whole animation.
    if (this.stopped || (part.loops === 1 && !this.streaming)) return Promise.resolve();
    this.queue.push({url: URL.createObjectURL(new Blob([part.png as BlobPart], {type: 'image/png'})), delayMs: part.delayMs});
    this.pump();
    return this.queue.length < WINDOW ? Promise.resolve() : new Promise(resolve => { this.waiting.push(resolve); });
  }
  private release() {
    while (this.waiting.length && (this.stopped || this.queue.length < WINDOW)) this.waiting.shift()!();
  }
  private seen = () => { if (!document.hidden) { this.unwatch(); this.pump(); } };
  private unwatch() { if (this.watching) { this.watching = false; document.removeEventListener('visibilitychange', this.seen); } }
  private pump() {
    if (this.timer || this.stopped) return;
    const next = this.queue[0];
    if (!next) {
      // Everything has arrived: the last frame still on show gets its time, then the whole animation takes over.
      if (this.ended) this.timer = window.setTimeout(() => { this.timer = 0; this.ended?.(); }, Math.max(0, this.due - Date.now()));
      return;
    }
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (this.streaming && document.hidden) { this.watching = true; document.addEventListener('visibilitychange', this.seen); return; }
      const frame = this.queue.shift()!;
      if (!this.active() || !this.show(frame.url)) { URL.revokeObjectURL(frame.url); this.stop(); return; }
      if (this.current) URL.revokeObjectURL(this.current);
      this.current = frame.url;
      this.due = Date.now() + frame.delayMs;
      this.release();
      this.pump();
    }, Math.max(0, this.due - Date.now()));
  }
  /** Resolves when every frame has had its time. At once if nothing is showing any more. */
  finish(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    return new Promise(resolve => { this.ended = resolve; this.pump(); });
  }
  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.unwatch();
    for (const f of this.queue) URL.revokeObjectURL(f.url);
    this.queue = [];
    // The frame on show is released when the whole animation takes its place, so a late callback never shows a revoked url.
    if (this.current) { const url = this.current; window.setTimeout(() => URL.revokeObjectURL(url), 1000); this.current = null; }
    this.release();
    this.ended?.();
  }
}
