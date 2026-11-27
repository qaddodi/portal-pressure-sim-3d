// L12 (owner, 27 Nov, from capture 3531bdfa C-D5): a path or grid card on an iPhone stood 20 to 63 px past its card (16.2, 16.5, 16.11, 16.14, 17.7, 18.9) and was cut. He chose "fit-zoom the whole path", with the 12 px floor kept.
// Root cause: the shared path layout (charts/path/model.ts pathLayout) had two ways to meet a short room, rows closer ("tight") and the small map, and then stopped; its type was fixed at the 2D table's sizes (the verdict's
// headline 21 px, its why 14, a condition's verdict 13), so a path that was still too tall stood past its room, whatever the room, whatever the device. Now the last step of the layout is the fit: every role above 12 px steps down
// toward 12 (FIT_STEPS, rolesAt), the gaps stand at their least, the gentlest step that brings the path inside its room is taken, and the last step is every role at 12 px, never under. What is still past its room after that
// cannot be fitted without going under the floor; the test names the rule, the report names the slides. Node only (the layouts are pure functions of width, patient and room); the room is an estimate, "needs a look on device".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { pathLayout, patientOf, rolesAt, helpersAt, ROLE, FIT_STEPS, FLOOR_PX, CARD_HELPERS } from '../src/ui/charts/path/model.ts';
import { pathFrame } from '../src/ui/charts/path/frame.ts';
import { phoneLayout } from '../src/ui/charts/path/data.ts';
import { planLayout, widthOf, credRow } from '../src/ui/layout/plan.ts';
import { typeFor, deviceClass } from '../src/ui/layout/device.ts';
import { cardPad, layoutOf } from '../src/ui/layout/rules2d.ts';
import { parseLine, plainLine } from '../src/ui/text/line.ts';
import { ctxOf, judge } from './charts-helpers.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCREENS = [
  { n: 'iPhone 390 untucked', w: 390, h: 844, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone 390', w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone SE', w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];
type Vp = (typeof SCREENS)[number];

/** A conservative estimate of a teaching card's height from its character counts (as tests/card-fit-rule.test.ts). */
function wordsEstimate(vp: Vp, title: string, line: string): number {
  const t = typeFor(vp.w, vp.h), pad = cardPad(vp.w, vp.h), inner = widthOf(vp as never) - 2 * pad.x - 2;
  const lines = (n: number, px: number, em: number) => Math.max(1, Math.ceil((n * px * em * 1.08) / inner));
  const chars = plainLine(parseLine(line), () => 11.6).length;
  const lay = layoutOf(vp.w, vp.h), foot = lay === 'stack' || lay === 'tab' ? 50 + credRow(vp as never) : 0;
  return Math.ceil(2 * pad.y + 2 + lines(title.length, t.slideTitle, 0.5) * t.slideTitle * t.slideTitleLead + 12 + lines(chars, t.body, 0.54) * t.body * t.bodyLead + foot);
}

async function paths() {
  const out: { deck: string; i: number; of: string; patient: unknown; tiles: string[]; title: string; line: string }[] = [];
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!, c = copiedOf(id) as { slides: { tool?: { kind?: string; of?: string; patient?: unknown }; tiles?: string[] }[] } | undefined;
    if (!c) continue;
    d.slides.forEach((sl, i) => {
      const t = c.slides[i]?.tool;
      if (t?.kind === 'path') out.push({ deck: id, i, of: t.of ?? 'first-visit', patient: t.patient ?? null, tiles: Array.isArray(c.slides[i]!.tiles) ? c.slides[i]!.tiles! : [], title: sl.title, line: sl.line });
    });
  }
  return out;
}

/** The room an instrument's picture has on a screen, estimated: the plan's cap for the data card with the words at their one-page height, less the card's padding and its header row of tiles. */
function roomOf(vp: Vp, p: Awaited<ReturnType<typeof paths>>[number]): number {
  const wh = wordsEstimate(vp, p.title, p.line);
  const plan = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: 400 }] as never, 'words', 0, false);
  return Math.max(0, plan.maxH.data - (2 * cardPad(vp.w, vp.h).y + 2) - (p.tiles.length ? 56 : 0));
}

test('the fit\'s type: each role above 12 px steps down with k and never under 12 px, a role at 12 stays put, a line height follows its size, and k = 1 is the 2D table itself', () => {
  assert.equal(rolesAt(1), ROLE);
  assert.equal(helpersAt(1), CARD_HELPERS);
  assert.equal(helpersAt(0.7), helpersAt(0.7), 'one helpers object for each step: the card layouts memoise their lines against it');
  assert.equal(FIT_STEPS[FIT_STEPS.length - 1]! * Math.max(...Object.values(ROLE).map((r) => r.size)) <= FLOOR_PX + 0.5, true, 'the last step takes the largest role (21 px) to the floor');
  for (const k of FIT_STEPS) {
    const r = rolesAt(k);
    for (const [face, o] of Object.entries(ROLE)) {
      assert.ok(r[face]!.size >= FLOOR_PX, `${face} at ${k}: ${r[face]!.size} px is under the floor`);
      assert.ok(r[face]!.size <= o.size, `${face} grew`);
      if (o.size <= FLOOR_PX) assert.equal(r[face], o, `${face} is at the floor already: it never moves`);
      else assert.ok(r[face]!.lh >= r[face]!.size + 2 && r[face]!.lh <= o.lh, `${face}: line height ${r[face]!.lh}`);
    }
  }
  assert.equal(rolesAt(FIT_STEPS[FIT_STEPS.length - 1]!).rh!.size, FLOOR_PX, 'the verdict headline reaches 12 px at the last step, not under');
  // a gentler step never has smaller type than a stronger one
  for (const face of Object.keys(ROLE)) for (let i = 1; i < FIT_STEPS.length; i++) assert.ok(rolesAt(FIT_STEPS[i - 1]!)[face]!.size >= rolesAt(FIT_STEPS[i]!)[face]!.size, face);
});

test('every path slide of every deck on every screen: a path that fits its room is drawn as it was; one that does not is fitted, step by step, never under 12 px; what is left is only what the floor cannot give', async () => {
  const ps = await paths();
  assert.ok(ps.length >= 33, `${ps.length} path slides`);
  let fitted = 0, past = 0, pastWithout = 0, cases = 0;
  const stillPast: string[] = [];
  for (const vp of SCREENS) for (const p of ps) {
    const W = widthOf(vp as never) - 2 * cardPad(vp.w, vp.h).x - 2, phone = phoneLayout(deviceClass(vp.w, vp.h)), tiled = new Set(p.tiles), patient = patientOf(p.of, p.patient as never, null);
    const room = roomOf(vp, p), at = `${p.deck}.${p.i + 1} ${p.of} ${vp.n} room ${room}`;
    // what the layout was before the fit: the natural size, then rows closer, then the small map where the chart is not one already (no room given: no last step)
    const plain = pathLayout(p.of, patient, W, { phone, tiled }), asked = pathLayout(p.of, patient, W, { phone, tiled, room });
    const tightH = pathLayout(p.of, patient, W, { phone, tiled }, true).H, mapH = plain.compact ? Infinity : pathLayout(p.of, patient, W, { phone, tiled }, true, true).H, before = Math.min(tightH, mapH);
    cases++;
    // a path that fits at its natural size, or in rows closer or the small map, is drawn exactly as before: the fit is a last step and never taken for a path that has room
    if (asked.fit === 1) { assert.ok(plain.H <= room || before <= room || before >= asked.H, `${at}: no fit though ${asked.H} is past ${room}`); assert.ok(room <= 0 || asked.H <= Math.max(room, before, plain.H), `${at}: ${asked.H}`); continue; }
    fitted++;
    assert.ok(room > 0 && before > room, `${at}: fitted though the path fitted its room (${before})`);
    assert.ok(FIT_STEPS.includes(asked.fit as never), `${at}: fit ${asked.fit}`);
    assert.ok(asked.H < before, `${at}: the fit made it no shorter (${asked.H} vs ${before})`);
    // the gentlest step that fits: a step gentler than this one was still past the room
    for (const k of FIT_STEPS.filter((x) => x > asked.fit)) { const g = pathLayout(p.of, patient, W, { phone, tiled }, true, plain.compact, k); assert.ok(g.H > room || asked.H <= g.H, `${at}: step ${k} fits (${g.H}) but ${asked.fit} was taken`); }
    // past its room after the fit: the last step (every role at 12 px) gives no more (a ladder's words are at 12 px already, so its gentlest step is its last)
    if (asked.H > room) { past++; const last = pathLayout(p.of, patient, W, { phone, tiled }, true, plain.compact, FIT_STEPS[FIT_STEPS.length - 1]!); assert.ok(asked.H <= last.H, `${at}: past its room ${asked.H}, and the last step gives ${last.H}`); stillPast.push(at); }
    // and never under 12 px on the screen: every word the frame draws, at the fit it was laid out at
    const f = pathFrame({ of: p.of, patient, opts: { phone, tiled, room } }, ctxOf('dark', W, phone ? 'phone-portrait' : 'desktop'));
    judge(f, 'dark', { onCard: false, slack: 8 });
    if (before > room) pastWithout++;
  }
  assert.ok(cases >= 33 * SCREENS.length && fitted > 20, `${cases} cases, ${fitted} fitted`);
  // the fit took paths into their room that the rows-closer and small-map steps left past it (strictly fewer past the room than before the fit)
  assert.ok(past < pastWithout, `${past} still past their room after the fit, ${pastWithout} before it`);
  assert.ok(stillPast.every((s) => s.includes('room')), 'the list names its cases');
});

test('the frame draws what the layout laid out: its type is the layout\'s roles, its card layouts the fit\'s helpers, and nothing else sizes a word', () => {
  const frame = src('src/ui/charts/path/frame.ts'), model = src('src/ui/charts/path/model.ts');
  assert.match(frame, /size: o\.size \?\? L\.roles\[face\]!\.size,/);
  assert.match(frame, /drawCard\(L\.spec\.algo, W, L\.compact, patient, helpersAt\(L\.fit\)\)/);
  assert.match(frame, /flow\(readParas\(r, headOnlyOn\(of, !!spec\.opts\?\.phone\)\), W, \{ gap: 4, roles: L\.roles \}\)/);
  assert.doesNotMatch(frame, /ROLE\[face\]!\.size/, 'a word is never sized from the unfitted table');
  // the fit is the layout's last step: after tight rows and the small map, in the gentlest-first order, the gaps at their least
  assert.match(model, /for \(const k of FIT_STEPS\) \{\n\s+if \(best\.H <= o\.room\) break;/);
  assert.match(model, /fit < 1 \? 4 : tight \? 6 : GAP/);
  assert.match(model, /size > FLOOR_PX \? Math\.max\(FLOOR_PX, Math\.round\(o\.size \* k\)\) : o\.size/);
});
