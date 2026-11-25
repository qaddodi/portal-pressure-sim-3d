// The promotion pictures' device frames (?promotion, promo/outer.ts): a captured screen laid in a plain, generic outline of a laptop, a phone or a tablet, on a dark backdrop with the app's
// logo and name above it. The outlines are drawn here from a few rounded shapes (no copy of any maker's artwork, no logo, no model name): a rounded bezel, a thin base, a small camera pill.
// `layoutFor` is pure arithmetic (every size is a fraction of the screen picture's width, so a 2x and a 3x picture frame alike) and is tested in node; `drawComposite` paints one picture.

export type FrameKind = 'mac' | 'iphone' | 'ipad';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Round extends Rect { r: number }
export interface Layout {
  kind: FrameKind;
  /** the finished picture's size in pixels */
  w: number; h: number;
  /** where the captured screen goes, and its corner radius */
  screen: Round;
  /** the bezel (a laptop's lid, a phone's or tablet's body) */
  body: Round;
  /** a laptop's base under the lid (null for the others) */
  base: Rect | null;
  /** the band the logo and name stand in (centered, above the device) */
  brand: Rect;
  /** the camera pill or dot, drawn over the screen */
  camera: Round | null;
  /** a phone's home bar, drawn over the screen */
  bar: Round | null;
  /** the small buttons standing out of a phone's or tablet's edge */
  buttons: Rect[];
  /** the unit every size above is a fraction of: the screen picture's width */
  u: number;
}

/** The safe edges (CSS px: top, right, bottom, left) of the device each size stands for, upright: an iPhone's island and home bar, an iPad's status bar and home bar, none on a Mac.
 *  The frame passes them to the app (`?safe=`, debug/safe-edges.ts), so its cards and pill keep clear of the camera pill, the home bar and the screen's round corners as on the device. */
export const FRAME_SAFE: Readonly<Record<string, readonly [number, number, number, number]>> = Object.freeze({ mac: [0, 0, 0, 0], iphone: [47, 0, 34, 0], 'ipad-portrait': [24, 0, 20, 0] });

/** The device each size name of the capture frames stands for (the sizes the promotion page offers). */
export const FRAME_KIND: Readonly<Record<string, FrameKind>> = Object.freeze({ mac: 'mac', iphone: 'iphone', 'ipad-portrait': 'ipad' });

const px = (n: number): number => Math.round(n);

/** The picture's layout for a screen picture of sw x sh pixels. */
export function layoutFor(kind: FrameKind, sw: number, sh: number): Layout {
  const u = sw;
  if (kind === 'mac') {
    const bez = 0.0125 * u, chin = 0.0175 * u, lidW = u + 2 * bez, lidH = sh + bez + chin, baseW = lidW * 1.12, baseH = 0.021 * u;
    const mx = 0.1 * u, top = 0.2 * u, bottom = 0.12 * u;
    const w = px(baseW + 2 * mx), h = px(top + lidH + baseH + bottom);
    const lx = (w - lidW) / 2, ly = top;
    return {
      kind, u, w, h,
      body: { x: px(lx), y: px(ly), w: px(lidW), h: px(lidH), r: px(0.022 * u) },
      screen: { x: px(lx + bez), y: px(ly + bez), w: sw, h: sh, r: px(0.006 * u) },
      base: { x: px((w - baseW) / 2), y: px(ly + lidH - 0.001 * u), w: px(baseW), h: px(baseH + 0.001 * u) },
      brand: { x: 0, y: 0, w, h: px(top) },
      camera: { x: px(w / 2 - 0.004 * u), y: px(ly + bez / 2 - 0.0025 * u), w: px(0.008 * u), h: px(0.005 * u), r: px(0.0025 * u) },
      bar: null, buttons: [],
    };
  }
  if (kind === 'iphone') {
    const bez = 0.028 * u, bw = u + 2 * bez, bh = sh + 2 * bez, mx = 0.16 * u, top = 0.3 * u, bottom = 0.12 * u;
    const w = px(bw + 2 * mx), h = px(top + bh + bottom), bx = (w - bw) / 2, by = top, t = 0.008 * u;
    const rail = (yFrac: number, len: number, left: boolean): Rect => ({ x: px(left ? bx - t : bx + bw), y: px(by + yFrac * bh), w: px(t), h: px(len * u) });
    return {
      kind, u, w, h,
      body: { x: px(bx), y: px(by), w: px(bw), h: px(bh), r: px(0.153 * u) },
      screen: { x: px(bx + bez), y: px(by + bez), w: sw, h: sh, r: px(0.125 * u) },
      base: null,
      brand: { x: 0, y: 0, w, h: px(top) },
      camera: { x: px(w / 2 - 0.135 * u), y: px(by + bez + 0.02 * u), w: px(0.27 * u), h: px(0.078 * u), r: px(0.039 * u) },
      bar: { x: px(w / 2 - 0.17 * u), y: px(by + bez + sh - 0.026 * u), w: px(0.34 * u), h: px(0.0075 * u), r: px(0.004 * u) },
      buttons: [rail(0.14, 0.05, true), rail(0.22, 0.09, true), rail(0.31, 0.09, true), rail(0.25, 0.14, false)],
    };
  }
  const bez = 0.036 * u, bw = u + 2 * bez, bh = sh + 2 * bez, mx = 0.12 * u, top = 0.17 * u, bottom = 0.1 * u;
  const w = px(bw + 2 * mx), h = px(top + bh + bottom), bx = (w - bw) / 2, by = top, t = 0.006 * u;
  return {
    kind, u, w, h,
    body: { x: px(bx), y: px(by), w: px(bw), h: px(bh), r: px(0.058 * u) },
    screen: { x: px(bx + bez), y: px(by + bez), w: sw, h: sh, r: px(0.022 * u) },
    base: null,
    brand: { x: 0, y: 0, w, h: px(top) },
    camera: { x: px(w / 2 - 0.004 * u), y: px(by + bez / 2 - 0.004 * u), w: px(0.008 * u), h: px(0.008 * u), r: px(0.004 * u) },
    bar: null,
    buttons: [{ x: px(bx + bw * 0.78), y: px(by - t), w: px(0.05 * u), h: px(t) }],
  };
}

/** What the picture says above the device. `mark` is the logo's picture (null draws the name alone), `family` the name's font family. */
export interface Brand { name: string; mark: CanvasImageSource | null; family: string }

/** A rounded rectangle as the current path (arcs, so every browser draws it alike). */
function roundPath(g: CanvasRenderingContext2D, r: Round, rb: number = r.r): void {
  const { x, y, w, h } = r, a = Math.min(r.r, w / 2, h / 2), b = Math.min(rb, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + a, y); g.lineTo(x + w - a, y); g.arcTo(x + w, y, x + w, y + a, a);
  g.lineTo(x + w, y + h - b); g.arcTo(x + w, y + h, x + w - b, y + h, b);
  g.lineTo(x + b, y + h); g.arcTo(x, y + h, x, y + h - b, b);
  g.lineTo(x, y + a); g.arcTo(x, y, x + a, y, a);
  g.closePath();
}

/** The dark backdrop: a slow diagonal and three soft glows in the logo's own colours. */
function paintBackdrop(g: CanvasRenderingContext2D, w: number, h: number): void {
  const d = g.createLinearGradient(0, 0, w, h);
  d.addColorStop(0, '#12141a'); d.addColorStop(1, '#1b1a2c');
  g.fillStyle = d; g.fillRect(0, 0, w, h);
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    const c = g.createRadialGradient(x, y, 0, x, y, r);
    c.addColorStop(0, `rgba(${rgb},${a})`); c.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = c; g.fillRect(0, 0, w, h);
  };
  const m = Math.max(w, h);
  glow(w * 0.12, h * 0.04, m * 0.62, '79,169,214', 0.2);
  glow(w * 0.9, h * 0.94, m * 0.7, '210,68,138', 0.22);
  glow(w * 0.5, h * 0.5, m * 0.55, '122,134,224', 0.1);
}

/** The logo and the name, side by side, centered in the band. */
function paintBrand(g: CanvasRenderingContext2D, band: Rect, b: Brand): void {
  const size = band.h * 0.36, gap = size * 0.4;
  g.save();
  g.font = `600 ${size * 0.66}px ${b.family}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#f4efee';
  const tw = g.measureText(b.name).width, mw = b.mark ? size : 0, total = mw + (b.mark ? gap : 0) + tw;
  const x0 = band.x + (band.w - total) / 2, cy = band.y + band.h / 2;
  if (b.mark) g.drawImage(b.mark, x0, cy - size / 2, size, size);
  g.fillText(b.name, x0 + mw + (b.mark ? gap : 0), cy + size * 0.03);
  g.restore();
}

/** One finished picture: the backdrop, the brand, the device and the screen. The canvas is `layoutFor(kind, shot's width, shot's height)` in size. */
export function drawComposite(g: CanvasRenderingContext2D, L: Layout, shot: CanvasImageSource, brand: Brand): void {
  const { u, body, screen, base } = L;
  g.clearRect(0, 0, L.w, L.h);
  paintBackdrop(g, L.w, L.h);
  paintBrand(g, L.brand, brand);
  // the device's shadow, then the body
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 0.06 * u; g.shadowOffsetY = 0.025 * u;
  const metal = g.createLinearGradient(body.x, body.y, body.x + body.w, body.y + body.h);
  metal.addColorStop(0, '#3a3d45'); metal.addColorStop(0.5, '#25272d'); metal.addColorStop(1, '#31343b');
  g.fillStyle = metal;
  roundPath(g, body, L.kind === 'mac' ? 0.008 * u : body.r);
  g.fill();
  if (base) {
    const silver = g.createLinearGradient(0, base.y, 0, base.y + base.h);
    silver.addColorStop(0, '#d3d6dc'); silver.addColorStop(1, '#8d919b');
    g.fillStyle = silver;
    roundPath(g, { ...base, r: 0.002 * u }, base.h * 0.9);
    g.fill();
  }
  g.restore();
  // a thin lighter edge, so the bezel reads against the dark ground
  g.save();
  g.lineWidth = Math.max(1, 0.0022 * u); g.strokeStyle = 'rgba(255,255,255,0.2)';
  roundPath(g, body, L.kind === 'mac' ? 0.008 * u : body.r); g.stroke();
  // the buttons after the body, with no shadow of their own and the same light edge: drawn first, the body's shadow fell over them and they all but vanished (promotion e3238988),
  // and the iPad's square top button read as a loose tab
  g.fillStyle = '#3a3d45';
  for (const b of L.buttons) { roundPath(g, { ...b, r: Math.min(b.w, b.h) * 0.45 }); g.fill(); g.stroke(); }
  g.restore();
  if (base) {
    // the thumb notch in the base's top edge
    g.save();
    g.fillStyle = 'rgba(70,74,84,0.55)';
    const nw = 0.16 * u;
    roundPath(g, { x: base.x + (base.w - nw) / 2, y: base.y, w: nw, h: base.h * 0.45, r: 0.002 * u }, base.h * 0.45);
    g.fill();
    g.restore();
  }
  // the screen: black glass under the picture, the picture clipped to its rounded corners
  g.save();
  roundPath(g, screen); g.fillStyle = '#000'; g.fill(); g.clip();
  g.drawImage(shot, screen.x, screen.y, screen.w, screen.h);
  g.restore();
  // what stands over the screen: the camera pill (or dot) and the home bar
  g.save();
  g.fillStyle = '#050506';
  if (L.camera) { roundPath(g, L.camera); g.fill(); }
  if (L.bar) { g.fillStyle = 'rgba(255,255,255,0.55)'; roundPath(g, L.bar); g.fill(); }
  g.restore();
}
