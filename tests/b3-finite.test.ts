// A NaN in a vertex draws on a real GPU as a black blob or a long black spindle (Mohammad's iPhone, 19 Nov 2026: the esophageal varices, the Circuit's varix blobs). The node tests cannot see it, so this
// reads every attribute of every vessel's geometry, in the states that close strands (bands) and grow channels (rec), and fails on one that is not finite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../src/scene/circuit/course.ts';
import { attachRuns, slicesFor } from '../src/scene/circuit/geometry.ts';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';

const STATES = [{}, { bands: 1 }, { bands: 4 }, { rec: 0 }, { rec: 0.5 }, { live: 0 }, { bead: 0.35, wig: 1, spr: 0.4 }, { bands: 2.5, rec: 0.2, live: 0.3, bead: 0.2 }];

test('every vessel\'s geometry is finite in every state, and a tube of no radius carries rk 0 (never drawn) and no NaN', () => {
  for (const o of STATES) {
    for (const def of MAPPED) {
      const cs = coursesOf(def, { ...REST, ...o });
      const b = buildTubes(cs, tubularOf(def, slicesFor(def.id)), def.radius);
      const course = COURSES.get(def.id);
      const g = course ? attachRuns(b.geometry, b.runs, course, def.radius) : b.geometry;
      for (const name of Object.keys(g.attributes)) {
        const a = g.getAttribute(name);
        for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i] as number)) assert.fail(`${def.id} ${JSON.stringify(o)}: ${name}[${i}] is ${a.array[i]}`);
      }
      const rk = g.getAttribute('rk');
      for (let i = 0; i < rk.count; i++) assert.ok(rk.getX(i) >= 0, `${def.id} rk ${rk.getX(i)}`);
      // the shader normalizes the tangent and the normal: one of no length is a NaN in the fragment, a black pixel (the fill is lit from them)
      for (const name of ['tang', 'normal']) {
        const a = g.getAttribute(name);
        for (let i = 0; i < a.count; i++) { const l = Math.hypot(a.getX(i), a.getY(i), a.getZ(i)); assert.ok(l > 0.99 && l < 1.01, `${def.id} ${JSON.stringify(o)}: ${name}[${i}] has length ${l}`); }
      }
    }
  }
});

test('a closed strand is built and has rk 0 all along', () => {
  const def = MAPPED.find((v) => v.id === 'C8')!;
  const cs = coursesOf(def, { ...REST, rec: 0 });
  assert.ok(cs.some((c) => !(c.radius > 0)), 'at rec 0 the channels have not grown');
  const b = buildTubes(cs, tubularOf(def, 16), def.radius);
  const closed = b.runs.filter((_, i) => !(cs[i]!.radius > 0));
  const rk = b.geometry.getAttribute('rk');
  for (const r of closed) for (let i = 0; i < r.tubeCount; i++) assert.equal(rk.getX(r.tubeStart + i), 0);
});
