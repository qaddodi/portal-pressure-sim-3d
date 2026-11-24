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
