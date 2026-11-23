import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';
import { PATHS, litOf, outcomeOf, readingFor, chipsOf, patientOf, slots, treeBoxes, ortho, mayBreak, layoutParagraph, flow, pathLayout, pathWords, WORST } from '../src/ui/charts/path/model.ts';
import { pathFrame, roundedPts } from '../src/ui/charts/path/frame.ts';
import { pathFingerprint, phoneLayout } from '../src/ui/charts/path/data.ts';
import { pathEntry } from '../src/ui/charts/path/entry.ts';
import { scaleFrame, type TextShape } from '../src/ui/charts/scene.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const ids = Object.keys(PATHS);
const TWO = pinned2D('src/ui/path-data.js');

// Numbers from the 2D app's own path-data.js run on the same patients (computed once).
test('the algorithms are the 2D app\'s: lit set, outcome, reading and chips of known patients equal 2D', () => {
  const run = (of: string, t: Record<string, unknown>) => { const p = patientOf(of, t, null), L = litOf(of, p), o = outcomeOf(of, L); return { p, lit: [...L], o, r: o ? readingFor(of, o, p) : null, chips: chipsOf(of, p) }; };
  const a = run('first-visit', { lsm: 18, plt: 128, bmi: false, ant: false });
  assert.deepEqual(a.lit, ['root', 'b3', 'g2', 'a4']);
  assert.equal(a.r!.head, 'CSPH still open');
  assert.equal(a.r!.why, 'LSM 18 kPa, platelets 128: indeterminate.');
  assert.deepEqual(a.chips, ['LSM 18 kPa', 'Platelets 128']);
  assert.deepEqual(run('first-visit', { lsm: 30, plt: 100 }).lit, ['root', 'b4', 'a6']);
  assert.deepEqual(run('first-visit', { lsm: 8, plt: 200 }).lit, ['root', 'b1', 'a1']);
  const h = run('holdcarv', { held: true, hrs: false });
  assert.deepEqual(h.lit, ['root', 'low']);
  assert.equal(h.r!.head, 'Stay off carvedilol');
  assert.deepEqual(h.chips, ['Carvedilol held', 'SBP 84', 'No HRS-AKI']);
  assert.deepEqual(run('pvtgrid', { r: 'yes', c: 'maj' }).lit, ['root', 'r:yes', 'c:maj', 'cell:yes|maj']);
  assert.equal(run('ladder', { s: 1, rc: false }).r!.head, 'cACLD with CSPH');
  const b = run('bleed', { src: 'ov', cp: 11, active: false, hvpg: 22, ctrl: true, fit: true });
  assert.deepEqual(b.lit, ['root', 'ctrl', 'ptips']);
  assert.equal(b.r!.why, 'Band ligation controlled the bleeding. Child–Pugh C11 is C 10–13, and the patient is a TIPS candidate.');
  assert.deepEqual(b.chips, ['Esophageal or GOV1', 'Child–Pugh C11', 'HVPG 22', 'No active bleeding', 'Controlled']);
});

test('the model\'s readings replace the slide\'s own as the tiles print them (2D patientFor with the tile table)', () => {
  const p = patientOf('first-visit', { bmi: true }, { lsm: 19.04, plt: 131.6, ssm: 60 }) as Record<string, unknown>;
  assert.deepEqual(p, { lsm: 19, plt: 132, bmi: true, ant: false, ssm: true });
  assert.deepEqual(pathFingerprint({ lsm: 12.5, ssm: null, spleen: { platelets: 140 }, whvp: 18, fhvp: 6 }), { lsm: 12.5, plt: 140, ssm: null, hvpg: 12 });
  assert.equal(pathFingerprint(null), null);
  assert.equal(phoneLayout('phone-portrait') && phoneLayout('tablet-portrait'), true);
  assert.equal(phoneLayout('desktop') || phoneLayout('phone-landscape'), false);
});

test('Baveno VIII only: no algorithm or reading names Baveno VII, and the source is Baveno VIII (no AASLD flowchart)', () => {
  assert.equal(ids.length, 14);   // (2D has 15: its AASLD rule-of-five chart is retired, scripts/source-edits.mjs RETIRED_PATH_ALGOS)
  for (const id of ids) {
    const s = PATHS[id as keyof typeof PATHS] as { kick: string; label: string };
    assert.match(s.kick, /^Baveno VIII$/, id);
    for (const p of [patientOf(id, null, null), WORST[id as keyof typeof WORST]]) assert.doesNotMatch(pathWords(id, p), /Baveno VII\b(?!I)/, id);
  }
  // and the copied files themselves
  for (const f of [...ids.map((i) => `algos/${i}.generated.js`), 'path-data.generated.js', 'path-cards.generated.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/ui/charts/path/${f}`, import.meta.url), 'utf8'), /Baveno VII(?!I)/, f);
  }
});

test('the copied files equal the 2D app\'s (when its checkout is there)', { skip: TWO.skip }, () => {
  execFileSync('node', ['scripts/copy-chart-path.mjs', '--from', TWO.repo, '--check'], { stdio: 'pipe' });
});

test('the tree: leaves take slots, the boxes tile the width, a connector goes down, along and down', () => {
  const tree = (PATHS['first-visit' as keyof typeof PATHS] as any).tree;
  const s = slots(tree);
  assert.equal(s.n, 5);
  assert.equal(s.maxd, 3);
  const b = treeBoxes(tree, 700);
  assert.equal(b.get('b1')!.w, 130);   // slot 140, less 10
  assert.equal(b.get('root')!.w, 330);   // ROOT_MAX
  assert.equal(b.get('b1')!.cx, 70);
  assert.deepEqual(ortho(10, 0, 10, 40), [10, 0, 10, 40]);
  const o = ortho(0, 0, 100, 40);
  assert.deepEqual(o.slice(0, 4), [0, 0, 0, 12]);   // r 8: V ym−r (20−8)
  assert.deepEqual(o.slice(-4), [100, 28, 100, 40]);
});

test('line breaking: a break after a space, never inside a number\'s unit, hanging spaces take no width', () => {
  assert.equal(mayBreak(' ', 'a'), true);
  assert.equal(mayBreak('a', 'b'), false);
  assert.equal(mayBreak('/', 'µ', '0'), false);
  assert.equal(mayBreak('-', 'a'), true);
  const r = layoutParagraph([{ text: 'one two three four', weight: 400, size: 12 }], 60);
  assert.ok(r.lines.length >= 2);
  for (const l of r.lines) assert.ok(l.w <= 60.01, `${l.w}`);
  const f = flow([[{ text: 'one two three four', face: 't' }]], 60);
  assert.equal(f.h, r.lines.length * 15);
});

test('the whole chart where every leaf has 104 px, else the small map; the card never changes height with the patient', () => {
  const wide = pathLayout('first-visit', patientOf('first-visit', null, null), 800);
  assert.equal(wide.compact, false);
  assert.ok(wide.tree && wide.tree.boxes.size === 12);
  const narrow = pathLayout('first-visit', patientOf('first-visit', null, null), 800, { phone: true });
  assert.equal(narrow.compact, true);
  assert.ok(narrow.map);
  assert.equal(pathLayout('first-visit', patientOf('first-visit', null, null), 500).compact, true);
  // a live patient keeps room for the tallest reading of every outcome
  const a = pathLayout('first-visit', patientOf('first-visit', { lsm: 8, plt: 200 }, null), 330, { phone: true }), b = pathLayout('first-visit', patientOf('first-visit', { lsm: 18, plt: 128 }, null), 330, { phone: true });
  assert.equal(a.H, b.H);
  // a room smaller than the picture brings the rows closer (2D's tight layout) at the same size of words
  const t = pathLayout('first-visit', patientOf('first-visit', null, null), 800, { room: wide.H - 1 });
  assert.equal(t.tight, true);
  assert.ok(t.H < wide.H);
});

test('a data card with a room shorter than the chart draws the small map, never a chart that stands past it (shunts slide 5: 624 px in a 768 px window, cut off at the foot)', () => {
  for (const of of ids) {
    const spec = (PATHS as Record<string, { kind: string }>)[of];
    for (const W of [360, 440, 520, 600]) {
      const p = patientOf(of, null, null), full = pathLayout(of, p, W, {}), tight = pathLayout(of, p, W, { room: 1 });
      // the chain: the rows close first, then the small map; the room never makes the card taller
      assert.ok(tight.H <= full.H, `${of} ${W}`);
      const room = Math.max(120, Math.min(tight.H - 1, full.H - 1));
      const L = pathLayout(of, p, W, { room });
      assert.ok(L.H <= full.H, `${of} ${W}`);
      if (full.H > room) assert.equal(L.tight, true, `${of} ${W}: rows closer first`);
      // a tree or card that still does not fit with tight rows gives way to the small map (2D tool-path.js layout(1, true, tight)), where that is shorter
      if (L.compact && !full.compact) assert.ok(L.H < full.H, `${of} ${W}: the small map is shorter`);
    }
    void spec;
  }
  // the instance from the report: the guideline flowchart at a Mac card's width in a 768 px window (the card's room was ~330 px)
  const big = pathLayout('ascites', patientOf('ascites', { tips: true, lt: true }, null), 560, {});
  const small = pathLayout('ascites', patientOf('ascites', { tips: true, lt: true }, null), 560, { room: 330 });
  assert.ok(small.H < big.H, 'a room shorter than the chart makes the picture shorter');
});

test('the deck hands every data card\'s instrument its room (2D --pz-room), measured from the card: path, saag and the plane keep inside it', () => {
  const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  const body = src('ui/talk/ToolCardBody.tsx'), box = src('ui/talk/ToolCard.tsx'), layer = src('ui/cards/CardLayer.tsx'), room = src('ui/talk/tool-room.ts');
  assert.match(box, /useToolRoom\(\)/, 'the instrument box measures its room');
  assert.match(box, /ToolRoom\.Provider/);
  assert.match(layer, /DataCap\.Provider value=\{alone \? 0 : plan\.maxH\.data\}/, 'the data card hands its height cap down');
  assert.match(body, /<PathCard[^\n]*room=\{room\}/, 'the path card gets the room');
  assert.match(body, /<SaagCard[^\n]*room=\{room\}/, 'the SAAG card gets the room');
  assert.match(body, /<PlaneCard plane=\{cs\.plane as never\} points=\{points\} room=/, 'the plane in a card gets the room');
  assert.match(room, /--pz-room/, 'the stylesheets that read --pz-room get it on the card');
  assert.match(room, /toolRoomOf\(/, 'the arithmetic is 2D\'s own (tool-room.copied.js)');
});

test('the lit path is whole and the rest quiet, in every look: the lit words are full, the others at 70%', () => {
  eachLook((look) => {
    const c = ctxOf(look, 800);
    const f = pathFrame({ of: 'first-visit', patient: patientOf('first-visit', { lsm: 18, plt: 128 }, null) }, c);
    const t = (s: string) => f.shapes.find((x): x is TextShape => x.k === 'text' && x.s === s)!;
    assert.equal(t('CSPH still open').alpha, undefined, look);   // lit
    assert.ok((t('Rules cACLD out').alpha ?? 1) < 1, look);   // not on the path
    assert.ok((t('Rules CSPH in').alpha ?? 1) < 1, look);
    // the lit connector is thicker than a quiet one
    const widths = f.shapes.filter((x) => x.k === 'path' && x.pen).map((x) => (x as { pen: { w: number } }).pen.w);
    assert.ok(Math.max(...widths) > Math.min(...widths), look);
  });
});

test('every algorithm, as the chart, the small map, and (the cards) the wide and small layouts: words 12 px or more, nothing outside the box, in every look at every width', () => {
  eachLook((look) => {
    for (const id of ids) {
      for (const p of [patientOf(id, null, null), WORST[id as keyof typeof WORST]]) {
        for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [800, 'desktop'], [1000, 'desktop']] as const) {
          for (const phone of [false, true]) {
            const f = pathFrame({ of: id, patient: p, opts: { phone } }, ctxOf(look, w, d));
            judge(f, look, { onCard: false });
            assert.ok(f.h > 0 && f.shapes.length > 3, `${id} ${w}`);
          }
        }
      }
    }
  });
});

test('the grid\'s shapes are closed outlines with rounded corners and the pill sits inside the box', () => {
  const sq = roundedPts([[0, 0], [20, 0], [20, 20], [0, 20]], 4);
  assert.ok(sq.length > 8 && sq.every(Number.isFinite));
  assert.ok(Math.min(...sq) >= 0 && Math.max(...sq) <= 20);
  const f = pathFrame({ of: 'pvtgrid', patient: patientOf('pvtgrid', { r: 'yes', c: 'maj' }, null) }, ctxOf('light', 500));
  assert.ok(f.shapes.some((s) => s.k === 'path' && s.closed));
});

test('the registry entry is done and its specimens draw', () => {
  assert.equal(pathEntry.status, 'done');
  assert.ok(pathEntry.specimens.length >= 3);
  for (const s of pathEntry.specimens) judge(s.build(ctxOf('dark', 330)), 'dark', { onCard: false });
});

test('under a card zoom the flowchart is laid out at the screen\'s own width and scaled back: its words stay 12 px on the screen (never 8)', () => {
  const ctx = (w: number, fit: number) => ({ ...ctxOf('light', w), fit });
  const spec = { of: 'holdcarv', patient: { held: false, sbp: 84, hrs: true } };
  const fit = 0.7, W = 480;
  const zoomed = pathFrame(spec, ctx(W, fit)), plain = pathFrame(spec, ctx(W, 1));
  const sizes = (f: typeof zoomed) => f.shapes.filter((s) => s.k === 'text').map((s) => (s as { size: number }).size);
  const onScreen = sizes(zoomed).map((z) => z * fit);
  assert.ok(onScreen.length > 5);
  for (const px of onScreen) assert.ok(px >= 11.99, `a word is ${px.toFixed(2)} px on the screen`);
  assert.ok(Math.min(...sizes(plain)) >= 12, 'unzoomed it is unchanged');
  assert.ok(Math.abs(zoomed.w - W) < 1e-6, 'the box keeps the card\'s own width');
  const f2 = scaleFrame({ w: 10, h: 10, label: '', shapes: [{ k: 'text', x: 1, y: 2, s: 'a', size: 12, color: [0, 0, 0, 1], halo: { color: [1, 1, 1, 1], w: 3 } }] }, 2);
  assert.deepEqual((f2.shapes[0] as { size: number; x: number; halo: { w: number } }).halo.w, 6);
  assert.equal(scaleFrame(f2, 1), f2);
});
