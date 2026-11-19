// Accessibility (batch B14): the patient's one-line caption, the announcer's gap, and Reduce Motion's rule that nothing pops and the camera's glide keeps a short form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { caption } from '../src/ui/a11y/caption.ts';
import { createAnnouncer, LIVE_GAP } from '../src/ui/a11y/announce.ts';
import { reducedMs, fadeMs, REDUCED_MOVE_MS, D_SMALL, D_SURFACE, D_FLIP } from '../src/ui/a11y/motion.ts';

const frame = (over: Record<string, unknown> = {}) => ({ metrics: { pv: 23, hvpg: 17, pvVel: 14, varix: { present: true, grade: { label: 'Large' } }, ascites: { grade: 2, volume: 800 }, ...over } });

test('caption: the name, the pressures with the HVPG band, then varices, ascites and the flow, in the 2D app\'s words', () => {
  assert.equal(caption(frame() as never, { label: 'Cirrhosis' }), 'Cirrhosis. Portal pressure 23 mmHg, HVPG 17.0 mmHg (CSPH). Large varices, 0.8 L ascites, flow toward the liver.');
  assert.equal(caption(frame({ varix: undefined, ascites: undefined }) as never, { label: 'Healthy', }).split('. ').pop(), 'Flow toward the liver.');
  assert.match(caption(frame() as never), /^Custom patient\./);
});

test('caption: it hides what the figure hides, and reads a bleed first', () => {
  const hidden = caption(frame() as never, { scenario: false, hidden: new Set(['pv', 'trueHVPG']) });
  assert.ok(!/Portal pressure|HVPG/.test(hidden), hidden);
  const bleed = caption({ ...frame(), bleed: { active: true } } as never, { label: 'Bleed' });
  assert.match(bleed, /^Bleed\. Active variceal bleed/);
  assert.equal(caption(null), ''); assert.equal(caption(undefined), '');
});

test('caption: a band-ligated varix reads banded, a red wale sign is named, and a normal HVPG says Normal', () => {
  assert.match(caption(frame({ varix: { present: true, grade: { label: 'None' } } }) as never), /^Custom patient\. .*\. Banded varices/);
  assert.match(caption(frame({ varix: { present: true, grade: { label: 'Medium' }, redWale: true } }) as never), /Medium varices with red wale signs/);
  assert.match(caption(frame({ hvpg: 3 }) as never), /HVPG 3\.0 mmHg \(Normal\)/);
});

function bench(gap = LIVE_GAP) {
  let t = 0; const said: string[] = []; const timers: { at: number; fn: () => void }[] = [];
  const say = createAnnouncer({ now: () => t, later: (fn, ms) => { timers.push({ at: t + ms, fn }); }, write: (m) => said.push(m), gap });
  const advance = (to: number) => { t = to; for (const k of timers.filter((x) => x.at <= t)) { timers.splice(timers.indexOf(k), 1); k.fn(); } };
  return { say, said, advance, timers, at: () => t };
}

test('announcer: the first word is spoken at once; the next within the gap waits and is spoken when the gap has passed', () => {
  const b = bench();
  b.say('Patient loaded.'); assert.deepEqual(b.said, ['Patient loaded.']);
  b.advance(1000); b.say('HVPG changed.'); assert.deepEqual(b.said, ['Patient loaded.']);
  b.advance(LIVE_GAP); assert.deepEqual(b.said, ['Patient loaded.', 'HVPG changed.']);
});

test('announcer: a burst is not dropped and not chattered: the newest waiting word is the one spoken, once', () => {
  const b = bench();
  b.say('one'); b.advance(100); b.say('two'); b.advance(200); b.say('three'); b.advance(300); b.say('four');
  assert.deepEqual(b.said, ['one']); assert.equal(b.timers.length, 1, 'one timer, however many words wait');
  b.advance(LIVE_GAP); assert.deepEqual(b.said, ['one', 'four']);
  b.advance(LIVE_GAP * 3); assert.deepEqual(b.said, ['one', 'four'], 'nothing is repeated');
});

test('announcer: after the gap a new word is spoken at once again; empty words are ignored; the gap is 3 s as in 2D', () => {
  const b = bench();
  b.say('a'); b.say(''); b.say(null); b.say(undefined); assert.deepEqual(b.said, ['a']); assert.equal(b.timers.length, 0);
  b.advance(LIVE_GAP + 1); b.say('b'); assert.deepEqual(b.said, ['a', 'b']);
  assert.equal(LIVE_GAP, 3000);
});

test('Reduce Motion: a move keeps a short form (at most 300 ms), a fade keeps 240 to 420 ms and is never a jump; off, nothing changes', () => {
  assert.equal(REDUCED_MOVE_MS, 300);
  assert.equal(reducedMs(950, true), 300); assert.equal(reducedMs(180, true), 180); assert.equal(reducedMs(950, false), 950);
  assert.equal(fadeMs(120, true), D_SMALL); assert.equal(fadeMs(900, true), D_SURFACE); assert.equal(fadeMs(300, true), 300);
  assert.equal(fadeMs(120, false), 120); assert.equal(fadeMs(0, true), D_SMALL, 'never 0: nothing pops');
  assert.ok(D_FLIP < D_SMALL && D_SMALL < D_SURFACE);
  for (const ms of [0, 50, 120, 240, 420, 1300, 5000]) assert.ok(fadeMs(ms, true) >= D_SMALL && fadeMs(ms, true) <= D_SURFACE);
});

test('Reduce Motion: the camera rig and the figure read the one policy, and no second media query is written outside it', () => {
  const rig = readFileSync(new URL('../src/scene/camera/rig.ts', import.meta.url), 'utf8');
  assert.match(rig, /reducedMs\(ms, this\.reduceMotion \|\| reduced\(\)\)/);
  const css = readFileSync(new URL('../src/ui/a11y/reduced.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce/);
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of rules.matchAll(/transition-property:\s*([^;]+);/g)) assert.ok(!/\btransform\b|\ball\b/.test(m[1]!), `a reduced-motion transition travels or fades everything: ${m[1]}`);
  for (const m of rules.matchAll(/transition-duration:\s*([\d.]+)ms/g)) assert.ok(+m[1]! >= D_SMALL, `a reduced-motion fade is a jump: ${m[1]} ms`);
});
