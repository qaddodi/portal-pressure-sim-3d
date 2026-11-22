import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FieldMotion, OverlayMotion, type ScopeIn } from '../src/ui/tests/endo/motion.ts';
import { tessellate } from '../src/ui/charts/geometry.ts';
import { scopeFrame } from '../src/ui/tests/endo/frame.ts';
import { bleedShapes } from '../src/ui/tests/endo/bleed.ts';
import { useScope } from '../src/ui/tests/endo/scope-state.ts';
import { ENDO_WORDS } from '../src/ui/tests/copied/endo-words.copied.js';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { BUILT_PANES } from '../src/ui/tests/panes.ts';
import { wallFrame, wallReadings, wallState, wallLabels, WALL_NAMES } from '../src/ui/tests/endo/wall.ts';
import { mottlePatches, netLines, netFade } from '../src/ui/tests/endo/mucosa.ts';
import { readingsOf, scopeOptions } from '../src/ui/tests/endo/readings.ts';
import { createWallGeometry, WALL_LEAST } from '../src/ui/tests/copied/wall-geometry.copied.js';
import { inkRows } from '../src/ui/charts/ink.ts';
import { SCOPE_TOKENS } from '../src/ui/tests/copied/scope-tokens.copied.js';
import { parseColour } from '../src/ui/charts/colour.ts';

const base: ScopeIn = { d: 6, ratio: 0.8, bands: 0, snap: false };
function run(m: FieldMotion, inp: ScopeIn, ms: number) { let t = 1000, busy = true; for (; t < 1000 + ms; t += 50) busy = m.step(inp, t); return busy; }

test('the Endoscopy tab is built and its words are the 2D copy', () => {
  assert.ok(BUILT_PANES.includes('endoscopy'));
  assert.equal(ENDO_WORDS.tiles.grade, 'Grade');
  assert.ok(ENDO_WORDS.views.length === 2);
  const copy = readFileSync(new URL('../scripts/copy-b11-endo.mjs', import.meta.url), 'utf8');
  assert.match(copy, /--check/);
});

test('banding deflates the banded columns and cinches their knuckles, then holds the size it had', () => {
  const m = new FieldMotion();
  run(m, base, 3000);
  assert.ok(m.state.grow > 0, 'a varix of 6 mm shows');
  assert.equal(m.state.kn.every((x) => x === 0), true);
  const grown = m.state.grow;
  run(m, { ...base, bands: 2, d: 3 }, 4000);
  assert.ok(m.state.def[0]! > 0.99 && m.state.def[1]! > 0.99, 'two columns deflated');
  assert.equal(m.state.def[3], 0);
  assert.ok(m.state.kn[0]! > 0.99 && m.state.kn[4]! > 0.99, 'two bands cinched');
  assert.ok(m.state.grow >= grown * 0.99, 'the peak size is held while banded');
  m.reset();
  run(m, base, 50);
  assert.equal(m.state.kn.every((x) => x === 0), true);
});

test('a band added eases in: its knuckle rises over the beats that follow, never from nothing to whole in one step (the scope view of the EVL slides)', () => {
  const m = new FieldMotion();
  run(m, base, 3000);
  let t = 5000;
  const one = { ...base, bands: 1 };
  m.step(one, t); t += 50;
  assert.ok(m.state.kn[0]! < 0.2, 'the first beat after the band has barely started');
  const seen: number[] = [];
  for (let i = 0; i < 80; i++) { m.step(one, t); t += 50; seen.push(m.state.kn[0]!); }
  assert.ok(seen.some((x) => x > 0.2 && x < 0.8), 'it passes through the middle');
  assert.ok(seen.every((x, i) => i === 0 || x >= seen[i - 1]! - 1e-9), 'and only rises');
  assert.ok(seen.every((x, i) => i === 0 || x - seen[i - 1]! < 0.5), 'no single beat jumps it');
  assert.ok(seen.at(-1)! > 0.99, 'it ends whole');
});

test('the scope frame is whole: the clips balance and the bleed adds to it', () => {
  const pal = paletteOf('light');
  const m = new FieldMotion();
  run(m, base, 3000);
  const plain = scopeFrame({ field: m.state, over: { balloon: 0, jet: 0, pool: 0, seconds: 1, tearGrow: m.state.g } }, 300, pal);
  const depth = (f: typeof plain) => { let d = 0; for (const s of f.shapes) { if (s.k === 'clip') d++; if (s.k === 'unclip') d--; assert.ok(d >= 0); } return d; };
  assert.equal(depth(plain), 0);
  assert.equal(plain.w, 300);
  const b = new FieldMotion();
  run(b, { ...base, bands: 4 }, 4000);
  const banded = scopeFrame({ field: b.state, over: { balloon: 0, jet: 0, pool: 0, seconds: 1, tearGrow: b.state.g } }, 300, pal);
  assert.equal(depth(banded), 0);
  const bleed = scopeFrame({ field: m.state, over: { balloon: 0, jet: 1, pool: 0.5, rate: 80, hr: 100, seconds: 1, tearGrow: m.state.g } }, 300, pal);
  assert.equal(depth(bleed), 0);
  assert.ok(bleed.shapes.length > plain.shapes.length, 'the bleed is drawn');
});

test('no bleed is drawn when it has eased out; the overlays ease in and land at once under Reduce Motion', () => {
  assert.equal(bleedShapes({ cx: 100, cy: 100, R: 96, jx: 100, jy: 100, t: 1, a: 0, rate: 50, fill: 0, hr: 80 }).length, 0);
  const o = new OverlayMotion();
  o.step(1000, { balloon: true, shut: false, bleedNow: false, total: 0, still: true });
  assert.equal(o.bal, 1);
  const e = new OverlayMotion();
  e.step(1000, { balloon: true, shut: false, bleedNow: false, total: 0, still: false });
  e.step(1050, { balloon: true, shut: false, bleedNow: false, total: 0, still: false });
  assert.ok(e.bal > 0 && e.bal < 1);
});

test('the scope store tells the scene devices what the tab is doing', () => {
  const s = useScope.getState();
  s.setActive(true); s.setBands(3); s.setEus('run', 2);
  const n = useScope.getState();
  assert.deepEqual([n.active, n.bands, n.eus, n.step], [true, 3, 'run', 2]);
  s.setActive(false); s.setEus('idle');
  assert.equal(useScope.getState().eus, 'idle');
  assert.equal(useScope.getState().step, -1);
});

// ── Wall mechanics (the second view) ──
const VARIX = { r: 3.2, w: 0.45, ptm: 17, ratio: 0.8, ratioMean: 0.8, ratioShown: 0.8 };
const wallAt = (size: number, v = VARIX, share = 0.8, look: 'light' | 'dark' = 'light') => wallFrame({ v, pVar: 18, share }, size, 13, paletteOf(look), look, createWallGeometry());

test('Wall mechanics is built: the stub is gone and its layout, words and rules are the 2D copies', () => {
  const view = readFileSync(new URL('../src/ui/tests/endo/WallView.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /not in the 3D app yet/);
  const copy = readFileSync(new URL('../scripts/copy-b11-endo.mjs', import.meta.url), 'utf8');
  assert.ok(copy.includes('wall-geometry.copied.js'), 'the copy script makes wall-geometry.copied.js');
  assert.equal(readFileSync(new URL('../src/ui/tests/copied/wall-geometry.copied.js', import.meta.url), 'utf8').includes("from './num.copied.js'"), true);
  assert.deepEqual([...WALL_NAMES], ['r', 'σ', 'w', 'lumen', 'muscle']);
  // the tiles' rules are the 2D stylesheet's own, reached by 2D's own markup: no re-scoped copy, no class of ours
  assert.ok(!existsSync(new URL('../src/ui/tests/endo/wall.copied.css', import.meta.url)), 'the re-scoped copy of the tiles\' rules is gone');
  assert.match(view, /className=\{`\$\{host\.view\} wall-view`\} data-pane="varixwall"/);
  assert.match(view, /chart-box square wall-box/);
  assert.doesNotMatch(view, /en-wall|en-view|en-stage|en-pic|en-side/);
});

test('the names are set by their ink: the glyph atlas gives a word its own box', () => {
  const lumen = inkRows('lumen', 13, 500), r = inkRows('r', 13, 600);
  const span = (rows: ReturnType<typeof inkRows>, k: 2 | 3) => rows.map((x) => x[k]);
  const widthOf = (rows: ReturnType<typeof inkRows>) => Math.max(...span(rows, 3)) - Math.min(...span(rows, 2));
  assert.ok(widthOf(lumen) > 25 && widthOf(lumen) < 45, 'five letters about 3 em wide');
  assert.ok(widthOf(r) > 3 && widthOf(r) < 9);
  // centred on the anchor, and the l stands higher than the e's x-height
  assert.ok(Math.abs((Math.max(...span(lumen, 3)) + Math.min(...span(lumen, 2))) / 2) < 1.5);
  assert.ok(Math.min(...lumen.map((x) => x[0])) < Math.min(...r.map((x) => x[0])) - 1);
  assert.equal(inkRows('lumen', 13, 500), lumen, 'kept: a layout asks again and again');
});

test('the cross-section lays out whole at every card size: each name clear of its neighbours, as 2D keeps them', () => {
  for (const size of [150, 200, 300, 420]) {
    const f = wallAt(size);
    const words = f.frame.shapes.filter((x) => x.k === 'text').map((x) => (x.k === 'text' ? x.s : ''));
    const named = wallLabels(f.drawn).split(',');
    assert.deepEqual(words, ['r', 'σ', 'w', 'lumen', 'muscle'].filter((n) => named.includes(n)).map((n) => n), 'one word for each name drawn, in the picture\'s own order');
    assert.ok(f.drawn & 2 && f.drawn & 4 && f.drawn & 8 && f.drawn & 16, `σ, w, lumen and muscle are drawn at ${size}`);
    const gaps = f.gaps as Record<string, Record<string, number> | undefined>;
    for (const [n, least] of Object.entries(WALL_LEAST as Record<string, Record<string, number>>)) {
      if (!gaps[n]) continue;
      for (const [k, v] of Object.entries(least)) assert.ok(gaps[n]![k]! >= v, `${n} keeps ${k} ${v} px at ${size}: ${gaps[n]![k]}`);
    }
    const clip = f.frame.shapes.filter((x) => x.k === 'clip').length;
    assert.equal(clip, 0);
    // eight ΔP arrows, two stress arcs and the radius' dashes
    assert.equal(f.frame.shapes.filter((x) => x.k === 'line' && !x.pen.dash && x.pen.w === Math.max(1.25, (gaps.picture as unknown as { R: number }).R / 140)).length, 8);
    assert.ok(f.frame.shapes.some((x) => x.k === 'line' && x.pen.dash));
  }
});

test('the rim and arcs take the stress meter colour, the varix the pressure colour, and the arcs thicken with the stress', () => {
  assert.deepEqual([0.2, 0.5, 0.8, 1.2].map(wallState), ['ok', 'caution', 'danger', 'critical']);
  const rimOf = (share: number) => { const f = wallAt(300, VARIX, share), c = f.frame.shapes.find((x) => x.k === 'circle' && x.fill && x.pen && x.pen.w > 1.5 && x.r < 100); assert.ok(c && c.k === 'circle'); return c.pen!.color; };
  const pal = paletteOf('light');
  assert.deepEqual(rimOf(0.2), pal.tok('ok'));
  assert.deepEqual(rimOf(0.8), pal.tok('danger'));
  assert.deepEqual(rimOf(1.3), pal.tok('critical'));
  const arcW = (ratio: number) => { const f = wallAt(300, { ...VARIX, ratio }); return Math.max(...f.frame.shapes.filter((x) => x.k === 'path' && !x.closed && x.pen).map((x) => (x.k === 'path' ? x.pen!.w : 0))); };
  assert.ok(arcW(1.2) > arcW(0.1));
  assert.ok(arcW(5) <= 4 && arcW(0) >= 1.25);
  // a longer ΔP arrow for a higher ΔP
  const reach = (ptm: number) => { const g = createWallGeometry(); return (g.place(300, 300, 13, { T: inkRows('σ', 13, 600), R: inkRows('r', 13, 600), W: inkRows('w', 13, 600), L: inkRows('lumen', 13, 500), M: inkRows('muscle', 13, 500) }, { ...VARIX, ptm }) as { len: number }).len; };
  assert.ok(reach(25) > reach(5));
});

test('the tiles multiply out and the stress says what it is, as 2D prints them', () => {
  const r = wallReadings(VARIX);
  assert.equal(r.index, String(Math.round(+r.ptm * +r.r / +r.w)));
  assert.deepEqual([r.ptm, r.r, r.w], ['17.0', '3.20', '0.450']);
  assert.equal(r.stress, '80% of the rupture threshold');
  assert.equal(r.state, 'danger');
  assert.equal(r.fill, '-20% 0px');
  const hi = wallReadings({ ...VARIX, ratioMean: 1.4 });
  assert.equal(hi.stress, 'above the rupture threshold');
  assert.equal(hi.state, 'critical');
  assert.equal(hi.fill, '0% 0px');
  assert.equal(wallReadings(VARIX, 0.3).state, 'ok', 'a slide pins the figure it shows');
});

// ── the mucosa's own texture ──
test('the mucosal mottling is both lighter and darker than the wall, and stays inside the lumen', () => {
  const p = mottlePatches();
  assert.ok(p.length > 200 && p.some((x) => x.d > 0) && p.some((x) => x.d < 0));
  assert.ok(p.every((x) => x.z >= 0.66 && x.z <= 5.9 && Math.abs(x.d) < 0.1));
  assert.equal(mottlePatches(), p, 'made once');
});

test('the fine vessel net is a set of thin lines along the wall, faded in from the lens and lost with depth', () => {
  const n = netLines();
  assert.ok(n.length > 100);
  assert.ok(n.some((l) => l.weight === 0.16) && n.some((l) => l.weight === 0.1), 'both of the shader\'s ridges');
  assert.ok(n.every((l) => l.pts.length >= 4 && l.pts.length / 2 <= 12 && netFade(l.z) > 0));
  assert.equal(netFade(0.4), 0);
  assert.equal(netFade(5), 0);
  assert.ok(netFade(1) > netFade(3.5));
  const thickest = Math.max(...n.map((l) => l.pts.length));
  assert.ok(thickest <= 24);
});

// ── a slide's options for the scope ──
test('a slide\'s air, red and readings change what the tiles print, as 2D configure does', () => {
  assert.deepEqual(scopeOptions({ air: 10, red: false, readings: true }), { air: 10, red: false, readings: true });
  assert.deepEqual(scopeOptions({ air: 99 }), { air: 20, red: null, readings: false });
  assert.deepEqual(scopeOptions(null), { air: 0, red: null, readings: false });
  const frame = { bands: 0, metrics: { varix: { present: true, grade: { label: 'Large' }, d: 6, w: 0.4, ptm: 18, air: undefined, redWale: true } } };
  const base0 = readingsOf(frame)!;
  assert.equal(base0.redOn, true);
  assert.deepEqual(base0.pressures, ['18.0 mmHg', '0.0 mmHg', '18.0 mmHg']);
  const air = readingsOf(frame, { air: 10, red: false, readings: true })!;
  assert.equal(air.redOn, false, 'red false hides the stigmata whatever the wall stress');
  assert.deepEqual(air.pressures, ['18.0 mmHg', '10.0 mmHg', '8.0 mmHg'], 'transmural = intravariceal − intraluminal');
  assert.equal(ENDO_WORDS.pressures.length, 3);
});

test('the field is the 2D shader, per pixel, under the frame: the frame carries only what goes over it (balloon, bleed, bezel), and the shader has its colours, state and origin', async () => {
  const { endoShaderSource } = await import('../src/ui/tests/endo/endo-under.ts');
  const pal = paletteOf('light');
  const m = new FieldMotion();
  run(m, { ...base, bands: 2 }, 4000);
  const f = scopeFrame({ field: m.state, over: { balloon: 0, jet: 0, pool: 0, seconds: 1, tearGrow: m.state.g } }, 300, pal);
  assert.ok(f.shapes.every((s) => s.k === 'clip' || s.k === 'unclip' || s.k === 'circle'), 'no stepped wall, column or knuckle is drawn from shapes any more');
  const src = endoShaderSource();
  assert.ok(src.startsWith('#version 300 es') && !src.includes('${') && !src.includes('gl_FragColor'));
  for (const u of ['uSize', 'uOrigin', 'uGrow', 'uVis', 'uRed', 'uC0', 'uC1', 'uDef', 'uKn']) assert.ok(src.includes(`uniform`) && src.includes(u), u);
  // the colours of the 2D tokens are written in (the mucosa's pale salmon)
  const mucosa = parseColour(SCOPE_TOKENS['endo-mucosa']);
  assert.ok(src.includes(`vec3(${(mucosa[0] * 255).toFixed(1)}, ${(mucosa[1] * 255).toFixed(1)}, ${(mucosa[2] * 255).toFixed(1)})`));
});

test('the field draws under the chart: one full-field triangle in a viewport that is the lumen\'s square, the state in its uniforms, and the drawer\'s state put back', async () => {
  const { endoUnder } = await import('../src/ui/tests/endo/endo-under.ts');
  const calls: string[] = [];
  const uni: Record<string, unknown> = {};
  const gl = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => {
      if (k === 'COMPILE_STATUS' || k === 'LINK_STATUS') return k;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (/^[A-Z_0-9]+$/.test(k)) return k;
      if (k.startsWith('uniform')) return (loc: string, ...v: unknown[]) => { uni[loc] = v.length === 1 ? v[0] : v; calls.push(k); };
      if (k === 'getUniformLocation') return (_p: unknown, n: string) => n;
      if (k === 'viewport') return (...a: number[]) => calls.push(`viewport ${a.join(',')}`);
      if (k === 'drawArrays') return (...a: number[]) => calls.push(`draw ${a.join(',')}`);
      return () => ({});
    },
  }) as unknown as WebGL2RenderingContext;
  const m = new FieldMotion();
  run(m, base, 3000);
  const under = endoUnder(() => ({ st: m.state, size: 300 }));
  under(gl, 600, 600, 1);
  assert.ok(calls.includes('draw TRIANGLES,0,3'));
  assert.ok(calls.includes('viewport 8,8,584,584'), 'the lumen\'s square: the box less 4 CSS px each side, at two device px to a CSS px');
  assert.equal(uni.uSize, 584);
  assert.equal(uni.uGrow, m.state.grow);
  assert.equal(calls[calls.length - 1], 'viewport 0,0,600,600', 'the drawer\'s viewport is put back');
});
