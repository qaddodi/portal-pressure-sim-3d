// EUS-guided coils and glue (slide gastric-varices/eusglue): the scope's way under the fundus and its glue mode, the coil and the cast in the varix, and the play held at its last stop. Node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { x3, y3, len3 } from '../src/scene/frame2d.ts';
import { EUS_GLUE_STATION, EUS_GLUE_TARGET, EUS_RIGID, pointOn } from '../src/scene/devices/probes/copied/eus-scope.copied.js';
import { EndoScope, glueScopeWay, scopeWay, workD } from '../src/scene/devices/probes/scope.ts';
import { ProbeLayer } from '../src/scene/devices/probes/layer.ts';
import { GlueCast, castRange, coilLine, glueTarget3, glueVarix, GLUE_SPREAD } from '../src/scene/devices/glue-cast.ts';
import { ProcedureLayer } from '../src/scene/procedures/layer.ts';
import { specFor, legsOf, procPlanOf } from '../src/ui/deck/procs-plan.ts';
import { GEO2D } from '../src/scene/procedures/route.ts';
import { loadAgDeck } from '../src/decks/ag/index.ts';
import { PROCEDURE_PLAYS, PROCEDURE_OPEN } from '../src/scene/procedures/plays.ts';

const varix = glueVarix();
const distToCourse = (p: [number, number]): number => {
  const P = GEO2D[varix.id]!.cur;
  let best = Infinity;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1]!, [bx, by] = P[i]!, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const u = Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(p[0] - (ax + dx * u), p[1] - (ay + dy * u)));
  }
  return best;
};

test('the slide plays: eusglue is a playing kind, its steps are the 2D\'s five, and it is open no more', async () => {
  assert.ok(PROCEDURE_PLAYS.has('eusglue'));
  assert.equal('eusglue' in PROCEDURE_OPEN, false);
  const deck = (await loadAgDeck('gastric-varices')) as { slides: { id: string; procedure?: unknown }[] };
  const slide = deck.slides.find((s) => s.id === 'eusglue')!;
  const plan = procPlanOf(slide)!;
  assert.equal(plan.kind, 'eusglue');
  const sp = specFor('eusglue')!;
  assert.deepEqual(sp.steps.map((s) => s[0]), ['enter', 'needle', 'coils', 'glue', 'done']);
  // the model closes the varix as the sequence passes apply, and gives it back
  assert.equal(sp.had({}), false);
  assert.equal(sp.had(sp.apply({})), true);
  assert.equal(sp.had(sp.undo(sp.apply({}))), false);
});

test('the scope has its own way to the fundus: down the esophagus, one wide turn through the cardia, on under the fundus to the station over the varix', () => {
  const g = glueScopeWay(), e = scopeWay();
  assert.ok(g.total > e.total + 40, `${g.total} vs ${e.total}`);
  const end = g.pts[g.pts.length - 1]!;
  assert.ok(Math.hypot(end[0] - EUS_GLUE_STATION.at[0], end[1] - EUS_GLUE_STATION.at[1]) < 2.5, String(end));
  assert.equal(workD('glue', 'pv', g), g.total);
  // never a sharp knee: the heading turns by less than 4 degrees between samples (1.2 units apart)
  let worst = 0;
  for (let i = 2; i < g.pts.length; i++) {
    const a = Math.atan2(g.pts[i - 1]![1] - g.pts[i - 2]![1], g.pts[i - 1]![0] - g.pts[i - 2]![0]), b = Math.atan2(g.pts[i]![1] - g.pts[i - 1]![1], g.pts[i]![0] - g.pts[i - 1]![0]);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))));
  }
  assert.ok(worst < (4 * Math.PI) / 180, `${(worst * 180) / Math.PI} degrees`);
});

test('the scope in glue mode, driven by the procedure\'s frame: it stands at the station, the needle goes square into the varix and stops on its point, the sector fans', () => {
  const sc = new EndoScope(createShared());
  const drive = { u: 1, aim: 1, fan: 1, needle: 1 };
  sc.update(16, true, 'glue', 'pv', 1, 1, drive);
  sc.update(16, true, 'glue', 'pv', 1, 1, drive);
  const w = glueScopeWay();
  assert.ok(Math.abs(sc.d - w.total) < 1e-6);
  const st = new Vector3(x3(EUS_GLUE_STATION.at[0]), y3(EUS_GLUE_STATION.at[1]), sc.pose.tip.z);
  assert.ok(sc.pose.tip.distanceTo(st) < len3(2.5), 'the tip is at the station');
  const T = glueTarget3(new Vector3());
  assert.ok(Math.hypot(sc.pose.needleEnd.x - T.x, sc.pose.needleEnd.y - T.y) < len3(0.5), 'the needle ends on the varix');
  // straight there: the bend does not turn the scope (the needle leaves square to it, no sharp bend: the 2D design)
  const tipDir = sc.pose.dir, needleDir = new Vector3().subVectors(sc.pose.needleEnd, sc.pose.tip);
  assert.ok(needleDir.length() > len3(EUS_RIGID * 0.5));
  assert.ok(Math.abs(tipDir.angleTo(new Vector3(1, 0, 0))) < 0.3, 'the tip lies along the fundus');
  assert.ok(sc.group.visible);
  // no drive, no needle: the part of a frame before the needle is out
  const half = { u: 1, aim: 0.5, fan: 0, needle: 0 };
  sc.update(16, true, 'glue', 'pv', 1, 0, half);
  assert.equal(sc.needle, 0);
  assert.equal(sc.aim, 0.5);
});

test('a scope the procedure has let go of fades out where it stood (600 ms), never travelling back up the esophagus, and is then free for the Tests card', () => {
  const sc = new EndoScope(createShared());
  sc.update(16, true, 'glue', 'pv', 1, 0, { u: 1, aim: 1, fan: 0, needle: 0 });
  const d0 = sc.d;
  assert.ok(sc.leave(200));
  assert.equal(sc.d, d0, 'parked: it did not move');
  assert.ok(sc.leave(200));
  assert.equal(sc.d, d0);
  assert.equal(sc.leave(300), false);
  assert.equal(sc.d, 0);
  assert.equal(sc.group.visible, false);
  // the plain endoscope works again afterwards, on its own way
  sc.update(16, true, 'scope', 'pv');
  assert.ok(sc.d > 0);
  assert.ok(sc.d <= 16 * 0.001 * 170 + 1e-6);
});

test('the probe layer plays the glue scope from the procedure layer\'s drive and lets it fade when the drive goes', () => {
  const pl = new ProbeLayer(createShared(), { organBox: () => null, kpa: () => null });
  const drive = { u: 1, aim: 1, fan: 1, needle: 1 };
  pl.update(0, false, drive); pl.update(16, false, drive);
  assert.ok(pl.scope.d > 100 && pl.active);
  assert.ok(pl.glueFocus(new Vector3()), 'the camera has a place to follow');
  let now = 16, moving = true, n = 0;
  while (moving && n++ < 200) { now += 16; moving = pl.update(now, false, null); }
  assert.ok(!moving && n > 20, `faded in ${n} frames`);
  assert.equal(pl.scope.d, 0);
  assert.equal(pl.active, false);
  assert.equal(pl.glueFocus(new Vector3()), null);
});

test('the cast sets on the coil first, then fills the lumen out to the spread each way, and always holds the needle\'s point', () => {
  assert.equal(castRange(0, varix), null);
  assert.deepEqual([varix.id, varix.f], EUS_GLUE_TARGET);
  let prev = castRange(0.05, varix)!;
  assert.ok(prev.lo <= varix.f && prev.hi >= varix.f);
  for (let c = 0.1; c <= 1.0001; c += 0.05) {
    const r = castRange(c, varix)!;
    assert.ok(r.lo <= prev.lo + 1e-9 && r.hi >= prev.hi - 1e-9, `grows at ${c}`);
    assert.ok(r.lo <= varix.f && r.hi >= varix.f);
    prev = r;
  }
  const full = castRange(1, varix)!;
  assert.ok(full.hi - varix.f >= GLUE_SPREAD - 1e-9 && varix.f - full.lo >= GLUE_SPREAD - 1e-9, 'the full spread each way');
});

test('the coil is the 2D coil: it starts at the needle\'s point, curls on along the varix, stays inside its walls, and is longer the more is out', () => {
  assert.deepEqual(coilLine(0, varix), []);
  const half = coilLine(0.5, varix), all = coilLine(1, varix);
  assert.ok(all.length >= 60 && all.length > half.length);
  const p = pointOn(GEO2D[varix.id]!.cur, varix.f) as [number, number];
  assert.ok(Math.hypot(all[0]![0] - p[0], all[0]![1] - p[1]) < 0.6, 'it comes out of the needle\'s point');
  for (const q of all) assert.ok(distToCourse(q) <= varix.rad, `a loop leaves the lumen: ${distToCourse(q)} of ${varix.rad}`);
  // the part already out keeps its place as more is pushed (the same wire, longer): its first loops are the same
  for (let i = 0; i < 4; i++) assert.ok(Math.hypot(all[i]![0] - half[i]![0], all[i]![1] - half[i]![1]) < 1.2, `sample ${i}`);
  // a lumen too narrow for the wire has none
  assert.deepEqual(coilLine(1, { ...varix, rad: 0.5 }), []);
});

test('the glue cast and coil are drawn in the varix and come away with clear()', () => {
  const g = new GlueCast(createShared());
  g.applyPalette(PALETTES.light);
  g.set({ coil: 0, column: 0, flash: 0, opacity: 1 });
  assert.equal(g.group.visible, false);
  g.set({ coil: 0.6, column: 0, flash: 0.3, opacity: 1 });
  assert.ok(g.group.visible && g.coil.group.visible && !g.cast.group.visible);
  assert.ok(g.flashes[0]!.group.visible && g.flashes[1]!.group.visible);
  g.set({ coil: 1, column: 0.7, flash: 0, opacity: 1 });
  assert.ok(g.coil.group.visible && g.cast.group.visible && !g.flashes[0]!.group.visible);
  assert.equal(g.cast.deviceTone, 'glue');
  g.set({ coil: 1, column: 1, flash: 0, opacity: 0.5 });
  assert.ok(g.cast.group.visible);
  g.clear();
  assert.equal(g.group.visible, false);
  assert.ok(!g.coil.group.visible && !g.cast.group.visible);
});

test('the procedure layer draws the glue as the 2D frame says, drives the scope, and clears both', () => {
  const pr = new ProcedureLayer(createShared());
  const T = (specFor('eusglue')!.T as unknown as Record<string, number>);
  pr.seek('eusglue', T.travel0! + 10);
  assert.ok(pr.glueDrive && pr.glueDrive.u > 0 && pr.glueDrive.needle === 0 && pr.glue.group.visible === false);
  pr.seek('eusglue', T.needle1!);
  assert.ok(pr.glueDrive!.needle > 0.99 && pr.glueDrive!.fan > 0.99 && pr.glueDrive!.aim > 0.99);
  pr.seek('eusglue', T.coil1!);
  assert.ok(pr.glue.coil.group.visible && !pr.glue.cast.group.visible);
  pr.seek('eusglue', T.fill1!);
  assert.ok(pr.glue.cast.group.visible);
  // after the needle is out and the sector gone the scope is parked over the varix, the coil and the cast in it
  pr.seek('eusglue', T.back!);
  assert.ok(pr.glueDrive!.needle < 0.01 && pr.glueDrive!.fan < 0.01 && pr.glueDrive!.u > 0.99);
  assert.ok(pr.glue.coil.group.visible && pr.glue.cast.group.visible);
  pr.stop();
  assert.equal(pr.glueDrive, null);
  assert.equal(pr.glue.group.visible, false);
});

test('the last step holds: the play stops at its last stop (not on the fade-out leg), and the scope stays parked until the slide is left', async () => {
  const { HOLD_KINDS } = await import('../src/ui/deck/procs-link.ts');
  assert.ok(HOLD_KINDS.has('eusglue') && !HOLD_KINDS.has('brto'));
  const sp = specFor('eusglue')!, legs = legsOf('eusglue').slice(0, -1);
  assert.equal(legs.length, sp.steps.length, 'one move per step');
  assert.equal(legs[legs.length - 1]![1], (sp.T as unknown as { back: number }).back);
});
