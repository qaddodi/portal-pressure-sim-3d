// The page's side of the plate worker (plate-worker.ts). `ask` sends one state to paint and calls back with the finished bitmap (flipped and premultiplied, ready to be a texture's image), or null when there is no
// worker to paint in (node, an old browser, a failed worker): the caller then paints on the page, as before. Only the newest ask is answered; an older one still in flight is dropped when it lands.
import type { PlateAsk } from './plate-worker.ts';

export type PlateAskIn = Omit<PlateAsk, 'id'>;

export class PlateClient {
  private w: Worker | null = null;
  private dead = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined';
  private id = 0;
  private pending: { id: number; done: (b: ImageBitmap | null) => void } | null = null;
  get available(): boolean { return !this.dead; }
  ask(a: PlateAskIn, done: (b: ImageBitmap | null) => void): void {
    if (this.dead) { done(null); return; }
    try {
      if (!this.w) {
        this.w = new Worker(new URL('./plate-worker.ts', import.meta.url), { type: 'module' });
        this.w.onmessage = (e: MessageEvent<{ id: number; bmp?: ImageBitmap; error?: string }>) => {
          const p = this.pending;
          if (!p || e.data.id !== p.id) { e.data.bmp?.close(); return; }
          this.pending = null;
          if (e.data.bmp) p.done(e.data.bmp); else { this.dead = true; p.done(null); }
        };
        this.w.onerror = () => { this.dead = true; const p = this.pending; this.pending = null; p?.done(null); };
      }
      this.pending = { id: ++this.id, done };
      this.w.postMessage({ ...a, id: this.id });
    } catch { this.dead = true; this.pending = null; done(null); }
  }
  dispose(): void { this.w?.terminate(); this.w = null; this.pending = null; }
}
