// The cameras and the organ names on the APPROVED placement (docs/approved/anatomy-placement.md; anatomy integration plan section 3.5 and 3.6, check 9): with the switch on
// (PPS_ANATOMY=placed, set here before anything is loaded), every camera region, every named shot and every slide camera of every talk frames its subject where the placement puts it:
// the subject's placed bounds lie inside the shot's half extents round its target, the target is at the subject's depth, and the shot is not empty space (most of it shows anatomy).
// The organ names stand inside (or beside) their placed organs. Node only: the bounds are the placement's own data (art/anatomy-placement, placement.generated.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.PPS_ANATOMY = 'placed';
const root = fileURLToPath(new URL('..', import.meta.url));
const src = await import('../src/scene/anatomy/source.ts');
const { SHOTS, SHOT_SUBJECTS, viewReach } = await import('../src/scene/camera/shots.ts');
const hp = await import('../src/decks/hp/cams.ts');
const rw = await import('../src/decks/rw/cams.ts');
const ag = await import('../src/decks/ag/shots.ts');
const { HP_IDS, loadHpDeck } = await import('../src/decks/hp/index.ts');
const { AG_IDS, loadAgDeck } = await import('../src/decks/ag/index.ts');
const { DECKS } = await import('../src/decks/rw/copied/all.ts');
const { RW_IDS } = await import('../src/decks/rw/copied/index.ts');
const { STATIONS } = await import('../src/scene/labels/stations.ts');
const { placedNameSpots } = await import('../src/scene/labels/organ2d/placed-spots.ts');
type Box3 = readonly [number, number, number, number, number, number];
type Shot = typeof SHOTS.play;

test('the switch is on: the source holds the approved placement', () => { assert.equal(src.ANATOMY_ID, 'placed'); assert.equal(src.PLACED, true); });

test('the measured organs (placed-organs.generated.ts) are the placement\'s own: the generator would write the same file', () => {
  execFileSync(process.execPath, [`${root}scripts/gen-placed-organs.mjs`, '--check'], { stdio: 'pipe' });
});

// ---- anatomy as points: every placed organ vertex, the gut's tubes, every vessel a healthy figure draws (what "not empty space" is measured against) ----
const A = JSON.parse(readFileSync(`${root}art/anatomy-placement/organsA.json`, 'utf8')) as Record<string, number[]>;
const anatomy: [number, number][] = [];
for (const flat of Object.values(A)) for (let i = 0; i < flat.length; i += 9) anatomy.push([flat[i]!, flat[i + 1]!]);
const { PLACED_GUT, PLACED_COURSES, PLACED_VESSELS } = await import('../src/scene/anatomy/placement.generated.ts');
for (const line of [PLACED_GUT.upper, PLACED_GUT.colon, PLACED_GUT.pack, PLACED_GUT.ileum] as (readonly (readonly number[])[])[]) for (const p of line) for (let k = 0; k < 8; k++) anatomy.push([p[0]! + p[3]! * Math.cos(k), p[1]! + p[3]! * Math.sin(k)]);
for (const [k, c] of Object.entries(PLACED_COURSES)) if (!PLACED_VESSELS[k]?.aOnly) for (let i = 1; i < c.length; i++) for (let u = 0; u < 1; u += 0.1) anatomy.push([c[i - 1]![0] + (c[i]![0] - c[i - 1]![0]) * u, c[i - 1]![1] + (c[i]![1] - c[i - 1]![1]) * u]);
/** The share of a face-on shot's room (a 10 by 10 grid over its half extents round its target) that holds any anatomy. */
function filled(s: Shot): number {
  const N = 10, hit = new Set<number>();
  for (const [x, y] of anatomy) {
    const i = Math.floor(((x - s.target[0]) / s.half[0] + 1) / 2 * N), j = Math.floor(((y - s.target[1]) / s.half[1] + 1) / 2 * N);
    if (i >= 0 && j >= 0 && i < N && j < N) hit.add(j * N + i);
  }
  return hit.size / (N * N);
}
/** Least share of a shot's room that is anatomy: a shot that is mostly empty space frames nothing. */
const FILLED = 0.4;
const EPS = 1e-9;

/** The subject's placed bounds inside the shot's half extents round its target (in the view plane, for its turn and tilt), its depth the shot's, and the shot not empty space. */
function framesSubject(what: string, s: Shot, subject: Box3 | null): void {
  assert.ok(subject, `${what}: names nothing placed`);
  const [rx, ry] = viewReach(subject, s);
  assert.ok(rx <= s.half[0] + EPS && ry <= s.half[1] + EPS, `${what}: the subject reaches ${rx.toFixed(3)}, ${ry.toFixed(3)} from the target, past the shot's half extents ${s.half.map((h) => h.toFixed(3)).join(', ')}`);
  assert.ok(s.target[2] >= subject[2] - EPS && s.target[2] <= subject[5] + EPS, `${what}: the target's depth ${s.target[2].toFixed(3)} is outside its subject (${subject[2].toFixed(3)} to ${subject[5].toFixed(3)})`);
  const f = filled(s);
  assert.ok(f >= FILLED, `${what}: only ${(f * 100).toFixed(0)} % of the shot shows anatomy`);
}

/** What a slide camera names, as placed names (the same reading the cameras make): the region subjects, a raw box's subject, an `{ on }` list, or the whole figure. */
function subjectOf(cam: unknown): Box3 | null {
  const names = (c: unknown): string[] => {
    if (c == null || c === 'fit') return [...src.FIGURE_NAMES];
    if (typeof c === 'string') return [...src.REGION_SUBJECTS[c]!];
    if (Array.isArray(c) && c.length === 4 && c.every((n) => typeof n === 'number')) return src.subjectOfBox2(c as unknown as readonly [number, number, number, number], src.HIDDEN_EDGES);
    if (Array.isArray(c)) return c.flatMap((r) => [...src.REGION_SUBJECTS[r as string]!]);
    const o = c as { on: string[]; near?: string };
    return [...rw.namesPlaced(o.on).names, ...(o.near ? src.REGION_SUBJECTS[o.near]! : [])];
  };
  const n = names(cam);
  const { box, unknown } = src.boxOfNames(n);
  assert.deepEqual(unknown, [], `camera ${JSON.stringify(cam)}: no placed ${unknown.join(', ')}`);
  return box;
}

test('every camera region is a list of names the placement knows, the same sixteen regions every deck family names', () => {
  assert.deepEqual(Object.keys(src.REGION_SUBJECTS).sort(), Object.keys(src.REGIONS_2D).sort());
  assert.deepEqual(Object.keys(src.REGIONS_HP).sort(), Object.keys(src.REGIONS_2D).sort());
  for (const [r, names] of Object.entries(src.REGION_SUBJECTS)) assert.deepEqual(src.boxOfNames(names).unknown, [], `region ${r}`);
});

test('every region frames its placed subject in all three deck families (inside the shot, at its depth, not empty space)', () => {
  for (const r of Object.keys(src.REGION_SUBJECTS)) {
    const subject = src.boxOfNames(src.REGION_SUBJECTS[r]!).box;
    const h = hp.camPlan(r);
    assert.equal(h.kind, 'body');
    framesSubject(`hp ${r}`, (h as { shot: Shot }).shot, subject);
    const p = rw.place(r);
    assert.equal(p.view, 'body');
    framesSubject(`rw ${r}`, (p as { shot: Shot }).shot, subject);
    const a = ag.shotOfCam(r);
    assert.equal(a.kind, 'body');
    framesSubject(`ag ${r}`, (a as { shot: Shot }).shot, subject);
  }
});

test('the seven named shots keep their turn, tilt and nearest distance and frame their placed subjects', () => {
  const was = (JSON.parse(readFileSync(`${root}tests/fixtures/anatomy-today.json`, 'utf8')) as { items: Record<string, Shot> }).items;   // (today's shots, frozen)
  for (const [k, s] of Object.entries(SHOTS) as [keyof typeof SHOTS, Shot][]) {
    const w = was[`shot:${k}`]!;
    assert.equal(s.yaw, w.yaw); assert.equal(s.pitch, w.pitch);
    assert.ok(Math.abs(s.r - w.r) < 1e-3, `${k}: the nearest distance is the shot's own`);
    assert.ok(s.half[0] >= w.half[0] - 1e-3 && s.half[1] >= w.half[1] - 1e-3, `${k}: the room only grows where the subject needs it`);
    framesSubject(`shot ${k}`, s, src.boxOfNames(SHOT_SUBJECTS[k]).box);
  }
});

// ---- every slide camera of every talk ----
interface Slide { id?: string; cam?: unknown; view?: unknown; lapse?: { cam?: unknown } | null; scales?: Record<string, { cam?: unknown } | null> | null; zone?: unknown; visual?: unknown }
const isLobule = (c: unknown) => typeof c === 'string' && /^(lobule|sinusoid)/.test(c);
const cams = (s: Slide): unknown[] => {
  const out: unknown[] = [];
  if (s.view !== 'circuit') out.push(s.cam);
  if (s.lapse?.cam != null && s.view !== 'circuit') out.push(s.lapse.cam);
  for (const [k, v] of Object.entries(s.scales ?? {})) if (k !== 'lobule' && k !== 'sinusoid') out.push(v?.cam);
  return out.filter((c) => !isLobule(c));
};

test('every slide camera of every talk frames its named subject where the placement puts it', async () => {
  let n = 0;
  const hpDecks = await Promise.all(HP_IDS.map((id: string) => loadHpDeck(id)));
  for (const d of hpDecks) for (const s of d.slides as Slide[]) for (const c of cams(s)) {
    const plan = hp.camPlan((c ?? undefined) as never);   // (no camera: the 2D presenter's default region)
    assert.equal(plan.kind, 'body');
    framesSubject(`${d.id}/${s.id} ${JSON.stringify(c)}`, (plan as { shot: Shot }).shot, subjectOf(c ?? hp.DEFAULT_CAM));
    n++;
  }
  for (const id of RW_IDS as readonly string[]) for (const s of DECKS[id]!.slides as Slide[]) for (const c of cams(s)) {
    const p = rw.place(c as never);
    assert.equal(p.view, 'body');
    if (p.view === 'body' && p.fit) { assert.equal(p.shot, SHOTS.play); framesSubject(`${id}/${s.id} fit`, p.shot, subjectOf('fit')); }
    else framesSubject(`${id}/${s.id} ${JSON.stringify(c)}`, (p as { shot: Shot }).shot, subjectOf(c));
    n++;
  }
  const agDecks = await Promise.all((AG_IDS as readonly string[]).map((id) => loadAgDeck(id as never)));
  for (const d of agDecks) for (const s of d.slides as Slide[]) for (const c of cams(s)) {
    const spec = ag.shotOfCam(c);
    assert.equal(spec.kind, 'body');
    framesSubject(`${d.id}/${s.id} ${JSON.stringify(c)}`, (spec as { shot: Shot }).shot, subjectOf(c));
    n++;
  }
  assert.ok(n > 470, `only ${n} slide cameras read`);
});

test('a slide plan still carries its box, in the 2D figure\'s units, round the placed subject', () => {
  const p = hp.camPlan('liver') as { box: readonly number[]; shot: Shot };
  const b = src.PLACED_ORGAN_BOX.liver!;
  assert.ok(p.box[0] <= b[0] * 300 + 700 && p.box[2] >= b[3] * 300 + 700 && p.box[1] <= 556 - b[4] * 300 && p.box[3] >= 556 - b[1] * 300);
});

// ---- the organ names ----
const inRing = (x: number, y: number, P: readonly (readonly [number, number])[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i]![1] > y) !== (P[j]![1] > y) && x < ((P[j]![0] - P[i]![0]) * (y - P[i]![1])) / (P[j]![1] - P[i]![1]) + P[i]![0]) c = !c; return c; };
test('every organ name stands on its placed organ (inside its front silhouette, or beside it where the 2D name stands beside), with spots to step to', async () => {
  const { NAME_ORGAN } = await import('../src/scene/labels/organ2d/organ-names.copied.js' as string) as { NAME_ORGAN: Record<string, string> };
  const BESIDE = new Set(['Spleen', 'Kidney', 'Esophagus']);
  for (const [word, at] of Object.entries(src.PLACED_ORGAN_NAMES)) {
    const rings = src.PLACED_ORGAN_RINGS[NAME_ORGAN[word]!]!;
    const inside = rings.reduce((n, r) => n + (inRing(at[0], at[1], r) ? 1 : 0), 0) % 2 === 1;
    assert.equal(inside, !BESIDE.has(word), `${word} at ${at[0]}, ${at[1]}`);
    assert.ok(placedNameSpots(word).length >= 4, `${word}: spots to step to`);
    const st = STATIONS.find((s) => s.kind === 'organ' && s.name === word)!;
    assert.deepEqual(st.at2d, [at[0], at[1]], `${word}: the station stands at the placed anchor`);
    const p = st.at(0, { set(x: number, y: number, z: number) { return [x, y, z]; } } as never) as unknown as number[];
    assert.ok(Math.abs(p[2]! - at[2]) < 1e-9, `${word}: on its organ's front face`);
  }
});

test('the point stations stand on the placed vessels that meet there', () => {
  const near = (p: readonly number[], id: string) => Math.min(...src.placedEdge(id)!.map((q) => Math.hypot(q[0] - p[0]!, q[1] - p[1]!, q[2] - p[2]!)));
  const at = (id: string) => STATIONS.find((s) => s.id === id)!.at(0, { set(x: number, y: number, z: number) { return [x, y, z]; } } as never) as unknown as number[];
  assert.ok(near(at('RA'), 'IVCS_RA') < 0.06, 'RA on the cava\'s end');
  assert.ok(near(at('VAR'), 'C1a') < 0.02, 'the varices on C1a');
  assert.ok(near(at('GV'), 'C2') < 0.02, 'the fundal varices on C2');
});

// ---- the frame on the screen: every body slide of every talk, in the room the cards leave (24 Nov 2026, the Circulation talk on an iPhone 440 x 736: the route slides drew the liver small,
// and the portal vein and the gut ran under the story card, because the route frame held the whole of the neck's vein V_UP, which today's box only touches) ----
const { planLayout } = await import('../src/ui/layout/plan.ts');
const { effectiveDistance, FILL } = await import('../src/scene/camera/room.ts');
const { FOV, viewAxes: axes } = await import('../src/scene/camera/shots.ts');
const { slideFrames } = await import('./anatomy/slide-frames.ts');
type Frame = Awaited<ReturnType<typeof slideFrames>>[string];
type Rect = { x: number; y: number; w: number; h: number };
/** The free room between the cards on the screens the framing knows (layout/plan.ts, with a data card and a story card of typical height): iPhone and iPad upright, iPad on its side, Mac. */
const SCREENS = ([['iPhone', 440, 736, 240, 250], ['iPad', 820, 1180, 300, 300], ['iPad sideways', 1180, 820, 300, 300], ['Mac', 1440, 900, 300, 320]] as const).map(([name, w, h, data, words]) => {
  const plan = planLayout({ w, h, safe: { top: 0, bottom: 0, left: 0, right: 0 } }, [{ id: 'teach', slot: 'words', h: words }, { id: 'ladder', slot: 'data', h: data }]);
  return { name, w, h, room: plan.free as Rect };
});
/** Where a shot draws a box on the screen (the rig's camera: the shot's distance for the room, its turn and tilt, the picture's middle at the room's middle), and its zoom (px per scene unit at the target). */
function onScreen(f: Pick<Frame, 'shot'>, b: Box3, s: (typeof SCREENS)[number]) {
  const sh = f.shot as Shot, d = effectiveDistance(sh, s.room, s.h, s.w), px = s.h / (2 * Math.tan((FOV * Math.PI) / 360));
  const { right, up } = axes(sh.yaw, sh.pitch), back = [Math.sin(sh.yaw) * Math.cos(sh.pitch), Math.sin(sh.pitch), Math.cos(sh.yaw) * Math.cos(sh.pitch)];
  const cx = s.room.x + s.room.w / 2, cy = s.room.y + s.room.h / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
    const q = [x - sh.target[0], y - sh.target[1], z - sh.target[2]], dot = (a: readonly number[]) => q[0]! * a[0]! + q[1]! * a[1]! + q[2]! * a[2]!, k = px / (d - dot(back));
    x0 = Math.min(x0, cx + dot(right) * k); x1 = Math.max(x1, cx + dot(right) * k); y0 = Math.min(y0, cy - dot(up) * k); y1 = Math.max(y1, cy - dot(up) * k);
  }
  return { x0, y0, x1, y1, zoom: px / d, cx, cy };
}
/** Least zoom a placed slide keeps of today's on the same screen (the body drawn as big as today's, within 5 %), unless its named subject needs the room. */
const KEEP_ZOOM = 0.95;
// (the 2D figure's frames, frozen at the cut-over from its last default commit f17b151a: `PPS_ANATOMY=today node tests/anatomy/slide-frames.ts` there)
const todayFrames = JSON.parse(readFileSync(`${root}tests/fixtures/slide-frames-today.json`, 'utf8')) as Record<string, Frame>;
const placedFrames = await slideFrames();

test('every region names only what today\'s region box shows at least half of (a vessel the box only touches pulls the frame away from the subject)', () => {
  const X = (x: number) => (x - 700) / 300, Y = (y: number) => -(y - 556) / 300;
  for (const [r, names] of Object.entries(src.REGION_SUBJECTS)) {
    const b = src.REGIONS_2D[r]!;
    for (const n of names) {
      const t = src.todayBoxOfName(n);
      if (!t) continue;   // (a name only the placement has: the gastro-oesophageal junction, the rectum)
      const share = (lo: number, hi: number, a: number, c: number) => (hi - lo < 1e-6 ? (lo >= a && lo <= c ? 1 : 0) : Math.max(0, Math.min(hi, c) - Math.max(lo, a)) / (hi - lo));
      const s = share(t[0], t[3], X(b[0]), X(b[2])) * share(t[1], t[4], Y(b[3]), Y(b[1]));
      assert.ok(s >= 0.5, `region ${r}: today's box shows only ${(s * 100).toFixed(0)} % of ${n}`);
    }
  }
});

test('every body slide of every talk draws its named subject inside the free room between the cards, at today\'s zoom or as close as the subject allows (iPhone, iPad, Mac)', () => {
  assert.deepEqual(Object.keys(placedFrames).sort(), Object.keys(todayFrames).sort());
  const circ = SCREENS[0]!.room;
  assert.ok(circ.y > 240 && circ.y + circ.h < 490, `the iPhone's room is the one the owner saw (${JSON.stringify(circ)})`);
  let n = 0;
  for (const [k, p] of Object.entries(placedFrames)) for (const s of SCREENS) {
    const t = todayFrames[k]!, P = onScreen(p, p.subject, s), T = onScreen(t, t.subject, s), r = s.room;
    const at = `${k} ${p.cam} on the ${s.name}`;
    assert.ok(P.x0 >= r.x - 0.5 && P.y0 >= r.y - 0.5 && P.x1 <= r.x + r.w + 0.5 && P.y1 <= r.y + r.h + 0.5,
      `${at}: the subject is drawn at x ${P.x0.toFixed(0)} to ${P.x1.toFixed(0)}, y ${P.y0.toFixed(0)} to ${P.y1.toFixed(0)}, past the room ${JSON.stringify(r)}`);
    if (P.zoom < KEEP_ZOOM * T.zoom) {
      // drawn smaller than today: only where the subject would not fit at today's zoom (where it stands in the frame)
      const g = T.zoom / P.zoom, mx = (r.w * FILL) / 2, my = (r.h * FILL) / 2;
      const over = Math.max((P.cx - P.x0) * g - mx, (P.x1 - P.cx) * g - mx, (P.cy - P.y0) * g - my, (P.y1 - P.cy) * g - my);
      assert.ok(over > 0, `${at}: the body is drawn at ${(100 * P.zoom / T.zoom).toFixed(0)} % of today's size, though its subject would fit at today's`);
    }
    n++;
  }
  assert.ok(n > 4 * 450, `only ${n} slide frames read`);
});

test('the Circulation talk\'s anatomy slides on the iPhone frame the liver, the portal vein and the hepatic veins as today does, with the portal vein clear of the story card', () => {
  const s = SCREENS[0]!;
  for (const i of [3, 6, 7, 8, 9]) {   // (the owner's stops 04, 07, 08, 09 and 10: stop 01 is the title)
    const k = `circulation/${i}`, p = placedFrames[k]!, t = todayFrames[k]!;
    assert.equal(p.cam, '"route"', k);
    const P = onScreen(p, p.subject, s), T = onScreen(t, t.subject, s);
    assert.ok(Math.abs(P.zoom / T.zoom - 1) < 0.05, `${k}: drawn at ${(100 * P.zoom / T.zoom).toFixed(0)} % of today's size`);
    const pv = onScreen(p, src.placedBoxOfName('PV_TRUNK_1')!, s), pvToday = onScreen(t, src.todayBoxOfName('PV_TRUNK_1')!, s);
    assert.ok(pv.y1 <= pvToday.y1 + 8 && pv.y1 < s.room.y + s.room.h - 30, `${k}: the portal vein's foot at y ${pv.y1.toFixed(0)} (today ${pvToday.y1.toFixed(0)}; the story card at ${s.room.y + s.room.h})`);
  }
});
