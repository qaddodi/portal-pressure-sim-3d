// Review #2 (the patient announcement reads the previous patient's frame) and #5 (a talk's hidden free-play controls, the vessel walk's focus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPatientAnnouncer } from '../src/ui/a11y/patient-announce.ts';
import { enterOn, rovingNext } from '../src/scene/labels/walk-focus.ts';
import { rememberFocus, restoreFocus } from '../src/ui/shell/talk-focus.ts';

test('announcement: said from the first frame after the request, not from the frame on hand; A→B→C says C once with C\'s frame', () => {
  const said: [string, string][] = [];
  const a = createPatientAnnouncer<string>((id, f) => said.push([id, f]));
  a.frame('A-frame');                       // no request: silent
  a.request('B'); a.request('C');           // rapid switching: B is replaced before any frame comes
  assert.deepEqual(said, []);               // (the old frame was not read at request time)
  a.frame('C-frame-1'); a.frame('C-frame-2');
  assert.deepEqual(said, [['C', 'C-frame-1']]);
  a.request('A'); a.cancel(); a.frame('x');
  assert.equal(said.length, 1);
});

test('announcement: describe.ts routes it through the frame tap and passes that frame to the words', () => {
  const src = readFileSync(new URL('../src/ui/a11y/describe.ts', import.meta.url), 'utf8');
  assert.match(src, /loaded\.request\(s\.presetId\)/);
  assert.match(src, /onFrame\(\(f\) => loaded\.frame\(f\)\)/);
  assert.match(src, /describeNow\(\{ scenario: false \}, f\)/);
});

test('vessel walk: Enter after focus keeps the vessel picked, a second Enter un-picks; arrows step linearly, one tab stop', () => {
  assert.equal(enterOn('pv', 'pv', true), 'pv');
  assert.equal(enterOn('pv', 'pv', false), null);
  assert.equal(enterOn(null, 'pv', false), 'pv');
  assert.equal(rovingNext('ArrowDown', 0, 3), 1); assert.equal(rovingNext('ArrowDown', 2, 3), 2);
  assert.equal(rovingNext('ArrowUp', 0, 3), 0); assert.equal(rovingNext('Home', 2, 3), 0); assert.equal(rovingNext('End', 0, 3), 2);
  assert.equal(rovingNext('ArrowRight', 0, 3), null); assert.equal(rovingNext('Tab', 0, 3), null);
  const src = readFileSync(new URL('../src/scene/labels/VesselWalk.tsx', import.meta.url), 'utf8');
  assert.match(src, /tabIndex=\{i === 0 \? 0 : -1\}/); assert.match(src, /inert=\{talk\}/);
});

test('talk: the free-play chrome is inert for the whole talk, the CSS fade is kept, focus goes in and comes back', () => {
  const shell = readFileSync(new URL('../src/ui/shell/Shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /id="app" ref=\{appRef\} inert=\{mode === 'deck'\}/);
  assert.match(shell, /fadeChrome\(appRef\.current, away\)/);
  assert.match(shell, /restoreFocus\(/);
  assert.match(readFileSync(new URL('../src/ui/DeckUi.tsx', import.meta.url), 'utf8'), /root\.current\?\.focus\(/);
  assert.match(readFileSync(new URL('../src/ui/shell/talk.ts', import.meta.url), 'utf8'), /rememberFocus\(/);
  const calls: string[] = [];
  const mk = (n: string, on: boolean) => ({ isConnected: on, focus: () => calls.push(n) });
  rememberFocus(mk('tests', true)); restoreFocus(mk('fallback', true)); assert.deepEqual(calls, ['tests']);
  rememberFocus(mk('gone', false)); restoreFocus(mk('fallback', true)); assert.deepEqual(calls, ['tests', 'fallback']);
  rememberFocus(mk('first', true)); rememberFocus(mk('second', true), true); restoreFocus(null); assert.deepEqual(calls, ['tests', 'fallback', 'first']);
});
