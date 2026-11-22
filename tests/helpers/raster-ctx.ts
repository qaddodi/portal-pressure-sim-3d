// A tiny alpha rasteriser behind the 2D canvas API (the painter's twin in node, where there is no canvas): paths, fills, strokes (round) and clips, accumulated as alpha only.
// It judges COVERAGE (which pixels the painter touches, and how strongly), not colour or antialiasing: enough to compare one painting with another, as the fibrosis tests do.
type Pt = [number, number];
interface St { m: number[]; fa: number; sa: number; fc: number[]; sc: number[]; lw: number; ga: number; clip: Uint8Array | null }

export interface RasterCtx { ctx: CanvasRenderingContext2D; alpha: Float32Array; /** premultiplied colour, 0..255 a channel, 3 per pixel */ rgb: Float32Array; n: number; reset(): void; skipFills(k: number): void }

export function rasterCtx(n: number): RasterCtx {
  const alpha = new Float32Array(n * n), rgb = new Float32Array(n * n * 3);
  let st: St = { m: [1, 0, 0, 1, 0, 0], fa: 1, sa: 1, fc: [0, 0, 0], sc: [0, 0, 0], lw: 1, ga: 1, clip: null };
  const stack: St[] = [];
  let subs: Pt[][] = [], cur: Pt[] | null = null, skip = 0;
  const T = (x: number, y: number): Pt => [st.m[0]! * x + st.m[2]! * y + st.m[4]!, st.m[1]! * x + st.m[3]! * y + st.m[5]!];
  const mul = (b: number[]) => { const a = st.m; st.m = [a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!, a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!, a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!]; };
  const scaleOf = () => Math.sqrt(Math.abs(st.m[0]! * st.m[3]! - st.m[1]! * st.m[2]!));
  const add = (p: Pt) => { (cur ??= (subs.push([]), subs[subs.length - 1]!)).push(p); };
  const arcPts = (cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw: boolean) => {
    let d = a1 - a0; const TAU = Math.PI * 2;
    if (!ccw) { if (d >= TAU) d = TAU; else while (d < 0) d += TAU; } else { if (d <= -TAU) d = -TAU; else while (d > 0) d -= TAU; }
    const k = Math.max(8, Math.ceil(Math.abs(d) / (Math.PI / 24))), c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= k; i++) { const a = a0 + (d * i) / k, x = rx * Math.cos(a), y = ry * Math.sin(a); add(T(cx + x * c - y * s, cy + x * s + y * c)); }
  };
  const winding = (rule: string, mask: Uint8Array) => {
    // scanline at pixel centres: crossings of every edge of every closed sub-path
    for (let y = 0; y < n; y++) {
      const yc = y + 0.5, xs: [number, number][] = [];
      for (const sp of subs) for (let i = 0; i < sp.length; i++) {
        const p = sp[i]!, q = sp[(i + 1) % sp.length]!;
        if ((p[1] <= yc) === (q[1] <= yc)) continue;
        xs.push([p[0] + ((yc - p[1]) / (q[1] - p[1])) * (q[0] - p[0]), q[1] > p[1] ? 1 : -1]);
      }
      xs.sort((a, b) => a[0] - b[0]);
      let w = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        w = rule === 'evenodd' ? w ^ 1 : w + xs[i]![1];
        if (!w) continue;
        const x0 = Math.max(0, Math.ceil(xs[i]![0] - 0.5)), x1 = Math.min(n - 1, Math.ceil(xs[i + 1]![0] - 0.5) - 1);
        for (let x = x0; x <= x1; x++) mask[y * n + x] = 1;
      }
    }
  };
  const paint = (mask: Uint8Array, a: number, col: number[]) => {
    const cl = st.clip;
    for (let i = 0; i < mask.length; i++) if (mask[i] && (!cl || cl[i])) {
      for (let c = 0; c < 3; c++) rgb[3 * i + c] = col[c]! * a + rgb[3 * i + c]! * (1 - a);
      alpha[i] = alpha[i]! + a * (1 - alpha[i]!);
    }
  };
  const base: Record<string, unknown> = {
    canvas: { width: n, height: n },
    save: () => { stack.push({ ...st, m: st.m.slice() }); },
    restore: () => { const s = stack.pop(); if (s) st = s; },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { st.m = [a, b, c, d, e, f]; },
    getTransform: () => ({ a: st.m[0], b: st.m[1], c: st.m[2], d: st.m[3], e: st.m[4], f: st.m[5] }),
    translate: (x: number, y: number) => mul([1, 0, 0, 1, x, y]),
    rotate: (a: number) => mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]),
    scale: (x: number, y: number) => mul([x, 0, 0, y, 0, 0]),
    beginPath: () => { subs = []; cur = null; },
    closePath: () => { cur = null; },
    moveTo: (x: number, y: number) => { subs.push([T(x, y)]); cur = subs[subs.length - 1]!; },
    lineTo: (x: number, y: number) => add(T(x, y)),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => { const p = cur?.[cur.length - 1]; if (!p) { add(T(x, y)); return; } const c = T(cx, cy), q = T(x, y); for (let i = 1; i <= 10; i++) { const t = i / 10; add([(1 - t) ** 2 * p[0] + 2 * (1 - t) * t * c[0] + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * c[1] + t * t * q[1]]); } },
    bezierCurveTo: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => { const p = cur?.[cur.length - 1]; if (!p) { add(T(x, y)); return; } const c1 = T(x1, y1), c2 = T(x2, y2), q = T(x, y); for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; add([u ** 3 * p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * q[0], u ** 3 * p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * q[1]]); } },
    arc: (cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) => { cur = null; subs.push([]); cur = subs[subs.length - 1]!; arcPts(cx, cy, r, r, 0, a0, a1, ccw); },
    ellipse: (cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) => { subs.push([]); cur = subs[subs.length - 1]!; arcPts(cx, cy, rx, ry, rot, a0, a1, ccw); },
    rect: (x: number, y: number, w: number, h: number) => { subs.push([T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)]); cur = null; },
    roundRect: (x: number, y: number, w: number, h: number) => { subs.push([T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)]); cur = null; },
    fillRect: (x: number, y: number, w: number, h: number) => { const keep = subs; subs = [[T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)]]; (base.fill as () => void)(); subs = keep; },
    clearRect: () => { alpha.fill(0); rgb.fill(0); },
    setFillRGBA: (r: number, g: number, b: number, a: number) => { st.fa = a; st.fc = [r, g, b]; },
    setStrokeRGBA: (r: number, g: number, b: number, a: number) => { st.sa = a; st.sc = [r, g, b]; },
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fill: (rule = 'nonzero') => {
      if (skip > 0) { skip--; return; }
      const m = new Uint8Array(n * n); winding(rule as string, m); paint(m, st.fa * st.ga, st.fc);
    },
    clip: (rule = 'nonzero') => {
      const m = new Uint8Array(n * n); winding(rule as string, m);
      if (st.clip) for (let i = 0; i < m.length; i++) m[i] = m[i]! & st.clip[i]!;
      st.clip = m;
    },
    stroke: () => {
      const hw = Math.max(0.5, (st.lw * scaleOf()) / 2), m = new Uint8Array(n * n);
      for (const sp of subs) for (let i = 0; i < Math.max(1, sp.length - 1); i++) {
        const p = sp[i]!, q = sp[i + 1] ?? p;
        const x0 = Math.max(0, Math.floor(Math.min(p[0], q[0]) - hw)), x1 = Math.min(n - 1, Math.ceil(Math.max(p[0], q[0]) + hw));
        const y0 = Math.max(0, Math.floor(Math.min(p[1], q[1]) - hw)), y1 = Math.min(n - 1, Math.ceil(Math.max(p[1], q[1]) + hw));
        const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const t = Math.min(1, Math.max(0, ((x + 0.5 - p[0]) * dx + (y + 0.5 - p[1]) * dy) / L2)), ex = p[0] + t * dx - x - 0.5, ey = p[1] + t * dy - y - 0.5;
          if (ex * ex + ey * ey <= hw * hw) m[y * n + x] = 1;
        }
      }
      paint(m, st.sa * st.ga, st.sc);
    },
  };
  const props = new Set(['lineWidth', 'globalAlpha', 'fillStyle', 'strokeStyle']);
  const ctx = new Proxy(base, {
    get(o, k: string) { if (k === 'lineWidth') return st.lw; if (k === 'globalAlpha') return st.ga; if (k in o) return o[k]; if (props.has(k)) return ''; return () => undefined; },
    set(o, k: string, v) {
      if (k === 'lineWidth') st.lw = v; else if (k === 'globalAlpha') st.ga = v;
      else if (k === 'fillStyle' || k === 'strokeStyle') { const a = /rgba?\(([^)]*)\)/.exec(String(v)), q = a ? a[1]!.split(',').map(Number) : [0, 0, 0], al = q[3] ?? 1; if (k === 'fillStyle') { st.fa = al; st.fc = q.slice(0, 3); } else { st.sa = al; st.sc = q.slice(0, 3); } }
      else o[k] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, alpha, rgb, n, reset: () => { alpha.fill(0); rgb.fill(0); st = { m: [1, 0, 0, 1, 0, 0], fa: 1, sa: 1, fc: [0, 0, 0], sc: [0, 0, 0], lw: 1, ga: 1, clip: null }; stack.length = 0; }, skipFills: (k: number) => { skip = k; } };
}
