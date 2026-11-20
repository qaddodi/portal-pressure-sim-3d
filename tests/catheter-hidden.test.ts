import test from 'node:test';
import assert from 'node:assert/strict';
import { Catheter } from '../src/scene/catheter.ts';
import { createShared } from '../src/scene/materials/cel.ts';

test('the slice catheter (with its amber balloon) is hidden from the start, so nothing floats in the empty space beside the portal confluence', () => {
  const c = new Catheter(createShared());
  assert.equal(c.group.visible, false);
  for (const o of c.objects) o.group.visible = true;          // (the Circuit's return puts every body object back on)
  let drawn = false;
  c.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) { let on = true; for (let p: typeof o | null = o; p; p = p.parent) if (!p.visible) on = false; drawn ||= on; } });
  assert.equal(drawn, false, 'no mesh of the slice catheter can be drawn');
});
