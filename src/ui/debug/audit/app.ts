// ?audit: the app's side (the only file of the audit that touches the page): the steps to walk, the sampler, the frame tap, the console tap and the layout read.
// Debug only; every read is a tap of the walk or the sampler's 33 ms timer, never a frame. The clock is only listened to (a system on its last phase), never asked for frames.
import { UI } from '../../strings.generated.ts';
import { builtinDecks } from '../../../decks/registry.ts';
import { useShell } from '../../shell/store.ts';
import { useUi } from '../../ui-store.ts';
import { leaveTalk } from '../../shell/talk.ts';
import { loadPatient } from '../../menu/patients.ts';
import { clock } from '../../../clock/frame.ts';
import { createRecorder } from '../watch/recorder.ts';
import { domSources } from '../watch/sources.ts';
import { liveCatalog, openEntry, settle as pageSettle, problems } from '../page/live.ts';
import type { Entry } from '../page/catalog.ts';
import { scanPage } from './scan.ts';
import { startLedger } from './ledger.ts';
import type { Step, Reads } from './run.ts';
import type { Box, LayoutRead } from './judge.ts';
import type { ConsoleLine, Coverage, RowGpu } from './report.ts';
import { renderStats } from '../../../debug/render-stats.ts';
import { cel } from '../../../scene/api.ts';
import { speedAnimations, sampleRealMs } from './speed.ts';

export const SAMPLE_MS = 33;
export const QUIET_MS = 300;   // (the page must be still this long before a step counts as settled: the shortest the checks can use; the copied 2D default for a replay is 600)
export const settle = () => pageSettle({ timeoutMs: 45000, quietMs: QUIET_MS, pollMs: 50 });
const sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
/** Waits (up to `ms`) for something an open starts asynchronously (a talk's cover, its charts, its first cards), so the walk's "is the page still?" never reads the instant before it begins. */
const until = async (cond: () => boolean, ms: number) => { const t = performance.now(); while (!cond() && performance.now() - t < ms) await sleep(50); };
const talkUp = () => useShell.getState().mode === 'deck' && useUi.getState().stops.length > 0 && !!document.querySelector('.dk-card[data-phase="in"]');

// ── the steps ──
const SHEETS_QUICK = ['sheet:settings', 'sheet:help'];

/** What the walk does, in the order a person would: the views, the sheets, the patients (the collaterals grow and collapse), then every talk slide by slide with Next. A generator, because how many presses a slide takes (beats, pages, a procedure's steps) is known only by pressing. */
export async function* plan(depth: 'quick' | 'full', note: (s: string) => void, cover: (c: Coverage) => void = () => undefined): AsyncGenerator<Step> {
  const cat = liveCatalog();
  const entry = (id: string): Entry | undefined => cat.find((e) => e.id === id);
  const open = (id: string): Step | null => { const e = entry(id); return e ? { group: e.group, id, label: e.label, run: async () => { await openEntry(e); if (id.startsWith('slide:')) await until(talkUp, 25000); } } : null; };
  const shell = useShell.getState();
  const keep = { collaterals: shell.figure.collaterals, patient: shell.patientId };
  const views = ['view:anatomic', 'view:lobule', 'view:sinusoid', 'view:anatomic'].map(open);
  for (const s of views) if (s) yield s;
  for (const id of (depth === 'quick' ? SHEETS_QUICK : cat.filter((e) => e.section === 'sheet').map((e) => e.id))) { const s = open(id); if (s) yield s; }
  yield { group: 'Views', id: 'sheet:close', label: 'close the sheet', run: () => { useShell.setState({ sheet: null, dialog: null }); } };
  // the patients: the collaterals grow (healthy to decompensated), collapse (switched off) and grow back, then come away again
  const pt = (id: string, label: string): Step => ({ group: 'Patients', id: `patient:${id}`, label, run: async () => { await loadPatient(id); } });
  yield pt('healthy', 'Healthy');
  yield pt('cirr-decomp', 'Decompensated (collaterals grow)');
  yield { group: 'Patients', id: 'collaterals:off', label: 'collaterals off (collapse)', run: () => useShell.getState().setFigure({ collaterals: false }) };
  yield { group: 'Patients', id: 'collaterals:on', label: 'collaterals on (grow)', run: () => useShell.getState().setFigure({ collaterals: true }) };
  yield pt('healthy', 'Healthy again (collaterals collapse)');
  if (depth === 'full') for (const p of UI.presets) { if (p.id !== 'healthy' && p.id !== 'cirr-decomp') yield pt(p.id, p.label); }
  // the talks: each one is opened straight at its outline, then every stop is jumped to by number (never by pressing Next from the one before, so a stop that will not advance cannot end the walk),
  // and a stop with beats is pressed through them. A stop the jump did not land on is named in the coverage, never skipped quietly.
  for (const d of builtinDecks()) {
    const first = open(`slide:${d.id}:0`);
    if (!first) { note(`talk ${d.id} is not in the catalog`); continue; }
    yield { ...first, label: 'outline (opening the talk)' };
    const total = useUi.getState().stops.length;
    const cov: Coverage = { deck: d.title, reached: total ? 1 : 0, total: total || d.slides.length + 2, missed: [] };
    cover(cov);
    if (!total) { note(`${d.title}: the talk did not open (no stops after 25 s)`); continue; }
    const want = depth === 'quick' ? Array.from(new Set([1, Math.ceil(total / 2), total - 2, total - 1])).filter((k) => k >= 1 && k < total).sort((x, y) => x - y) : Array.from({ length: total - 1 }, (_, i) => i + 1);
    for (const k of want) {
      yield { group: d.title, id: `${d.id}:go:${k}`, label: `stop ${k + 1} of ${total}`, run: async () => { useUi.getState().go(k); await until(() => useUi.getState().pos.stop === k, 4000); return where(d.title); } };
      const u = useUi.getState();
      if (u.pos.stop !== k) { cov.missed.push(k + 1); note(`${d.title}: the jump to stop ${k + 1} of ${total} landed on stop ${u.pos.stop + 1}`); continue; }
      cov.reached++;
      const st = u.stops[k], beats = st && st.kind === 'slide' ? st.beats : 1;
      for (let tries = 0; depth === 'full' && tries < beats + 4 && useUi.getState().pos.stop === k && useUi.getState().pos.beat < beats - 1; tries++) {
        yield { group: d.title, id: `${d.id}:beat:${k}:${tries}`, label: 'Next (beat)', run: () => { useUi.getState().move('next'); return where(d.title); } };
      }
    }
    yield { group: d.title, id: `${d.id}:leave`, label: 'leave the talk', run: async () => { leaveTalk(); await until(() => useShell.getState().mode !== 'deck', 15000); } };
  }
  // put the app back as it was
  yield { group: 'Views', id: 'restore', label: 'put the app back', run: async () => { useShell.getState().setFigure({ collaterals: keep.collaterals }); await loadPatient(keep.patient); } };
}

/** Where a Next press landed: "<talk>: slide 4 of 12, beat 2". */
function where(title: string): string {
  const { stops, pos, page } = useUi.getState();
  const st = stops[pos.stop];
  const name = st ? (st.kind === 'slide' ? st.slide.title : st.kind) : '?';
  return `${title}: stop ${pos.stop + 1} of ${stops.length} "${name}"${pos.beat ? `, beat ${pos.beat + 1}` : ''}${typeof page === 'number' && page ? `, page ${page + 1}` : ''}`;
}

// ── the taps ──
export interface Tap {
  mark(): number;
  read(t0: number): Reads;
  stop(): void;
}
const r1 = (v: number) => Math.round(v * 10) / 10;
const BARS: [string, string][] = [['presenter bar', '.dk-bar'], ['dock', '.vd-face'], ['footer credit', '.stage-credit'], ['thumb bar', '.thumb-bar'], ['view pills', '#viewSeg']];
/** How much of an element a person can see: its own opacity times every ancestor's (a faded parent hides a child that reads 1). The dock's own box never fades, its face and bars do, so a bar is the painted part, read by this. */
export function seen(win: Window, el: Element): number {
  let a = 1;
  for (let e: Element | null = el; e && e !== e.ownerDocument.documentElement; e = e.parentElement) a *= parseFloat(win.getComputedStyle(e).opacity);
  return a;
}
/** `seen`, remembered up the tree for one read (a card's 600 elements share their ancestors). */
export function seenMemo(win: Window): (el: Element) => number {
  const m = new Map<Element, number>();
  const f = (el: Element): number => { const hit = m.get(el); if (hit !== undefined) return hit; const up = el.parentElement && el.parentElement !== el.ownerDocument.documentElement ? f(el.parentElement) : 1; const v = up * (parseFloat(win.getComputedStyle(el).opacity) || 0); m.set(el, v); return v; };
  return f;
}
const BAR_SEL = BARS.map((b) => b[1]).join(', ');
const KID_SEL = 'button, [class*="pill"], [class*="chip"], [class*="tile"], svg circle';

/** The box that stays visible for an element: the overlap of every ancestor that clips (overflow other than visible on either axis, or paint containment), or null when nothing clips it. An svg is its own clip (its overflow is hidden by default). */
export function clipBox(win: Window, el: Element, stop: Element): Box | null {
  let box: Box | null = null;
  for (let p: Element | null = el; p && p !== stop.parentElement; p = p.parentElement) {
    const cs = win.getComputedStyle(p);
    const clips = (v: string) => v !== 'visible';
    if (p === el && el.tagName.toLowerCase() !== 'svg') continue;   // (an element is not clipped by itself; an inner svg clips what it draws)
    if (!(clips(cs.overflowX) || clips(cs.overflowY) || /paint|strict|content/.test(cs.contain))) continue;
    const b = p.getBoundingClientRect(), q: Box = [r1(b.left), r1(b.top), r1(b.right), r1(b.bottom)];
    box = box ? [Math.max(box[0], q[0]), Math.max(box[1], q[1]), Math.min(box[2], q[2]), Math.min(box[3], q[3])] : q;
  }
  return box;
}

/** A card's heading, to name it in a finding. */
const titleOf = (card: HTMLElement): string => (card.querySelector('.pz-h, .pz-dtitle, .pz-dh > span:first-child, h1, h2, h3, [class*="title"]')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

/** Charts and plots of one card: an svg or a canvas big enough to be a picture, not an icon. */
function chartsOf(win: Window, card: HTMLElement, vis: (el: Element) => number): { what: string; box: Box; clip: Box | null }[] {
  const out: { what: string; box: Box; clip: Box | null }[] = [];
  for (const el of Array.from(card.querySelectorAll<SVGElement | HTMLCanvasElement>('svg, canvas')).slice(0, 60)) {
    if (el.closest('[aria-hidden="true"], .dk-roll-sizer, .dk-roll-out') && !el.closest('[role="img"]')) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 60 || b.height < 40) continue;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || vis(el) < 0.05) continue;   // (a card whose inner part is faded out, a docked data card, holds charts nobody sees: they are not cut off)
    // the chart's clip is what clips its parents (its own overflow is the svg's, judged by the kids: its text and points)
    const clip = el.parentElement ? clipBox(win, el.parentElement, card) : null;
    out.push({ what: el.getAttribute('aria-label') || (el.tagName === 'CANVAS' ? 'canvas chart' : 'chart'), box: [r1(b.left), r1(b.top), r1(b.right), r1(b.bottom)], clip });
  }
  return out;
}

/** Words, pills, axis labels and data points of one card, each with its box and the box that clips it. */
function kidsOf(win: Window, card: HTMLElement, vis: (el: Element) => number): { what: string; box: Box; clip: Box | null }[] {
  const out: { what: string; box: Box; clip: Box | null }[] = [];
  for (const el of Array.from(card.querySelectorAll<HTMLElement>('*')).slice(0, 600)) {
    if (el.closest('[aria-hidden="true"], .dk-roll-sizer, .dk-roll-out') || el.closest(BAR_SEL)) continue;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue ?? '').trim());
    if (!own && !el.matches(KID_SEL)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || vis(el) < 0.05) continue;
    const what = ((el.textContent ?? '').replace(/\s+/g, ' ').trim() || el.className.toString()).slice(0, 40);
    out.push({ what, box: [r1(b.left), r1(b.top), r1(b.right), r1(b.bottom)], clip: clipBox(win, el, card) });
  }
  return out;
}

export function readLayout(doc: Document = document, win: Window = window): LayoutRead {
  const box = (e: Element): Box => { const b = e.getBoundingClientRect(); return [r1(b.left), r1(b.top), r1(b.right), r1(b.bottom)]; };
  const vis = seenMemo(win);
  const cards = Array.from(doc.querySelectorAll<HTMLElement>('.dk-card[data-phase="in"]')).filter((el) => parseFloat(win.getComputedStyle(el).opacity) >= 0.95)
    .map((el) => ({ id: el.dataset.card ?? 'card', title: titleOf(el), box: box(el), kids: kidsOf(win, el, vis), charts: chartsOf(win, el, vis) }));
  const bars: LayoutRead['bars'] = [];
  for (const [id, sel] of BARS) doc.querySelectorAll<HTMLElement>(sel).forEach((el) => { const b = box(el); if (b[2] - b[0] > 1 && b[3] - b[1] > 1 && seen(win, el) > 0.5) bars.push({ id, box: b }); });
  const labels: LayoutRead['labels'] = [];
  doc.querySelectorAll<HTMLElement>('.lb[data-on]').forEach((el) => labels.push({ name: (el.querySelector('.lb-name')?.textContent ?? '').trim(), box: box(el), alpha: parseFloat(win.getComputedStyle(el).opacity) || 0 }));
  return { vw: win.innerWidth, vh: win.innerHeight, cards, bars, labels };
}

/** Starts listening: the sampler (cards and labels every 33 ms), the clock's frame gaps, the console and the window's errors. One call per run; `stop()` lets go of all of it. */
export function startTaps(win: Window = window, speed = 1): Tap {
  const rec = createRecorder(domSources(win.document, win), { seconds: 120 });
  // (at speed N the page's clock runs N times faster, so the sampler ticks N times as often and its rows stay 33 ms of page time; the CSS animations are played N times faster here)
  const timer = setInterval(() => { speedAnimations(win.document, speed); rec.sample(performance.now()); }, sampleRealMs(SAMPLE_MS, speed));
  let gaps: number[] = [], stalls: { t: number; ms: number }[] = [], skin0 = 0, markAt = 0, sys0: Record<string, number> = {};
  // (`f.dt` is page time: at speed N the real gap is dt / N, which is what the frame rate is judged on)
  const off = clock.on('tags', (f) => { if (f.dt > 0) { gaps.push(f.dt / speed); if (f.dt > 50) stalls.push({ t: f.time - markAt, ms: f.dt }); } }, 2000);
  const lines: ConsoleLine[] = [];
  const stamp = () => `at ${Math.round(performance.now() / 1000)} s`;
  const cons = console, orig = { error: cons.error, warn: cons.warn };
  const text = (a: unknown[]) => a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ').slice(0, 400);
  cons.error = (...a: unknown[]) => { lines.push({ level: 'error', text: text(a), at: stamp() }); orig.error.apply(cons, a as []); };
  cons.warn = (...a: unknown[]) => { lines.push({ level: 'warn', text: text(a), at: stamp() }); orig.warn.apply(cons, a as []); };
  const onErr = (e: ErrorEvent) => lines.push({ level: 'window', text: `${e.message} (${e.filename ?? ''}:${e.lineno ?? ''})`.slice(0, 400), at: stamp() });
  const onRej = (e: PromiseRejectionEvent) => lines.push({ level: 'promise', text: text([e.reason]), at: stamp() });
  win.addEventListener('error', onErr); win.addEventListener('unhandledrejection', onRej);
  const ledger = startLedger(win.document, win);
  let mark = 0, markLine = 0, hiddenSince = false;
  const onVis = () => { if (win.document.hidden) hiddenSince = true; };
  win.document.addEventListener('visibilitychange', onVis);
  return {
    mark() { rec.clear(); ledger.mark(); gaps = []; stalls = []; clock.resetStats(); skin0 = cel.skinStats?.rebuilds ?? 0; sys0 = { ...(cel.systemMs ?? {}) }; markAt = performance.now(); markLine = lines.length; hiddenSince = win.document.hidden; mark = performance.now(); return mark; },
    read(t0) {
      const st = clock.stats(), led = ledger.read();
      const rs = renderStats();
      const gpu: RowGpu | null = rs ? {
        calls: rs.calls, triangles: rs.triangles, programs: rs.programs, geometries: rs.geometries, textures: rs.textures, skinRebuilds: (cel.skinStats?.rebuilds ?? 0) - skin0,
        boundCpu: st.boundCpu, boundGpu: st.boundGpu,
        systemMs: Object.entries(cel.systemMs ?? {}).map(([k, v]) => [k, r1(v - (sys0[k] ?? 0))] as [string, number]).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 6),
        slow: st.slow.slice(0, 3).map((f) => { const g = f.gl as { calls?: number; triangles?: number } | undefined; return { ms: r1(f.ms), gap: r1(f.gap), bound: f.bound, tags: f.tags, calls: g?.calls, triangles: g?.triangles }; }),
      } : null;
      return {
        stalls: stalls.slice(), gpu,
        samples: rec.samples().filter((s) => s.t >= t0).map((s) => ({ ...s, t: s.t - t0 })), gaps: gaps.slice(), work: { p95: st.p95, max: st.max },
        layout: safe(() => readLayout(win.document, win)), problems: safe(() => problems()) ?? [], console: lines.slice(markLine), hidden: hiddenSince || win.document.hidden,
        scan: safe(() => scanPage(win.document, win)), anims: led.anims, generic: led.findings,
      };
    },
    stop() { clearInterval(timer); ledger.stop(); off(); cons.error = orig.error; cons.warn = orig.warn; win.removeEventListener('error', onErr); win.removeEventListener('unhandledrejection', onRej); win.document.removeEventListener('visibilitychange', onVis); void mark; },
  };
}
const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
export { sleep };
