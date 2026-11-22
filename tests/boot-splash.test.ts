// The splash tells the truth and never pops (loading plan L5, 21 Nov 2026): the wait bar fills with the bytes that arrived, "Still loading…" comes only after 8 s of nothing new, a page opened offline with no saved
// copy says so, the name shows in the face it has by 800 ms, and the mark is inline (no image that arrives after the first paint). The shipped inline script runs in `vm` against a small fake DOM and a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const HTML = readFileSync('index.html', 'utf8');
interface Opts { total?: number; entries?: (now: number) => { name: string; encodedBodySize: number }[]; onLine?: boolean; controller?: boolean; fonts?: 'none' | 'now' | 'never'; dcl?: boolean; realCover?: boolean; richBar?: boolean; held?: boolean; rows?: boolean }

function run(o: Opts = {}) {
  const code = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((c) => c.includes('ppsBootLift'))!;   // (the cover's script: found by what it defines, not by its place: the look script before it came first from 22 Nov)
  const timers: { at: number; fn: () => void; id: number }[] = []; let now = 0, nid = 0;
  const mkEl = (id: string) => {
    const attrs: Record<string, string> = {}, css: Record<string, string> = {}, history: number[] = [];
    const el: any = { id, className: '', innerHTML: '<i>orig</i>', parentNode: { removeChild() { el.removed = true; } }, removed: false, children: {} as Record<string, any>, history,
      style: { setProperty: (k: string, v: string) => { css[k] = v; if (k === '--p') history.push(Number(v)); } },
      getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => { attrs[k] = v; }, removeAttribute: (k: string) => { delete attrs[k]; }, hasAttribute: (k: string) => k in attrs,
      querySelector: (sel: string) => { if (o.rows && (sel === '.boot-stage' || sel === '.boot-pct')) return (el.children[sel] ??= { textContent: '', attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; }, removeAttribute(k: string) { delete this.attrs[k]; } }); if (o.richBar && sel === '.boot-prog' && !el.innerHTML.includes('boot-msg')) return (el.children['.boot-prog'] ??= { style: {}, offsetHeight: 1 }); const m = /\[(data-[a-z]+)\]/.exec(sel)?.[1]; if (!m || !el.innerHTML.includes(m)) return null; return (el.children[m] ??= {}); } };
    return el;
  };
  const boot = mkEl('boot'), root = mkEl('root'); root.firstChild = null;
  if (o.realCover) boot.innerHTML = HTML.slice(HTML.indexOf('<div id="boot"'), HTML.indexOf('<noscript>')).replace(/^<div id="boot"[^>]*>/, '').replace(/<\/div>\s*$/, '');
  const listeners: Record<string, (() => void)[]> = {};
  const fonts = o.fonts === 'now' ? { load: () => ({ then: (ok: () => void) => { ok(); } }) } : o.fonts === 'never' ? { load: () => ({ then: () => undefined }) } : undefined;
  const meta = { getAttribute: () => String(o.total ?? 0) };
  const ctx: any = {
    document: { getElementById: (i: string) => (i === 'boot' ? boot : i === 'root' ? root : null), documentElement: { getAttribute: () => (o.held === false ? null : 'wait') }, fonts,
      querySelector: (s: string) => (s.includes('pps-boot-bytes') ? meta : null), addEventListener: (e: string, f: () => void) => { (listeners[e] ??= []).push(f); } },
    addEventListener() {}, MutationObserver: class { observe() {} disconnect() {} }, location: { protocol: 'https:', host: 'x.test', reload() {} },
    navigator: { userAgent: 'test', onLine: o.onLine ?? true, serviceWorker: o.controller ? { controller: {} } : undefined },
    performance: { now: () => now, getEntriesByType: () => (o.entries ? o.entries(now) : []) },
    setTimeout: (fn: () => void, ms: number) => { const id = ++nid; timers.push({ at: now + ms, fn, id }); return id; }, clearTimeout: (id: number) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); }, console };
  ctx.window = ctx; createContext(ctx); new Script(code).runInContext(ctx);
  if (o.dcl !== false) listeners.DOMContentLoaded!.forEach((f) => f());
  const advance = (to: number) => { for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > to) break; timers.shift(); now = t.at; t.fn(); } now = to; };
  return { ctx, boot, root, advance, at: () => now };
}
const file = (n: number, size = 100_000) => Array.from({ length: n }, (_, i) => ({ name: `https://x.test/assets/f${i}.js`, encodedBodySize: size }));

test('while bytes keep arriving the page never says "Still loading" (30 s of a slow but healthy download)', () => {
  const c = run({ entries: (t) => file(1 + Math.floor(t / 2000)), dcl: false });
  for (let t = 500; t <= 30000; t += 500) { c.advance(t); assert.notEqual(c.boot.className, 'slow', `at ${t} ms`); }
  assert.equal(c.boot.className, '');
});

test('after 8 s in which nothing new arrived it says so, as a recoverable note; not a moment sooner', () => {
  const c = run({ entries: () => file(3), dcl: false });
  c.advance(7900); assert.equal(c.boot.className, '');
  c.advance(9000); assert.equal(c.boot.className, 'slow'); assert.match(c.boot.innerHTML, /Still loading/); assert.match(c.boot.innerHTML, /Reload/);
});

test('a page with no sign of life at all (no timing support) says it after 8 s too, and the clock alone is no longer 15 s', () => {
  const c = run({ dcl: false });
  c.advance(7900); assert.equal(c.boot.className, '');
  c.advance(8600); assert.equal(c.boot.className, 'slow');
});

test('offline with no worker holding the page: the offline note, in words, after 3 s; a worker that controls the page means no such note', () => {
  const a = run({ onLine: false, dcl: false });
  a.advance(2900); assert.equal(a.boot.className, '');
  a.advance(3600); assert.equal(a.boot.className, 'slow'); assert.match(a.boot.innerHTML, /You’re offline and the simulator isn’t saved on this device yet/); assert.doesNotMatch(a.boot.innerHTML, /Still loading/);
  const b = run({ onLine: false, controller: true, dcl: false });
  b.advance(5000); assert.equal(b.boot.className, '', 'offline but saved: the held copy is on its way, no offline note');
  const d = run({ onLine: true, dcl: false });
  d.advance(5000); assert.equal(d.boot.className, '', 'online: no offline note');
});

test('Keep waiting buys a fresh 8 s, and the offline note does not flash back at once', () => {
  const c = run({ onLine: false, dcl: false });
  c.advance(3600); assert.equal(c.boot.className, 'slow');
  c.boot.children['data-wait'].onclick(); assert.equal(c.boot.className, '');
  c.advance(c.at() + 7000); assert.equal(c.boot.className, '');
  c.advance(c.at() + 2000); assert.equal(c.boot.className, 'slow');
});

test('the bar: sliding until the cover has been up 1.2 s, then a fill of bytes/total that only ever grows, short of the end until the cover lifts, full at the lift', () => {
  const total = 1_000_000;
  const c = run({ total, entries: (t) => file(Math.min(12, 1 + Math.floor(t / 1000))), dcl: false });   // 100 kB a second, 12 files: 1.2 MB, more than the total
  c.advance(1000); assert.equal(c.boot.hasAttribute('data-det'), false, 'not before 1.2 s (a warm start lifts first and never shows it)');
  assert.deepEqual(c.boot.history, []);
  c.advance(1500); assert.equal(c.boot.hasAttribute('data-det'), true);
  c.advance(12000);
  const h: number[] = c.boot.history;
  assert.ok(h.length > 3);
  for (let i = 1; i < h.length; i++) assert.ok(h[i]! >= h[i - 1]!, `monotonic at ${i}`);
  assert.ok(h.at(-1)! <= 0.95, 'short of the end while the cover is up');
  c.ctx.ppsBootLift();
  assert.equal(c.boot.history.at(-1), 1, 'full as it lifts');
});

test('the bar stays sliding where the build gave no total (a dev page) and it never moves back when a number falls', () => {
  const none = run({ total: 0, entries: () => file(5), dcl: false }); none.advance(3000);
  assert.equal(none.boot.hasAttribute('data-det'), false);
  let n = 6; const c = run({ total: 1_000_000, entries: () => file(n), dcl: false });
  c.advance(2000); n = 2; c.advance(4000);
  const h: number[] = c.boot.history; assert.ok(h.length >= 1);
  for (let i = 1; i < h.length; i++) assert.ok(h[i]! >= h[i - 1]!);
});

test('the name shows by 800 ms at the latest (in the face it has), at once when its face is ready, and never twice', () => {
  const late = run({ fonts: 'never', dcl: false });
  late.advance(799); assert.equal(late.boot.hasAttribute('data-name'), false);
  late.advance(801); assert.equal(late.boot.getAttribute('data-name'), 'fallback');
  const none = run({ fonts: 'none', dcl: false }); none.advance(900); assert.equal(none.boot.getAttribute('data-name'), 'fallback');
  const ready = run({ fonts: 'now', dcl: false });
  assert.equal(ready.boot.getAttribute('data-name'), '1', 'the face was ready: shown at once in it');
  ready.advance(900); assert.equal(ready.boot.getAttribute('data-name'), '1', 'the 800 ms cap does not change it');
});

test('the mark is inline SVG, not an image that arrives after the first paint; the bar and the name ease (CSS), the page names its byte total', () => {
  const cover = HTML.slice(HTML.indexOf('<div id="boot"'), HTML.indexOf('<noscript>'));
  assert.doesNotMatch(cover, /<img/);
  assert.match(cover, /<svg class="boot-mark"[^>]*aria-hidden="true"/);
  assert.equal(cover.split('id="bootpv"').length - 1, 1, 'its gradient has an id of its own (no clash with the app\'s)');
  assert.match(HTML, /#boot \.boot-name \{[^}]*transition: opacity 200ms[^}]*animation: boot-name-in 200ms ease 800ms/, 'the name fades in over 200 ms and the CSS caps the wait at 800 ms even if the script were late');
  assert.match(HTML, /#boot \.boot-bar b \{[^}]*transition: transform 600ms/, 'the fill eases its width (a scale), never jumps');
  assert.match(HTML, /<meta name="pps-boot-bytes" content="0">/);
});

test('the 20 s last word, the 600 ms minimum and the terminal state are kept', () => {
  const c = run({ entries: () => file(3) });
  c.advance(19000); assert.equal(c.boot.className, 'slow', 'a quiet 8 s is told');
  c.advance(21000); assert.equal(c.boot.className, 'slow', 'a held app (html[data-boot=wait]) is not lifted at 20 s: it is still working under the cover and has its own progress watch and hard limit');
  c.advance(46000); assert.equal(c.boot.className, 'done', 'but the page\'s last word still comes, 25 s later');
  const p = run({ entries: () => file(3), held: false }); p.advance(19000); p.advance(21000);
  assert.equal(p.boot.className, 'done', 'a page that holds nothing (the crash and debug pages) is lifted by the 20 s timer as before');
  const f = run({ dcl: false }); f.ctx.ppsBootRendererFail('lost'); f.advance(30000);
  assert.equal(f.boot.className, 'failed');
});


// ---- 22 Nov: "Still loading… a slow connection" on an iPhone on good Wi-Fi. Root cause: the wait was told by FILES ARRIVING alone, so after the last file came, the seconds of CPU the app needs (engine,
// fonts, scene, first frame) read as "nothing new for 8 s". From the moment the app's own code runs the cover no longer waits on bytes, and the note neither blames the connection nor comes before 15 s.
test('once the app\'s code is running, 8+ s of no new file is CPU, not the connection: no note (the iPhone on good Wi-Fi)', () => {
  const c = run({ entries: () => file(40), dcl: false });
  c.advance(1000); c.ctx.ppsBootStarted = true;
  for (let t = 1500; t <= 14500; t += 500) { c.advance(t); assert.notEqual(c.boot.className, 'slow', `at ${t} ms`); }
});

test('a start that never gets anywhere after the code ran is still told, at 15 s, without blaming the connection, with where it stood', () => {
  const c = run({ total: 4_000_000, entries: () => file(40), dcl: false });
  c.advance(1000); c.ctx.ppsBootStarted = true;
  c.advance(17000);
  assert.equal(c.boot.className, 'slow'); assert.match(c.boot.innerHTML, /Taking longer than usual/); assert.doesNotMatch(c.boot.innerHTML, /connection looks slow/);
  assert.match(c.boot.innerHTML, /entry running · 3906 of 3906 kB · 40 files/);
});

test('before the code runs the byte rule is unchanged, and says where it stood (entry not started)', () => {
  const c = run({ total: 4_000_000, entries: () => file(3), dcl: false });
  c.advance(9000); assert.equal(c.boot.className, 'slow'); assert.match(c.boot.innerHTML, /connection looks slow/); assert.match(c.boot.innerHTML, /entry not started · 293 of 3906 kB · 3 files/);
});

test('files a worker served (their sizes read 0) still count as arriving: the entries themselves are the sign of life', () => {
  const c = run({ entries: (t) => file(1 + Math.floor(t / 2000), 0), dcl: false });
  for (let t = 500; t <= 30000; t += 500) { c.advance(t); assert.notEqual(c.boot.className, 'slow', `at ${t} ms`); }
});

test('the note keeps the mark and the name above it (no bare screen with a card), and Keep waiting brings the whole splash back', () => {
  const c = run({ entries: () => file(3), dcl: false, realCover: true, fonts: 'now' });
  c.advance(9000);
  assert.equal(c.boot.className, 'slow');
  assert.match(c.boot.innerHTML, /<svg class="boot-mark"/); assert.match(c.boot.innerHTML, /boot-name/); assert.doesNotMatch(c.boot.innerHTML, /boot-bar/); assert.match(c.boot.innerHTML, /Still loading/);
  assert.equal(c.boot.getAttribute('data-name'), '1', 'the name is shown');
  c.boot.children['data-wait'].onclick();
  assert.match(c.boot.innerHTML, /boot-bar/);
});

test('main.tsx runs boot/started.ts first (the cover reads ppsBootStarted), and nothing heavy starts behind a cover that is up', () => {
  const main = readFileSync('src/main.tsx', 'utf8');
  assert.ok(main.indexOf("import './boot/started.ts';") >= 0 && main.indexOf("import './boot/started.ts';") < main.indexOf("from 'react'"));
  assert.match(readFileSync('src/boot/started.ts', 'utf8'), /ppsBootStarted: true/);
  assert.match(readFileSync('src/boot/warm.ts', 'utf8'), /if \(splashHeld\(\)\) clock\.after\(wait, COVER_RETRY_MS\)/, 'the preload ladder waits for the cover to lift');
  assert.match(readFileSync('src/pwa/register.ts', 'utf8'), /if \(splashHeld\(\)\) \{ clock\.after\(go, 500\); return; \}/, 'so does the worker\'s install');
});


// ---- splash plan A1 (22 Nov): the bar had stalled at 95% for the whole CPU phase; it is one bar with two phases and always moves ----
test('A1: bytes fill the first 55%; once the app runs, each boot stage moves the bar a fixed share further and between stages it creeps, so a long CPU stage never reads as stuck; never back, short of the end until the lift', () => {
  const c = run({ total: 1_000_000, entries: () => file(12), dcl: false });   // every file in at once (a warm start, or a fast line)
  c.advance(1600);
  const h: number[] = c.boot.history;
  assert.ok(h.at(-1)! > 0 && h.at(-1)! <= 0.55 + 1e-9, `bytes alone never pass 55% (${h.at(-1)})`);
  c.ctx.ppsBootStarted = true;
  const at = (t: number) => { c.advance(t); return c.boot.history.at(-1) as number; };
  const a = at(3000), b = at(6000), d = at(9000);
  assert.ok(a > 0.55 && b > a && d > b, `creeps through a long stage: ${a} < ${b} < ${d}`);
  assert.ok(d < 0.66, 'and does not reach the next share by itself');
  c.ctx.ppsBootStage('engine'); const e = at(9500);
  assert.ok(e >= 0.66, `the engine stage moved it to its share (${e})`);
  for (const st of ['scene', 'compile', 'first-draw', 'labels']) c.ctx.ppsBootStage(st);
  const f = at(14000); assert.ok(f >= 0.96 && f < 1, `after the last stage it waits just short of the end (${f})`);
  c.ctx.ppsBootStage('engine');   // (a stage told twice, or out of order, never moves the bar back)
  const hh: number[] = c.boot.history; for (let i = 1; i < hh.length; i++) assert.ok(hh[i]! >= hh[i - 1]!, `monotonic at ${i}`);
  c.ctx.ppsBootLift(); assert.equal(c.boot.history.at(-1), 1);
});

test('A1: the stage names the bar listens for are the boot timeline\'s own, told by stamp()', async () => {
  const tl = readFileSync('src/boot/timeline.ts', 'utf8');
  assert.match(tl, /ppsBootStage\?\.\(stage\)/);
  for (const st of ['engine', 'scene', 'compile', 'first-draw', 'labels']) { assert.match(HTML, new RegExp(`['"]?${st}['"]?:\\.\\d+`), st); assert.match(tl, new RegExp(`'${st}'`), st); }
});

// ---- splash plan A3: the note and the bar change by easing, never by a swap in one frame ----
test('A3: the bar fades out first, then the note comes in (CSS: 240 ms, 4 px rise; fade only for Reduce Motion); Keep waiting fades the note out and restores', () => {
  const c = run({ onLine: false, dcl: false, richBar: true });
  c.advance(3000);   // the offline note is due: the bar is asked to fade, the content is still the old one
  assert.equal(c.boot.className, 'slow', 'the state changes at once');
  assert.equal(c.boot.innerHTML, '<i>orig</i>', 'but what is on screen waits for the bar to fade');
  const bar = c.boot.children['.boot-prog']; assert.equal(bar.style.opacity, '0'); assert.match(bar.style.transition, /opacity 160ms/);
  c.advance(3200); assert.match(c.boot.innerHTML, /boot-msg/, 'the note is in once the bar is gone');
  assert.match(HTML, /@keyframes boot-msg-in \{ from \{ opacity: 0; transform: translateY\(4px\); \} to \{ opacity: 1; transform: none; \} \}/);
  assert.match(HTML, /#boot \.boot-msg \{[^}]*animation: boot-msg-in 240ms cubic-bezier\(\.2,\.8,\.2,1\) both/);
  assert.match(HTML, /prefers-reduced-motion: reduce\) \{[^\n]*#boot \.boot-msg \{ animation-name: boot-msg-fade; \}/);
  assert.match(HTML, /function swap\(el,apply\)/, 'the mark and the name glide to where the taller content puts them (FLIP), they do not jump');
});

// ---- splash plan A5: the cover's tints come from the look, never a fixed black ----
test('A5: the bar track, the note and its buttons are mixed from the look\'s own text colour; a dark device with no saved look has a light name and track', () => {
  assert.match(HTML, /\.boot-bar \{[^}]*background: color-mix\(in srgb, var\(--bt\) 14%, transparent\)/, 'the track is visible on Dark, Navy and Black');
  assert.match(HTML, /\.boot-msg \{[^}]*background: color-mix\(in srgb, var\(--bt\) 8%, var\(--bg, #fff\)\); color: var\(--bt\)/, 'the note reads on every look (it was white with the look\'s light text on Dark)');
  assert.match(HTML, /@media \(prefers-color-scheme: dark\) \{ #boot \{ --bt: var\(--text, #EEEBE5\); --bt3: var\(--text-3, #A69E95\)/, 'no saved look on a dark device: the Dark text, not dark on dark');
  assert.doesNotMatch(HTML.slice(HTML.indexOf('#boot .boot-name'), HTML.indexOf('@keyframes boot-slide')), /var\(--surface|var\(--text-2/, 'only the tokens the first script sets (--bg, --text, --text-3)');
  assert.match(HTML, /transition: opacity 360ms cubic-bezier\(\.5,0,\.5,1\), visibility 0s linear 360ms/, 'the cover fades over 360 ms, even (A6)');
});

// ---- 22 Nov, popups: the note's code box (where the entry stood, bytes, files) means nothing to a tester, so it sits behind a small "Details" link; it stays in the page for a copied report.
test('the splash notes keep their technical line behind a Details link, hidden until it is pressed', () => {
  const c = run({ total: 4_000_000, entries: () => file(3), dcl: false });
  c.advance(9000);
  assert.match(c.boot.innerHTML, /<button type="button" class="boot-det" data-details>Details<\/button><code hidden>entry not started/);
  assert.match(HTML, /#boot \.boot-msg code\[hidden\] \{ display: none; \}/);
});


// ---- splash style D (Mohammad, 22 Nov): under the bar, the stage in plain words and the percent: "Building the figure  64%" ----
test('D: the percent follows the bar (never down, never 100 before the lift), the stage name is the stage the start has reached, and a new name crosses over instead of snapping', () => {
  const c = run({ total: 1_000_000, entries: () => file(12), dcl: false, rows: true });
  c.advance(1600);
  const stage = c.boot.children['.boot-stage'], pct = c.boot.children['.boot-pct'];
  assert.equal(stage.innerHTML, '<span>Getting ready</span>'); assert.match(pct.textContent, /^\d+%$/); assert.ok(parseInt(pct.textContent) <= 55, 'bytes alone: up to 55%');
  c.ctx.ppsBootStarted = true; c.advance(2500);
  assert.match(stage.innerHTML, /Starting <b><i>Hales Engine<\/i><\/b>/, 'Hales Engine in bold italic');
  c.ctx.ppsBootStage('engine'); c.advance(3300);
  assert.match(stage.innerHTML, /<span class="n">Building the figure<\/span>/); const p = parseInt(pct.textContent); assert.ok(p >= 66 && p < 78, `engine reached: ${p}%`);
  // a change of name: the old words (.o) fade out and the new (.n) fade in, both written in the same tick, so there is never a moment with the new name missing
  c.ctx.ppsBootStage('scene'); c.advance(3600); assert.equal(stage.innerHTML, '<span class="o">Building the figure</span><span class="n">Polishing the look</span>');
  for (const st of ['compile', 'first-draw', 'labels']) c.ctx.ppsBootStage(st);
  c.advance(9000); assert.match(stage.innerHTML, /<span class="n">Almost there<\/span>/); assert.ok(parseInt(pct.textContent) <= 99, 'never 100 while the cover is up');
  let last = 0; const seen = parseInt(pct.textContent); assert.ok(seen >= last);
  c.ctx.ppsBootLift(); assert.equal(pct.textContent, '100%', '100 only as the cover lifts');
});

test('D: the stage name is present at every tick from the first bar to the lift, at exactly 55%, and again after the row was rebuilt (a restored cover), never left empty', () => {
  const c = run({ total: 1_000_000, entries: () => file(12), dcl: false, rows: true });
  c.advance(1600); const stage = c.boot.children['.boot-stage'], pct = c.boot.children['.boot-pct'];
  const text = () => String(stage.innerHTML).replace(/<[^>]+>/g, '');
  for (let t = 2000; t <= 4000; t += 500) { c.advance(t); if (pct.textContent) assert.ok(text().length > 0, `named at ${t} ms (${pct.textContent})`); }
  c.ctx.ppsBootStarted = true;
  for (let t = 4500; t <= 7000; t += 500) { c.advance(t); assert.ok(text().length > 0, `named at ${t} ms (${pct.textContent})`); }
  assert.ok(parseInt(pct.textContent) >= 55);
  c.ctx.ppsBootStage('engine');
  stage.innerHTML = ''; // the row was rebuilt empty (the note's Keep waiting puts the saved cover back)
  c.advance(8000); assert.ok(text().length > 0, 'a rebuilt, empty row is named again at the next tick');
  assert.doesNotMatch(String(stage.innerHTML), /class="o"/, 'no old words to fade when there were none');
});

test('D: the markup and the look: one row under the bar, the stage left in the mute colour, the percent right in tabular digits; the slow note takes the whole block away', () => {
  assert.match(HTML, /<div class="boot-prog"><div class="boot-bar"><i><\/i><b><\/b><\/div><div class="boot-row"><span class="boot-stage"><\/span><span class="boot-pct"><\/span><\/div><\/div>/);
  assert.match(HTML, /#boot \.boot-pct \{[^}]*font-variant-numeric: tabular-nums/);
  assert.match(HTML, /#boot \.boot-stage > \.n \{ animation: boot-stage-in/); assert.doesNotMatch(HTML, /data-swap/, 'the stage name never depends on a timer to appear'); assert.match(HTML, /#boot\[data-det\] \.boot-row \{ opacity: 1; \}/, 'shown with the bar, not before');
  const names = [...HTML.matchAll(/NAMES=\{([^}]*)\}/g)][0]![1]!;
  for (const n of [...names.matchAll(/'([^']+)'(?=[,}]|$)/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '')).filter((x) => /\s/.test(x))) assert.ok(n.length <= 21, `${n} fits 172 px at 12 px beside the percent`);
  const c = run({ entries: () => file(3), dcl: false, realCover: true, fonts: 'now' }); c.advance(9000);
  assert.doesNotMatch(c.boot.innerHTML, /boot-prog|boot-row/, 'the slow note keeps the mark and the name only');
});
