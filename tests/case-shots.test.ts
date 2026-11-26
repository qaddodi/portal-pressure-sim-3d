// Playing a model patient's case (docs/approved/play-the-case.md), step 4: each course's own word on its stops (courses.ts `play.stops`), and the ways in. Every course stop anchors to a
// stop the case really makes, its shot is one the slides' own planner takes in the view it names, and every "Look closer here" opens a Tests card the app has (tests/panes.ts) or a view,
// three at most, as tests/deck-author.test.ts holds a slide's tools to the ones that exist. The baked stops are the courses' own (a course edited and not rebaked fails here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { COURSES } from '../src/ui/histories/courses.ts';
import { playOf } from '../src/ui/histories/play.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { viewOf } from '../src/ui/timeline/story-view.ts';
import { stopsOf } from '../src/ui/case/stops.ts';
import { shotScene } from '../src/ui/case/shot-plan.ts';
import { stopFor, showInCase, casePlaying } from '../src/ui/case/doors.ts';
import { useCase } from '../src/ui/case/store.ts';
import { BUILT_PANES, PANE_ORDER } from '../src/ui/tests/panes.ts';
import type { Stop } from '../src/ui/case/types.ts';

const VIEWS = ['anatomic', 'circuit', 'lobule', 'sinusoid'];
const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (_s: Snap) => undefined, frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => '',
  labelsOf: () => new Map(), say: () => undefined, announce: () => undefined, now: () => 0, later: () => 0, cancel: () => undefined,
});
async function played(id: string): Promise<{ stops: Stop[]; plain: Stop[] }> {
  const h = HISTORIES.find((x) => x.id === id)!, b = await LOAD[id]!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, h.name), b.snap.params);
  const v = viewOf({ tl, days: b.days, future: [], hidden: null, labelsOf: () => new Map(), chapters: h.chapters ?? null });
  return { stops: stopsOf(v.chapters, tl.entries(), h.play?.stops ?? []), plain: stopsOf(v.chapters, tl.entries()) };
}

test('every course\'s own stops are baked as written: a course edited and not rebaked (node scripts/gen-histories.mjs) fails here', async () => {
  for (const c of COURSES) {
    const h = HISTORIES.find((x) => x.id === c.id)!;
    assert.deepEqual(h.play?.stops ?? [], playOf(c, await LOAD[c.id]!()).play?.stops ?? [], `${c.id}: the baked stops are the course's`);
  }
});

test('every course stop anchors to a stop the case makes, once, and its shot is one the slides\' planner takes in the view it names', async () => {
  let changed = 0;
  for (const h of HISTORIES) {
    const own = h.play?.stops ?? [];
    const days = own.map((o) => o.day);
    assert.equal(new Set(days).size, days.length, `${h.id}: one word per stop (a second on the same day would be lost)`);
    const { stops, plain } = await played(h.id);
    for (const o of own) {
      if (o.drop) { assert.ok(!stops.some((s) => s.day === o.day && s.type === 'key'), `${h.id} Day ${o.day}: dropped`); continue; }
      const s = stops.find((x) => x.day === o.day);
      assert.ok(s, `${h.id} Day ${o.day}: the course names a stop the case makes`);
      const was = plain.find((x) => x.day === o.day)!;
      if (o.cam) { assert.equal(s.shot.cam, o.cam); assert.equal(s.shot.view, o.view ?? 'anatomic'); }
      if (o.lens) assert.equal(s.shot.lens, o.lens);
      const differs = JSON.stringify(s.shot) !== JSON.stringify(was.shot) || s.look.length > 0 || !!s.say;
      assert.ok(differs, `${h.id} Day ${o.day}: a course stop changes something (else it is the default and should not be written)`);
      if (o.cam && o.cam === was.shot.cam && (o.view ?? 'anatomic') === was.shot.view && !o.lens) assert.fail(`${h.id} Day ${o.day}: names the default shot again`);
      changed++;
    }
    for (const s of stops) {
      const sc = shotScene(s.shot);
      assert.equal(sc.view === 'body' ? 'anatomic' : sc.view, s.shot.view, `${h.id} Day ${s.day}: ${s.shot.view} takes the camera ${s.shot.cam}`);
    }
  }
  assert.ok(changed >= 12, 'the courses tune their stops');
});

test('every "Look closer here" opens a Tests card the app has, or a view; three at most, each with its own plain words', async () => {
  const tools = new Set<string>([...BUILT_PANES, ...VIEWS]);
  assert.ok(BUILT_PANES.every((p) => (PANE_ORDER as string[]).includes(p)), 'the built cards are the registry\'s');
  const used = new Set<string>();
  for (const h of HISTORIES) {
    const { stops } = await played(h.id);
    for (const s of stops) {
      assert.ok(s.look.length <= 3, `${h.id} Day ${s.day}: three at most`);
      assert.equal(new Set(s.look.map((l) => l.label)).size, s.look.length, `${h.id} Day ${s.day}: no two the same`);
      for (const l of s.look) {
        assert.ok(tools.has(l.tool), `${h.id} Day ${s.day}: "${l.tool}" is a Tests card or a view`);
        assert.match(l.label, /^[A-Z][^.!]{1,40}$/, `${h.id} Day ${s.day}: "${l.label}" is a short plain label`);
        assert.doesNotMatch(l.label, /Baveno|AASLD|EASL/, 'no guideline named on a button');
        used.add(l.tool);
      }
    }
    // (the course's own, before the stops merge a day: three at most there too)
    for (const o of h.play?.stops ?? []) assert.ok((o.look ?? []).length <= 3);
  }
  for (const t of ['endoscopy', 'hvpg', 'doppler', 'abdomen', 'fibroscan', 'profile']) assert.ok(used.has(t), `a stop opens ${t}`);
});

test('the shots a hepatologist would take: the clot, the hepatic veins, the cure in the lobule, the confusion in the first-pass lens, the PSVD block before the sinusoids', async () => {
  const shot = async (id: string, day: number) => { const s = (await played(id)).stops.find((x) => x.day === day)!.shot; return [s.view, s.cam, s.lens ?? ''].join(' ').trim(); };
  assert.equal(await shot('hist-pvt', 1), 'anatomic portal', 'anticoagulation for a portal vein clot: the portal vein');
  assert.equal(await shot('hist-bcs', 2), 'anatomic hepatic', 'anticoagulation for Budd-Chiari: the hepatic veins');
  assert.equal(await shot('hist-hcv', 228), 'lobule lobule:sinusoid', 'the cure, where the pressure persists');
  assert.equal(await shot('hist-alcohol', 1), 'anatomic liver');
  assert.equal(await shot('hist-bleed-tips', 45), 'anatomic liver firstpass', 'encephalopathy: the gut\'s blood round the liver');
  assert.equal(await shot('hist-psvd', 0), 'lobule lobule:triad');
  assert.equal(await shot('hist-pregnancy', 30), 'circuit splanchnic flow');
  assert.equal(await shot('hist-cardiac', 0), 'anatomic route', 'the congestion from the right heart back to the liver');
  assert.equal(await shot('hist-cardiac', 120), 'anatomic heart', 'the heart treated: its default');
  assert.equal(await shot('hist-ascites', 35), 'anatomic fit', 'a tap: its default');
  assert.equal(await shot('hist-brto', 23), 'anatomic fundus', 'BRTO: its default, as the gastric varices deck frames it');
  const bleed = (await played('hist-bleed')).stops.find((s) => s.day === 70)!;
  assert.deepEqual(bleed.look.map((l) => l.tool), ['endoscopy']);
});

test('History\'s Show on the figure while a case plays: a stop\'s moment goes to that stop, another moment to the nearest; off the case, History moves the figure itself', async () => {
  const { stops } = await played('hist-bleed');
  assert.equal(stopFor(stops, stops[5]!.entry, stops[5]!.day), 5);
  assert.equal(stopFor(stops, -7, 60), 5, 'not a stop: the nearest (Day 60 to the bleed, Day 70)');
  useCase.setState({ phase: 'off', stops });
  assert.equal(casePlaying(), false);
  assert.equal(showInCase(stops[2]!.entry, stops[2]!.day), false, 'no case: History goes to the moment');
  useCase.setState({ phase: 'left' });
  assert.equal(casePlaying(), false, 'a case left is the learner\'s own course');
  const src = readFileSync('src/ui/history/HistoryList.tsx', 'utf8');
  assert.match(src, /if \(!showInCase\(go, m\.day\)\) timeline\.goTo\(go\)/, 'the button asks the case first');
});

test('Play the case is on a model patient\'s card in the menu and in its History panel, and the case\'s code is read only when it is played', () => {
  const pv = readFileSync('src/ui/histories/HistoryPv.tsx', 'utf8'), list = readFileSync('src/ui/history/HistoryList.tsx', 'utf8');
  const doors = readFileSync('src/ui/case/doors.ts', 'utf8');
  assert.match(pv, /playFromMenu\(h\.id\)\}><I n="play" className="mi-ic" \/>\{STORY\.play\}/);
  assert.match(list, /<PlayCase \/>/);
  assert.match(list, /<Fade as="div" axis="y" className="hs-case" on=\{!!id && !playing\}>/, 'it eases away while the case plays');
  for (const [name, s] of [['HistoryPv', pv], ['HistoryList', list], ['doors', doors]] as const) assert.doesNotMatch(s, /^import[^;]*case\/run\.ts|^import[^;]*'\.\/run\.ts'/m, `${name}: no static import of the case's code`);
  assert.match(doors, /import\('\.\/run\.ts'\)/);
});
