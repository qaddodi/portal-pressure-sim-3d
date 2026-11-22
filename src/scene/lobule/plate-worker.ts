// The marks plate's painter in a worker (plate-client.ts): 2D's own painter (lobule-paint.js) draws one state of the tissue into an OffscreenCanvas and hands the page the finished bitmap, so the 2048 px repaint
// (100 to 300 ms on a phone) never runs on the page's own thread. Pure: the painter reads no page, and the look's colours are a table (lz-colours.ts).
import { useTokens } from './from2d/lobule-paint.generated.js';
import { ATLAS_W, collagenInput, paintCollagenWorld } from './collagen-paint.ts';
import { collagenTau, flipRows } from './collagen-tau.ts';
import { buildLobule } from './geometry.ts';
import { PLATE_BOX, PLATE_PX, PLATE_S, paintPlateWorld, plateInput, plateShape, type PlateState } from './plate.ts';
import { lookColours } from './lz-colours.ts';
import { sinRadius } from './widths.ts';
import type { LookId } from '../../looks/looks.ts';

export interface PlateAsk { id: number; look: LookId; s: PlateState; zones: boolean; skip: number; cvR: number;
  /** also paint the collagen layer (the look changed: collagen-paint.ts) */ collagen?: boolean;
  /** also give the arrival times (the first painting: collagen-tau.ts) */ tau?: boolean }

const net = buildLobule();
const shape = { ...plateShape(net), cells: [] };
const sins = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an').map((c) => ({ c, r: sinRadius(c.kind as 's0', 0.5) * 1.15 }));
let canvas: OffscreenCanvas | null = null, cCanvas: OffscreenCanvas | null = null;
const ctxOf = (c: OffscreenCanvas) => c.getContext('2d') as unknown as CanvasRenderingContext2D;

self.onmessage = async (e: MessageEvent<PlateAsk>) => {
  const { id, look, s, zones, skip, cvR, collagen, tau } = e.data;
  const post = (m: unknown, t?: Transferable[]) => (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage(m, t);
  try {
    canvas ??= new OffscreenCanvas(PLATE_PX, PLATE_PX);
    const ctx = ctxOf(canvas);
    const L = lookColours(look);
    useTokens((name: string, a?: number | string) => L.tk(name, a));
    let left = skip;
    const wrapped = new Proxy(ctx, {
      get(t, p) {
        if (p === 'fill') return (...a: unknown[]) => { if (left > 0) { left--; return; } (t.fill as (...x: unknown[]) => void).apply(t, a); };
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, p, v) { return Reflect.set(t, p, v, t); },
    });
    const B = PLATE_BOX * PLATE_S, sc = PLATE_PX / (2 * B);
    paintPlateWorld(wrapped, PLATE_PX, sc, -B, -B, { ...plateInput(shape, sins, cvR, s, look), zonesOn: zones });
    const bmp = await createImageBitmap(canvas, { imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' });
    const out: { id: number; bmp: ImageBitmap; cbmp?: ImageBitmap; tau?: Uint8Array } = { id, bmp }, tr: Transferable[] = [bmp];
    if (collagen) {
      cCanvas ??= new OffscreenCanvas(PLATE_PX * ATLAS_W, PLATE_PX);
      paintCollagenWorld(ctxOf(cCanvas), PLATE_PX, sc, -B, -B, collagenInput(shape, cvR, look));
      out.cbmp = await createImageBitmap(cCanvas, { imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' }); tr.push(out.cbmp);
    }
    if (tau) { out.tau = flipRows(collagenTau(shape, cvR * PLATE_S, PLATE_PX, B), PLATE_PX); tr.push(out.tau.buffer); }
    post(out, tr);
  } catch (err) { post({ id, error: String(err) }); }
};
