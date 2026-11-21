// The marks plate's painter in a worker (plate-client.ts): 2D's own painter (lobule-paint.js) draws one state of the tissue into an OffscreenCanvas and hands the page the finished bitmap, so the 2048 px repaint
// (100 to 300 ms on a phone) never runs on the page's own thread. Pure: the painter reads no page, and the look's colours are a table (lz-colours.ts).
import { paintWorldInto, useTokens } from './from2d/lobule-paint.generated.js';
import { buildLobule } from './geometry.ts';
import { PLATE_BOX, PLATE_PX, PLATE_S, plateInput, plateShape, type PlateState } from './plate.ts';
import { lookColours } from './lz-colours.ts';
import { sinRadius } from './widths.ts';
import type { LookId } from '../../looks/looks.ts';

export interface PlateAsk { id: number; look: LookId; s: PlateState; zones: boolean; skip: number; cvR: number }

const net = buildLobule();
const shape = { ...plateShape(net), cells: [] };
const sins = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an').map((c) => ({ c, r: sinRadius(c.kind as 's0', 0.5) * 1.15 }));
let canvas: OffscreenCanvas | null = null;

self.onmessage = async (e: MessageEvent<PlateAsk>) => {
  const { id, look, s, zones, skip, cvR } = e.data;
  const post = (m: unknown, t?: Transferable[]) => (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage(m, t);
  try {
    canvas ??= new OffscreenCanvas(PLATE_PX, PLATE_PX);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
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
    paintWorldInto(wrapped, PLATE_PX, sc, -B, -B, { ...plateInput(shape, sins, cvR, s, look), zonesOn: zones });
    const bmp = await createImageBitmap(canvas, { imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' });
    post({ id, bmp }, [bmp]);
  } catch (err) { post({ id, error: String(err) }); }
};
