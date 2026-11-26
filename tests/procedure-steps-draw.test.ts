// Every step of every procedure any deck plays draws something (Mohammad, 22 Nov 2026: steps that draw nothing are bugs): a device on the figure at the step's stop (a catheter, a needle, a wire, a balloon, a scope, the tamponade tube,
// the paracentesis needle), or the model's change already made by then (T.apply). A step that is only a numbered callout on a vessel (the surgical steps "Expose" and "Splenic vein freed": nothing is yet on the figure to draw)
// is named here, so a new bare step cannot be added unseen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procFrame, stepMarks } from '../src/scene/procedures/copied/proc-anim.js';
import { ROUTE_KINDS } from '../src/scene/procedures/route.ts';
import { route3d, stopsOf } from '../src/scene/procedures/route3d.ts';
import { dipsFrame, paracentesisAt } from '../src/scene/procedures/instrument-frames.ts';
import { tamponadeAt } from '../src/scene/devices/balloons/tamponade-shape.ts';
import { procPlanOf, specFor, stopOf } from '../src/ui/deck/procs-plan.ts';
import { markCards } from '../src/scene/labels/proc-marks.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { loadSource } from '../src/decks/source.ts';

type Rec = { u: number; needle: number; wire: number; balloon: number; column: number; coil?: number; flash: number; [k: string]: unknown };
type Sp = NonNullable<ReturnType<typeof specFor>> & { route?: string; scope?: string; graft?: boolean };

/** Whether a device is on the figure at time t of the procedure (the layer's own rules, pure). */
function deviceAt(kind: string, t: number): boolean {
  const sp = specFor(kind) as Sp;
  const rk = sp.route ?? kind, r3 = (ROUTE_KINDS as readonly string[]).includes(rk) ? route3d(rk) : null, stops = r3 ? stopsOf(r3) : null;
  const f = (procFrame as unknown as (k: string, t: number, s: unknown, into: object) => Rec)(kind, t, stops, {});
  if (kind === 'dips') dipsFrame(f as never, t, stops);
  if (f.u > 1e-3 || f.needle > 0 || f.wire > 0 || f.balloon > 0 || f.column > 0 || (f.coil ?? 0) > 0 || f.flash > 0) return true;
  if (sp.scope && t < (sp.T.back ?? sp.T.end)) return true;   // (the ligator scope: procs-link puts the endoscope on the figure for the run)
  if (kind === 'tamponade') return tamponadeAt(t).adv > 0.001;
  if (kind === 'paracentesis') return paracentesisAt(t) > 0.001;
  return false;
}

async function deckKinds(): Promise<string[]> {
  const kinds = new Set<string>();
  const add = (d: { slides: { procedure?: unknown }[] }): void => { for (const s of d.slides) { const p = procPlanOf(s); if (p) { kinds.add(p.kind); if (p.then) kinds.add(p.then); } } };
  for (const id of AG_IDS) add((await loadAgDeck(id)) as never);
  for (const id of RW_IDS) add((await loadSource(id)) as never);
  for (const id of HP_IDS) add((await loadHpDeck(id)) as never);
  return [...kinds].sort();
}

/** The steps that are only a callout on the part they work on: a surgical exposure has no device to draw and no result yet. */
const CALLOUT_ONLY = new Set(['dsrs:0', 'rex:0']);

test('every step of every procedure the decks play has a device on the figure or the model\'s change made, bar the named surgical callouts', async () => {
  const kinds = await deckKinds();
  assert.ok(kinds.length >= 12, `the decks play ${kinds.join(', ')}`);
  const bare: string[] = [];
  for (const kind of kinds) {
    const sp = specFor(kind) as Sp | null;
    assert.ok(sp, `${kind} has a spec`);
    sp.steps.forEach((_, i) => {
      const t = stopOf(kind, i)!, last = t >= sp.T.end;
      // (the last step stands on the model's change: the run has ended and its devices have gone with the fade)
      // (a measurement's last step is its reading, standing on the card and the pressures: there is no model change to draw)
      const shown = (!last && deviceAt(kind, t)) || (!!sp.T.apply && t >= sp.T.apply) || (last && !!(sp as { measure?: boolean }).measure);
      const callout = markCards(stepMarks(kind, i) as never).length > 0;
      if (!shown) { bare.push(`${kind}:${i}`); assert.ok(callout, `${kind} step ${i} draws nothing and has no callout`); }
    });
  }
  assert.deepEqual(bare.sort(), [...CALLOUT_ONLY].sort(), 'the steps that draw only their callout');
});

test('the instruments that had no device before their change have one in every step: DIPS (catheter, needle, catheter over the wire) and paracentesis (needle in, held, out)', () => {
  for (const kind of ['dips', 'paracentesis', 'tamponade', 'evl']) {
    const sp = specFor(kind)!;
    sp.steps.forEach((_, i) => { const t = stopOf(kind, i)!; if (t < sp.T.end) assert.ok(deviceAt(kind, t), `${kind} step ${i} (t ${t}) has a device out`); });
  }
  // the DIPS needle is out in step 2 and gone from the figure before the catheter has gone over it; the paracentesis needle is out for the drain
  const sp = specFor('dips')!, st = stopsOf(route3d('dips')!);
  const f = (t: number) => dipsFrame({ u: 0, needle: 0, wire: 0, flash: 0, balloon: 0, opacity: 1 } as never, t, st) as unknown as Rec;
  assert.ok(f(sp.stops[1]! - 100).needle > f(sp.stops[1]! - 100).u, 'step 2: the needle is ahead of the catheter');
  assert.equal(f(sp.stops[1]! + 700).needle, 0, 'step 3: the catheter has gone over it');
  assert.ok(f(5850).balloon > 0.99 && f(sp.T.apply + 100).balloon === 0, 'the dilation balloon is up in step 3 and down before the stent opens');
  assert.ok(f(3900).flash > 0 && f(3400).flash === 0, 'the hit at the needle\'s arrival (the shared flashback)');
  assert.ok(paracentesisAt(3000) > 0.99 && paracentesisAt(6600) < 0.01);
});

test('the DIPS makes its tract as the TIPS does (the shared tract.ts): thin at the needle\'s hit, dilated by the balloon, held, on the DIPS\'s own edge', async () => {
  const { tractTimes, tractDiameter, tractEdgeOf } = await import('../src/scene/procedures/tract.ts');
  const { drawnDiameter } = await import('../src/engine/tract-override.ts');
  const { CelScene } = await import('../src/scene/scene.ts');
  const sp = specFor('dips')!, T = tractTimes(sp.T)!;
  assert.ok(T, 'its timeline has the needle\'s hit and the balloon');
  assert.equal(tractEdgeOf('dips'), 'DIPS'); assert.equal(tractEdgeOf('tips'), 'TIPS');
  assert.equal(tractDiameter(T, T.flash0 - 1), 0);
  assert.ok(tractDiameter(T, T.flash0 + 700) > 0 && tractDiameter(T, T.flash0 + 700) < 2, 'a needle\'s width at the hit');
  assert.equal(tractDiameter(T, sp.T.apply), 8, 'the stent\'s width when the model takes the shunt: nothing pops');
  const sc = new CelScene();
  sc.procs.drive('dips', 0);
  sc.procs.aimAt(sp.stops[1]!);
  let now = 0;
  for (let i = 0; i < 600 && (sc.procs.driven?.moving ?? false); i++) sc.procs.update((now += 16));
  assert.ok(drawnDiameter('DIPS') > 0 && drawnDiameter('TIPS') === 0, 'the DIPS tract is on the figure at the needle\'s stop, the TIPS\'s is not');
  assert.ok(sc.procs.tipPosition(new (await import('three')).Vector3()), 'and the catheter is out on its route');
  sc.procs.stop();
  for (let i = 0; i < 200; i++) sc.procs.update((now += 16));
  assert.equal(drawnDiameter('DIPS'), 0, 'it lets go when the run is taken off');
  sc.dispose();
});
