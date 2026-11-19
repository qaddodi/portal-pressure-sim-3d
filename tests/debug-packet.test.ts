// The bug packet's state link: the 3D app's own deep link plus a `#x` of the rest, read back as the app reads its own links; hostile input is dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureState, stateLink, readStateLink, cleanExtras, baseOf } from '../src/ui/debug/packet/state.ts';
import { buildPacket, packetText, parsePacket } from '../src/ui/debug/core/packet.copied.js';
import { isChord, longPress } from '../src/ui/debug/core/press.copied.js';
import { app } from './debug-helpers.ts';

const BASE = 'https://qaddodi.github.io/portal-pressure-sim-3d/preview/';

test('a state in a talk links to that slide, and its extras come back whole', () => {
  const a = { ...app(), mode: 'deck' as const, deck: { id: 'hvpg', number: 6, of: 12, words: 40, data: 2, title: 'Subtract', page: 0, pages: 1 }, look: 'navy', lens: 'pressure', view: 'lobule' };
  const s = captureState(a as never, { figure: { chevrons: true, zones: true }, labels: 'all', running: false, speed: 2 });
  const link = stateLink(s, BASE);
  assert.match(link, /\?script=hvpg&slide=6#x=/);
  const back = readStateLink(link);
  assert.equal(back.script, 'hvpg'); assert.equal(back.slide, 6);
  assert.deepEqual(back.x, s.x);
  assert.equal(back.x.look, 'navy'); assert.equal(back.x.view, 'lobule'); assert.equal(back.x.running, false); assert.equal(back.x.speed, 2);
});

test('free play links to the patient', () => {
  const a = { ...app(), mode: 'free' as const, deck: null, patient: 'cirr-decomp' };
  const link = stateLink(captureState(a as never), BASE);
  assert.match(link, /\?preset=cirr-decomp/);
  assert.equal(readStateLink(link).preset, 'cirr-decomp');
  assert.equal(baseOf(new URL(link)), BASE);
});

test('a link anyone can edit is cleaned: unknown looks, views, huge sizes and prototype keys are dropped', () => {
  const x = cleanExtras({ look: 'neon', lens: 'Pressure!', view: 'circuit', labels: 'x', vw: 99999, vh: 10, speed: -1, dpr: 0, figure: { chevrons: true, __proto__: { a: 1 }, evil: true }, __proto__: { polluted: 1 } });
  assert.deepEqual(x, { figure: { chevrons: true } });
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.deepEqual(readStateLink(`${BASE}?script=../x&slide=2#x=!!!`), { v: 1, preset: null, x: {} });
});

test('the packet carries the 3D link and the motion findings, and the text reads back whole', () => {
  const state = captureState({ ...app(), mode: 'free' as const, deck: null } as never);
  const p = buildPacket({ state, link: stateLink(state, BASE), screen: { v: 1 }, screenText: 'Screen: 390x844', history: { v: 1, samples: [] }, findings: [{ rule: 'fit-small', what: 'a small line', where: 'card teach' }], watchFindings: [{ rule: 'flash', what: 'a card blinked', where: 'teach', at: '1.0 s', scope: 'motion' }], device: { screen: '390x844' }, build: { commit: 'abc1234' }, health: {} }, { note: 'the card blinked' });
  const r = parsePacket(packetText(p));
  assert.ok(r.ok, String(r.why));
  assert.equal(r.packet.findings.length, 2);
  assert.equal(r.packet.note, 'the card blinked');
  assert.match(r.packet.link, /preview=|\?preset=/);
});

test('the chord is Alt+Shift+/ and never while typing; a hold of 0.7 s fires once and swallows the click', () => {
  assert.ok(isChord({ code: 'Slash', shiftKey: true, altKey: true, target: { tagName: 'DIV' } }));
  assert.ok(!isChord({ code: 'Slash', shiftKey: true, altKey: false, target: { tagName: 'DIV' } }), 'Shift+? alone is the shortcuts help');
  assert.ok(!isChord({ code: 'Slash', shiftKey: true, altKey: true, target: { tagName: 'INPUT' } }));
  const ls = new Map<string, (e: unknown) => void>();
  const badge = { addEventListener: (n: string, f: (e: unknown) => void) => { ls.set(n, f); }, removeEventListener: () => undefined };
  let fired = 0, timer: (() => void) | null = null;
  longPress(badge, () => { fired++; }, { timers: { set: (f: () => void) => { timer = f; return 1 as never; }, clear: () => { timer = null; } } as never });
  ls.get('pointerdown')!({ clientX: 5, clientY: 5 }); timer!(); assert.equal(fired, 1);
  let stopped = false; ls.get('click')!({ stopImmediatePropagation: () => { stopped = true; }, preventDefault: () => undefined }); assert.ok(stopped);
});
