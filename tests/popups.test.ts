// Popups, 22 Nov (owner: "humanized", and "remove unnecessary annoying pop ups like click on a vessel: we don't have a tutorial"): how long a note stays, that a held note stays, that a second note
// crossfades its words, that a note which explains what the app chose is not red, the app's voice in its word tables, and that no instructional popup is left. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { useShell, toastMs, TOAST_MS, TOAST_MAX_MS, TOAST_LINGER_MS, ACTION_MS } from '../src/ui/shell/store.ts';
import { clock } from '../src/clock/frame.ts';
import * as W from '../src/ui/shell/words.ts';
import { SHARE_WORDS, loadShared, type ShareDeps } from '../src/ui/shell/share.ts';
import { UPDATE_TOAST } from '../src/pwa/register.ts';
import { TOAST_WORDS, OVERRIDDEN_TOASTS } from '../src/ui/treat/toast-words.ts';
import { TREAT_WORDS } from '../src/ui/treat/treat.generated.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (f: string) => readFileSync(join(root, f), 'utf8');

/** Run `go` with the clock's timers recorded (never started), so what a note asked for can be read and fired by hand. */
function timed(go: () => void): { ms: number[]; fire(i?: number): void } {
  const real = clock.after, fns: (() => void)[] = [], ms: number[] = [];
  clock.after = ((fn: () => void, t: number) => { fns.push(fn); ms.push(t); return fns.length as never; }) as typeof clock.after;
  try { go(); } finally { clock.after = real; }
  return { ms, fire: (i = fns.length - 1) => fns[i]?.() };
}

test('P1: a note stays about 250 ms a word, at least 3.2 s and at most 10 s; one with a button stays ACTION_MS', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
  assert.equal(toastMs('Settled to equilibrium.'), TOAST_MS);
  assert.equal(toastMs(words(20)), 5000);
  assert.equal(toastMs(words(30)), 7500);
  assert.equal(toastMs(words(80)), TOAST_MAX_MS);
  assert.equal(timed(() => useShell.getState().say(words(30))).ms[0], 7500);
  assert.equal(timed(() => useShell.getState().say(words(30), 'info', { label: 'Go', run: () => undefined })).ms[0], ACTION_MS);
  useShell.setState({ toast: null });
});

test('P1: a note a finger or the pointer is on stays; it fades TOAST_LINGER_MS after it is let go; a sticky note is never timed', () => {
  const sh = useShell.getState();
  sh.say('Held note.');
  assert.ok(useShell.getState().toast);
  const t = timed(() => { sh.holdToast(true); sh.holdToast(false); });
  assert.equal(t.ms.length, 1);
  assert.ok(t.ms[0]! >= TOAST_LINGER_MS && t.ms[0]! <= TOAST_MS, 'let go: the rest of its time, never under TOAST_LINGER_MS');
  t.fire();
  assert.equal(useShell.getState().toast, null);
  sh.say('Sticky.', 'info', undefined, true);
  assert.deepEqual(timed(() => { sh.holdToast(true); sh.holdToast(false); }).ms, []);
  useShell.setState({ toast: null });
});

test('P2: a second note crossfades its words in place (the old fade out, the new fade in)', () => {
  const tsx = src('src/ui/shell/Toast.tsx'), css = src('src/ui/shell/shell.css');
  assert.match(tsx, /TOAST_SWAP_MS = 120/);
  assert.match(tsx, /setShown\(next\); setSwap\(false\);[^\n]*TOAST_SWAP_MS\)/);
  assert.match(tsx, /data-swap=/);
  assert.match(css, /\.sh-toast > span \{[^}]*transition: opacity var\(--d-flip\) linear; \}/);
  assert.match(css, /\.sh-toast\[data-swap\] > span \{ opacity: 0; \}/);
});

test('P2: the note is a rounded glass box (owner, 22 Nov): the one glass, --r-sheet corners, words centred, the clock line kept, no dot, swipe, click or Esc lets it go', () => {
  const tsx = src('src/ui/shell/Toast.tsx'), css = src('src/ui/shell/shell.css');
  const rule = css.slice(css.indexOf('.sh-toast {'), css.indexOf('/* a Reset dialog */'));
  assert.doesNotMatch(rule, /border-radius: 50%|::before|text-shadow|border-top/, 'no dot, no halo, no ruled row');
  assert.match(rule, /\.sh-toast \{[^}]*border-radius: var\(--r-sheet\)/);
  assert.match(rule, /\.sh-toast \{[^}]*border: 1px solid var\(--edge\)/);
  assert.match(rule, /\.sh-toast \{[^}]*box-shadow: var\(--glass-shadow\)/);
  assert.match(rule, /\.sh-toast \{[^}]*overflow: hidden/);
  assert.match(rule, /\.sh-toast \{[^}]*text-align: center/);
  assert.match(rule, /\.sh-toast \{[^}]*justify-content: center/);
  assert.match(rule, /\.sh-toast-time \{[^}]*transform-origin: left center/);
  assert.match(rule, /\.sh-toast-act \{[^}]*border: 0; background: transparent/);
  assert.match(tsx, /scaleX\(0\)/);
  assert.match(tsx, /dismissToast\(\)/);
  assert.match(tsx, /'Escape'/);
  const sh = useShell.getState();
  sh.say('Paracentesis: up to 5.0 L drained with albumin.');
  assert.equal(useShell.getState().toastRun?.from, 1);
  sh.holdToast(true);
  assert.equal(useShell.getState().toastRun?.paused, true);
  sh.dismissToast();
  assert.equal(useShell.getState().toast, null);
  assert.equal(useShell.getState().toastRun, null);
});

test('P4: a note that explains what the app chose to do is not red; a failure still is', async () => {
  const said: [string, string | undefined][] = [];
  const d: ShareDeps = { loadPatient: async () => true, currentParams: () => ({}), setParams() {}, view: () => 'anatomic', goToView() {}, select() {}, setCamera() {}, say: (t, tone) => said.push([t, tone]) };
  await loadShared({ preset: 'healthy', missing: 'no-such' }, d);
  await loadShared({ preset: 'healthy', fromYours: true }, d);
  assert.deepEqual(said.map((s) => s[1]), [undefined, undefined]);
  assert.match(said[0]![0], /asks for a patient this version doesn’t have/);
  assert.match(src('src/ui/shell/share-wire.ts'), /SHARE_WORDS\.unread, 'bad'/);   // (a link that would not open is a failure)
});

test('P3: the splash notes keep the technical line behind Details (index.html)', () => {
  const html = src('index.html');
  assert.match(html, /data-details>Details<\/button><code hidden>/);
  assert.doesNotMatch(html, /'<code>'\+esc\(detail\)/);
});

test('P6: the treat overrides replace lines the generated table still has, and nothing else changes', () => {
  for (const k of OVERRIDDEN_TOASTS) assert.ok(k in TREAT_WORDS.lines.toasts, `treat.generated.ts has no ${k}`);
  for (const k of Object.keys(TREAT_WORDS.lines.toasts)) if (!OVERRIDDEN_TOASTS.includes(k)) assert.equal((TOAST_WORDS as Record<string, string>)[k], (TREAT_WORDS.lines.toasts as Record<string, string>)[k]);
});

// The voice: "you", plain words, contractions; says what happened and what to do; never blames, never says "error". The clinical cards and teaching text keep their own register and are not scanned.
const BANNED = /\b(could not|did not|does not|do not|cannot|has not|is not|are not|was not|unexpected error|Error)\b/;
function strings(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((v) => strings(v, out)); else if (o && typeof o === 'object') Object.values(o).forEach((v) => strings(v, out));
  return out;
}
test('P6: the user-facing word tables speak in the app\'s voice (no "could not", "did not", "is not", "Error")', () => {
  const all = [
    ...strings(W), W.noPatientCalled('x'), W.notYet('The Circuit view'),
    ...strings({ ...SHARE_WORDS, missing: SHARE_WORDS.missing('x'), clamped: SHARE_WORDS.clamped('a, b') }),
    UPDATE_TOAST, ...OVERRIDDEN_TOASTS.map((k) => (TOAST_WORDS as Record<string, string>)[k]!),
  ];
  assert.ok(all.length > 40);
  for (const s of all) assert.doesNotMatch(s, BANNED, s);
  const html = src('index.html');
  for (const m of html.match(/<p>[^<]*<\/p>/g) ?? []) assert.doesNotMatch(m, BANNED, m);
  for (const f of ['src/ui/shell/send-feedback.ts', 'src/ui/shell/Pages.tsx']) for (const m of src(f).match(/say\('[^']*'/g) ?? []) assert.doesNotMatch(m, BANNED, m);
});

test('no instructional popup is left: the shunt hint card ("Click a glowing vein…") is gone, and no toast or card says "Click a vessel"', () => {
  assert.equal(existsSync(join(root, 'src/ui/action/ShuntHint.tsx')), false);
  assert.doesNotMatch(src('src/ui/action/shunt.ts'), /ShuntHint|createRoot/);
  assert.doesNotMatch(src('src/ui/shell/store.ts') + src('src/ui/shell/words.ts'), /Click a vessel|Tap a vessel/);
});
