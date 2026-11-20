// The space of Disse's channels in the lobule's network (2D's `beside`, offset lyOff from the sinusoid's axis): one beside each sinusoid, never a rung between two (the 3D lobule draws them: micro3d/lobule3d.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule } from '../src/scene/lobule/geometry.ts';

const net = buildLobule();

test('no rung: every sleeve stays on its own sinusoid (within 0.05 R of it all along), one per sinusoid, none between two', () => {
  const ly = net.courses.filter((c) => c.kind === 'ly'), byId = new Map(net.courses.map((c) => [c.id, c]));
  const sin = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2');
  assert.equal(ly.length, sin.length);
  assert.deepEqual([...new Set(ly.map((c) => c.sib))].sort((a, b) => a! - b!), sin.map((c) => c.id).sort((a, b) => a - b), 'one sleeve beside each sinusoid, none beside a cross-link');
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    for (let i = 0; i < c.pts.length; i++) {
      let near = Infinity, nearOther = Infinity;
      for (const o of sin) for (const q of o.pts) { const d = Math.hypot(c.pts[i]![0] - q[0], c.pts[i]![1] - q[1]); if (o === s) near = Math.min(near, d); else nearOther = Math.min(nearOther, d); }
      assert.ok(near < 0.05, `course ${c.id} sample ${i} strays ${near.toFixed(3)} R from its sinusoid`);
      if (near > 0.02) assert.ok(near <= nearOther, `course ${c.id} sample ${i} lies nearer another sinusoid than its own`);
    }
    // no step across the plate: neighbouring samples are one stretch of the course apart
    for (let i = 1; i < c.pts.length; i++) assert.ok(Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1]) < 0.06, `course ${c.id} jumps at ${i}`);
  }
});

