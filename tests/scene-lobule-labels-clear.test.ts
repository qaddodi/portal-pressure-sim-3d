// The lobule's names on real screens (Mohammad's Mac play-test at 390x844, integration tip 6f94faf): "Hepatic arteriole" had no leader (it stood as an empty 6 px box beside its ring, because the solver's last form of a
// name with no reading was nameless, and any name within 12 px of a vessel's edge draws no leader), and "Central vein" stood over the sinusoids that run into it. Every name of a vessel keeps a leader and its ring, and the
// central vein's stands wholly clear of the drawn courses (and of the hint pill and the dock), at the six rest frames of the phones, an iPad and a Mac, with the real camera's scale (tests/lobule-frame.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { LINE_KINDS, buildLobuleCaptions } from '../src/scene/lobule/captions.ts';
import { RS_N } from '../src/scene/lobule/widths.ts';
import { LEAD_ON, LINE_AIR, boxOf, solve, type Item } from '../src/scene/labels/solver.ts';
import { boxGap, crosses, grow, hits } from '../src/scene/labels/geometry.ts';
import { SIZES, frame } from './lobule-frame.ts';

const net = buildLobule();
const measure = (t: string) => t.length * 6.8;

function run(s: (typeof SIZES)[number], pill: boolean, zones: boolean) {
  const f = frame(s), blockers = pill ? f.blockers : [];
  const inView = (x: number, y: number) => x > f.view.x0 + 64 && x < f.view.x1 - 64 && y > f.view.y0 + 64 && y < f.view.y1 - 64 && !blockers.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
  const c = buildLobuleCaptions({ proj: f.proj, vp: { w: s.w, h: s.h }, measure, net, layers: { zones, lymph: true }, inView });
  const out = solve({ items: c.items, view: f.view, blockers, lines: c.lines, keep: c.keep });
  return { f, c, out, blockers };
}
const STATIONS = ['triad', 'sin', 'cv', 'ha', 'bd', 'lymph'];

for (const s of SIZES) for (const pill of [true, false]) for (const zones of [false, true]) {
  test(`${s.name}${pill ? ', hint pill up' : ''}${zones ? ', Zones layer' : ''}: every name of a vessel has its leader and ring, none is an empty box, none is hidden`, () => {
    const { c, out } = run(s, pill, zones);
    assert.deepEqual(out.hidden.filter((id) => !id.startsWith('z:')), [], 'no station is left with a dot out of the view or under a card (a zone name under the pill is the zones\' own: they have no leader)');
    for (const p of out.placed) {
      if (p.id.startsWith('z:')) continue;
      const it = c.items.find((i) => i.id === p.id)!, box = boxOf(p, it.ax, it.ay), form = it.forms[p.form]!;
      assert.ok(p.w > 12 && p.h > 8, `${p.id}: a real box (${p.w}x${p.h})`);
      assert.ok(form.text !== '' || c.meta.get(p.id)!.forms[p.form]!.value, `${p.id}: carries its name or its reading`);
      const gap = boxGap(box, it.ax, it.ay) - (it.vw ?? 0);
      assert.ok(gap > LEAD_ON, `${p.id}: its words stand ${gap.toFixed(1)} px from the vessel's edge, over ${LEAD_ON}`);
      assert.equal(p.leader, true, `${p.id}: has its leader`);
      assert.equal(c.meta.get(p.id)!.kind, 'station', `${p.id}: a station, drawn with its ring (LobuleCaptions makes a ring for every station)`);
    }
    // a name that finds no room is left out whole (no ring either); on a screen with room for all six every one stands. Only the phone held sideways, a 150 px band, loses a small one.
    const need = STATIONS.filter((k) => c.items.some((i) => i.id === k));
    const placed = new Set(out.placed.map((p) => p.id));
    const room = s.w >= 800 && s.h < 500;
    for (const k of need) if (!room || k === 'triad' || k === 'cv') assert.ok(placed.has(k), `${k} is named (placed ${[...placed]}, dropped ${out.dropped})`);
  });
}

for (const s of SIZES) for (const pill of [true, false]) {
  test(`${s.name}${pill ? ', hint pill up' : ''}: the Central vein name covers no sinusoid, cross-link, inlet or twig, stands clear of the pill and over the dock, and its leader runs back to the vein`, () => {
    const { f, c, out, blockers } = run(s, pill, false);
    const p = out.placed.find((x) => x.id === 'cv')!, it = c.items.find((i) => i.id === 'cv')!;
    assert.ok(p, 'the central vein is named');
    const box = boxOf(p, it.ax, it.ay), tube = Math.max(1, RS_N * 1.3 * f.pxR);
    const near = grow(box, tube);   // (the widest a drawn tube is beside it)
    let n = 0;
    for (const course of net.courses) {
      if (!LINE_KINDS.has(course.kind)) continue;
      let prev: [number, number] | null = null;
      for (const q of course.pts) {
        const pt = f.proj(q[0], q[1]);
        if (prev && crosses(prev[0], prev[1], pt[0], pt[1], near)) n++;
        prev = pt;
      }
    }
    assert.equal(n, 0, `${n} segments of the drawn courses run under the name (box ${[box.x0, box.y0, box.x1, box.y1].map(Math.round)})`);
    assert.ok(LINE_AIR >= 2, 'with air');
    for (const b of blockers) assert.ok(!hits(box, b), 'clear of the hint pill');
    assert.ok(box.y1 <= f.view.y1 + 1e-6 && box.y0 >= f.view.y0 && box.x0 >= f.view.x0 && box.x1 <= f.view.x1, 'inside the labels\' view, over the dock');
    assert.equal(p.leader, true, 'a leader back to the vein');
    // the leader leaves the vein's own dot
    assert.ok(boxGap(box, it.ax, it.ay) > (it.vw ?? 0), 'the words stand outside the vein\'s disc');
  });
}

// the solver's two new rules, on their own
const base = (over: Partial<Item>): Item => ({ id: 'a', ax: 200, ay: 200, au: 0.5, forms: [{ text: 'Name', w: 60, h: 18 }], pri: 50, vw: 2, ...over });
const view = { x0: 0, y0: 0, x1: 400, y1: 400 };
test('solver: a name with minLead never stands within it of the vessel\'s edge, so its leader always shows; without it a name may hug the vessel with none', () => {
  const plain = solve({ items: [base({})], view, blockers: [] }).placed[0]!;
  assert.equal(plain.leader, false, 'the old rule: hugging the vessel, no leader');
  const lead = solve({ items: [base({ minLead: 13 })], view, blockers: [] }).placed[0]!;
  assert.equal(lead.leader, true);
  assert.ok(boxGap(boxOf(lead, 200, 200), 200, 200) - 2 > LEAD_ON);
});
test('solver: clearLines puts a name where no line runs under it, as far from the dot as it must (reach), else under the fewest', () => {
  // a fan of lines through the dot: no box beside it is clear
  const lines: [number, number, number, number][] = [];
  for (let y = 100; y <= 300; y += 8) lines.push([120, y, 280, y]);
  const free = solve({ items: [base({ clearLines: true, reach: 300 })], view, blockers: [], lines }).placed[0]!;
  const b = grow(boxOf(free, 200, 200), LINE_AIR);
  for (const l of lines) assert.ok(!crosses(l[0], l[1], l[2], l[3], b), 'clear of every line');
  const near = solve({ items: [base({ clearLines: true })], view, blockers: [], lines }).placed[0]!;
  assert.ok(near, 'a name with no reach still stands (the soft fallback)');
  // with the lines everywhere in the view, nothing is clear: the name still stands, under the fewest
  const all: [number, number, number, number][] = [];
  for (let y = 0; y <= 400; y += 6) all.push([0, y, 400, y]);
  assert.equal(solve({ items: [base({ clearLines: true, reach: 300 })], view, blockers: [], lines: all }).placed.length, 1);
});
test('solver: a name the greedy order left out for a higher ranked one that could stand elsewhere is tried first (2D tries its orders)', () => {
  // a corridor 22 px high holds one name; the higher ranked one has the choice of the corridor or the wide room, and takes the corridor first
  const items: Item[] = [
    base({ id: 'hi', pri: 90, ax: 100, ay: 100, forms: [{ text: 'High', w: 60, h: 18 }], dirs: ['E'] }),
    base({ id: 'lo', pri: 10, ax: 100, ay: 112, forms: [{ text: 'Low', w: 60, h: 18 }], dirs: ['E'] }),
  ];
  const out = solve({ items, view: { x0: 0, y0: 60, x1: 400, y1: 400 }, blockers: [] });
  assert.equal(out.dropped.length, 0, `dropped ${out.dropped}`);
});
