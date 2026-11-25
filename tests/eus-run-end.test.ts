// After the EUS-PPG slide's run ends the scope withdraws and never puts the needle in again (Mohammad, 25 Nov: "the EUS scope goes down and pokes the hepatic vein again").
// Root cause: the run's frames set the endoscope on (station hv); once the run ended nothing drove the scope any more, and an endoscope left on in 'eus' mode works on its own: down to the station, elevator up, sector out, needle in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { ProbeLayer } from '../src/scene/devices/probes/layer.ts';
import { useProbes } from '../src/scene/devices/probes/state.ts';

function layer() {
  const l = new ProbeLayer(createShared(), { organBox: () => new Box3(new Vector3(-1, -0.5, -0.2), new Vector3(1, 0.5, 0.2)), kpa: () => 8 });
  l.applyPalette(Object.values(PALETTES)[0]!);
  let now = 0;
  return { l, run: (ms: number) => { for (let t = 0; t < ms; t += 16) { now += 16; l.update(now); } } };
}

test('an endoscope left on at the hepatic vein station puts the needle in on its own; switched off it withdraws with no needle', () => {
  const on = layer();
  useProbes.getState().setEndoscope({ on: true, mode: 'eus', place: false, station: 'hv' });
  on.run(12000);
  assert.ok(on.l.scope.needle > 0.5, `left on, the scope pokes again (needle ${on.l.scope.needle})`);
  useProbes.getState().setEndoscope({ on: false });
  let peak = 0; for (let i = 0; i < 400; i++) { on.run(16); peak = Math.max(peak, on.l.scope.needle); if (i === 0) assert.ok(on.l.scope.needle <= 1); }
  assert.ok(on.l.scope.needle < 0.01, 'switched off, the needle is out');
});

test('every procedure run that sets the endoscope on from its frames switches it off when it ends (the EUS-PPG with the plain scope; a kind that holds keeps it until the slide is left)', () => {
  const link = readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8');
  assert.match(link, /if \(\(scope \|\| eus\) && !c\.hold\) useProbes\.getState\(\)\.setEndoscope\(\{ on: false \}\)/);
});
