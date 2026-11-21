// ?audit: the report. One AuditData per screen size (what a run produced), one Bundle for the whole session; `renderText` is what Copy puts on the clipboard (short: what failed, grouped,
// with where, then the slowest and the choppiest), `renderJson` the whole table (every step, every size) for an agent to read. Pure: a Node test builds and reads them.
import type { AuditFinding, FrameStats, Sev } from './judge.ts';
import type { AnimRec } from './ledger.ts';
import { CHECKS, GAPS } from './scan-judge.ts';
import { FRAME_LIMITED_KINDS, FRAME_LIMIT_SPEED } from './speed.ts';
import { memoryClimb, LEAK_BASELINE_STEPS } from '../../../debug/render-stats.ts';

export interface AuditSize { id: string; w: number; h: number; dpr: number }
/** What the renderer and the clock saw during a step (code review 21 Nov #4 #5 #6): the last frame's draw calls and triangles, the live programs, geometries and textures (`gl.info`), the junction-skin rebuilds that ran,
 *  how many slow frames waited on the scripts and how many on the GPU or compositor, and the slowest frames with who asked for them. */
export interface RowGpu {
  calls: number; triangles: number; programs: number; geometries: number; textures: number;
  skinRebuilds: number; boundCpu: number; boundGpu: number;
  slow: { ms: number; gap: number; bound: 'cpu' | 'gpu/compositor' | null; tags: string[]; calls?: number; triangles?: number }[];
}
export interface AuditRow {
  group: string; id: string; label: string;
  /** ms from the step's start until the page was still (cards in, camera stopped, nothing running) */
  busyMs: number; settled: boolean;
  /** ms from the step's start until the last card stopped changing, or null when no card changed */
  cardsMs: number | null;
  /** the longest card fade in and out, ms (null: none seen) */
  fadeIn: number | null; fadeOut: number | null;
  frames: FrameStats;
  flags: AuditFinding[];
  /** the CSS animations and transitions that ran in the step (the first 60), and how many there were in all */
  anims?: AnimRec[]; animN?: number;
  /** how much the page sweep read: words, pictures, covered-checks, and whether it was capped */
  scan?: { texts: number; media: number; hit: number; capped: boolean } | null;
  /** the renderer and stall instruments for the step; null when the renderer was not up */
  gpu?: RowGpu | null;
}
export interface ConsoleLine { level: 'error' | 'warn' | 'window' | 'promise'; text: string; at: string }
/** How much of a talk the walk reached: stops opened of the stops it has, and the numbers (1-based) of the ones the jump did not land on. */
export interface Coverage { deck: string; reached: number; total: number; missed: number[] }
export interface AuditData {
  size: AuditSize; build?: string; ms: number; depth: 'quick' | 'full'; stopped: boolean;
  rows: AuditRow[]; console: ConsoleLine[]; notes: string[]; coverage?: Coverage[];
  /** the page's clock speed for the run (`?audit&speed=N`), absent at 1 */
  speed?: number;
}
export interface Bundle {
  build: string; device: string; at: string; depth: 'quick' | 'full'; framed: boolean;
  /** the sizes ran at the same time: frame rates and timings are not valid */
  parallel?: boolean;
  /** `?audit&speed=N` ran the page's clock N times faster: fades and settle times are page time, but frame rates are NOT valid; stalls ARE (a frame gap is measured in real time) */
  speed?: number;
  /** wall-clock ms of the whole run */
  wallMs?: number;
  parts: AuditData[]; failed: { size: string; why: string }[];
}

/** A step is slow past this (ms until still); a talk's entry has its own cover, so the budget is generous. Frame rates under LOW_FPS while moving are called out. */
export const SLOW_BUSY_MS = 4000, LOW_FPS = 30;

const where = (p: AuditData, r: AuditRow) => `${p.size.id} ${r.group} > ${r.label}`;
const sevRank: Record<Sev, number> = { fail: 0, warn: 1, note: 2 };
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const mins = (ms: number) => (ms >= 90000 ? `${(ms / 60000).toFixed(1)} min` : `${Math.round(ms / 1000)} s`);

export interface Group { kind: string; sev: Sev; what: string; places: string[] }
/** Every finding of every step, the same finding on many steps folded into one line with its places. Failures first, then the commonest. */
/** Findings that are timings: a run with the sizes at the same time shares one computer, so these are not valid there and are left out (and counted). */
export const TIMING_KINDS = new Set(['stall', 'low-fps', 'slow-load', 'fade-slow', 'unsettled', 'gpu-bound', 'fade-under-stall']);
/** Frame-based timings are not valid at `?audit&speed=N` over 1: the frames do not run faster, only the page's clock does (settle and fade lengths stay valid, in page time). */
export const SPEED_INVALID = new Set(['low-fps', 'gpu-bound', 'fade-under-stall']);
export const dropsFinding = (b: Bundle, kind: string): boolean => (!!b.parallel && TIMING_KINDS.has(kind)) || ((b.speed ?? 1) > 1 && SPEED_INVALID.has(kind)) || ((b.speed ?? 1) > FRAME_LIMIT_SPEED && FRAME_LIMITED_KINDS.has(kind));

export function groupFindings(b: Bundle): Group[] {
  const m = new Map<string, Group>();
  for (const p of b.parts) for (const r of p.rows) for (const f of r.flags) {
    if (dropsFinding(b, f.kind)) continue;
    const k = `${f.kind}|${f.what}`;
    const g = m.get(k) ?? { kind: f.kind, sev: f.sev, what: f.what, places: [] };
    g.places.push(where(p, r)); m.set(k, g);
  }
  return [...m.values()].sort((a, b) => sevRank[a.sev] - sevRank[b.sev] || b.places.length - a.places.length);
}

/** The console lines, the same text folded, with how many times and where it first came. */
export function groupConsole(b: Bundle): { level: string; text: string; n: number; first: string }[] {
  const m = new Map<string, { level: string; text: string; n: number; first: string }>();
  for (const p of b.parts) for (const c of p.console) {
    const k = `${c.level}|${c.text}`, g = m.get(k);
    if (g) g.n++; else m.set(k, { level: c.level, text: c.text, n: 1, first: `${p.size.id} ${c.at}` });
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };


export interface Lag { /** a lag at speed N: the page ran N times faster and still froze, so it counts as serious */ serious?: boolean; where: string; transition: string; fps: number | null; worstGap: number; stalls: number; cause: string }
/** What the step did, in a person's words: opening a talk, leaving it, or going from the stop before to this one. */
export function transitionOf(rows: readonly AuditRow[], i: number): string {
  const r = rows[i]!;
  if (/^leave the talk/.test(r.label)) return 'LEAVING the talk';
  if (/outline \(opening the talk\)/.test(r.label)) return 'ENTERING the talk (opening it)';
  const m = /stop (\d+) of (\d+)/.exec(r.label);
  const prev = i > 0 && rows[i - 1]!.group === r.group ? /stop (\d+) of/.exec(rows[i - 1]!.label) : null;
  if (m) return prev ? `going from stop ${prev[1]} to stop ${m[1]} (leaving stop ${prev[1]}, entering stop ${m[1]})` : `ENTERING stop ${m[1]}`;
  if (/Next \(beat\)/.test(r.label)) return 'a beat press (next step inside the stop)';
  return r.group === 'Patients' ? 'changing the patient' : r.group === 'Views' ? 'changing the view or sheet' : 'this step';
}
/** Every step under LAG_FPS or with a gap over LAG_GAP_MS, worst first. Empty when frame timings are not valid (parallel or speed run). */
export const LAG_FPS = 30, LAG_GAP_MS = 100;
export function lags(b: Bundle): Lag[] {
  if (dropsFinding(b, 'stall')) return [];
  const out: (Lag & { rank: number })[] = [];
  for (const p of b.parts) p.rows.forEach((r, i) => {
    const f = r.frames, slowFps = (b.speed ?? 1) <= 1 && f.fps != null && f.frames >= 10 && f.fps < LAG_FPS, bigGap = f.worstGap > LAG_GAP_MS || f.stalls > 0;   // (zero stalls is the rule: any frame gap over 50 ms is a lag)
    if (!slowFps && !bigGap) return;
    const top = r.gpu?.slow[0];
    const cause = top ? `slowest frame: work ${top.ms} ms, gap ${top.gap} ms${top.bound ? `, waited on ${top.bound}` : ''}, asked by ${top.tags.join('/') || '-'}` : r.gpu ? 'no slow frame recorded' : 'no renderer data';
    out.push({ serious: (b.speed ?? 1) > 1 ? true : undefined, where: where(p, { ...r, label: r.label }), transition: transitionOf(p.rows, i), fps: f.fps, worstGap: f.worstGap, stalls: f.stalls, cause, rank: Math.max(f.worstGap, f.fps != null && f.fps > 0 ? 1000 / f.fps * 3 : 0) });
  });
  return out.sort((a, b2) => b2.rank - a.rank).map(({ rank: _r, ...l }) => l);
}

/** What no run of this can see, first, so a clean report is not read as "all good". */
export const CANNOT_SEE = [
  'Taste: whether anything looks ugly, un-2D or off is still your eye. Pixels are never read.',
  'Frame rates in a frame are THIS computer\'s GPU, not an iPhone\'s or iPad\'s. Run ?audit=here on the iPhone and the iPad for their real numbers.',
  'The sampler reads layout every 33 ms while it runs, so frame rates here run a little under the app\'s own (?perf).',
  'The tab must stay in front for the whole run: a hidden tab stops the clock and every number after it is wrong (the report says so when it happened).',
  'The renderer numbers are three\'s gl.info: draw calls, triangles and how many programs, geometries and textures are alive. They are counts, not bytes and not GPU time; GPU or compositor wait is inferred from a long frame gap after short script work.',
  'Fade lengths are known to about 33 ms; the page\'s own CSS fades under 70 ms read as a snap.',
];

const fmt = (v: number | null | undefined, unit = '') => (v == null ? '-' : `${v}${unit}`);

/** One line per kind of CSS animation or transition seen anywhere: how many, how long it was planned to run (min / median / max), the easing and how they ended. */
export function animInventory(b: Bundle): string[] {
  const m = new Map<string, { sel: string; prop: string; kind: string; planned: number[]; actual: number[]; easing: Set<string>; end: number; cancel: number; running: number; n: number }>();
  for (const p of b.parts) for (const r of p.rows) for (const a of r.anims ?? []) {
    const k = `${a.kind}|${a.sel}|${a.prop}`;
    const g = m.get(k) ?? { sel: a.sel, prop: a.prop, kind: a.kind, planned: [], actual: [], easing: new Set<string>(), end: 0, cancel: 0, running: 0, n: 0 };
    g.n++; if (a.plannedMs != null) g.planned.push(a.plannedMs); if (a.actualMs != null) g.actual.push(a.actualMs); if (a.easing) g.easing.add(a.easing);
    g[a.ended]++; m.set(k, g);
  }
  return [...m.values()].sort((a, b2) => b2.n - a.n).map((g) => {
    const pl = g.planned.slice().sort((x, y) => x - y);
    return `${g.n}x ${g.kind} ${g.sel} ${g.prop}: planned ${pl.length ? `${pl[0]}/${median(pl)}/${pl[pl.length - 1]} ms (min/median/max)` : 'unknown'}, ease ${[...g.easing].slice(0, 2).join(' | ') || 'unknown'}, ended ${g.end}, cancelled ${g.cancel}, still running ${g.running}${g.actual.length ? `, actual median ${median(g.actual)} ms` : ''}`;
  });
}

/** `short`: the findings and the worst few only. The default is everything: the summary, what was checked, every finding, every animation kind and every step. */
export function renderText(b: Bundle, o: { short?: boolean } = {}): string {
  const L: string[] = [];
  const groups = groupFindings(b), con = groupConsole(b);
  const fails = groups.filter((g) => g.sev === 'fail'), warns = groups.filter((g) => g.sev === 'warn');
  const steps = b.parts.reduce((n, p) => n + p.rows.length, 0);
  const rows = b.parts.flatMap((p) => p.rows.map((r) => ({ p, r })));
  const animTotal = rows.reduce((n, { r }) => n + (r.animN ?? r.anims?.length ?? 0), 0);
  const kinds = new Map<string, number>(); for (const g of groups) kinds.set(g.kind, (kinds.get(g.kind) ?? 0) + g.places.length);
  const wall = b.wallMs ?? b.parts.reduce((n, p) => n + p.ms, 0);
  L.push(`AUDIT v2 · build ${b.build} · ${b.at} · depth ${b.depth} · ${b.framed ? 'sized frames' : 'this screen'}${o.short ? ' · SHORT' : ''}`);
  L.push(`SUMMARY: ${fails.length} failing finding${fails.length === 1 ? '' : 's'}, ${warns.length} warning${warns.length === 1 ? '' : 's'}, ${con.length} console message${con.length === 1 ? '' : 's'}; ${steps} steps in ${b.parts.length} size${b.parts.length === 1 ? '' : 's'}; ${animTotal} CSS animations and transitions recorded; run time ${mins(wall)}${b.parallel ? ' (PARALLEL: fps and timings NOT valid)' : ''}${(b.speed ?? 1) > 1 ? ` (SPEED x${b.speed}: fps, stalls and GPU-bound NOT valid)` : ''}`);
  const lg = lags(b);
  const stallN = dropsFinding(b, 'stall') ? null : rows.reduce((n, { r }) => n + r.frames.stalls, 0), stallSteps = dropsFinding(b, 'stall') ? 0 : rows.filter(({ r }) => r.frames.stalls > 0).length;
  L.push(`STALLS: ${stallN == null ? 'not measured (the sizes ran at the same time on one computer, so no frame gap is real)' : `${stallN} frame gap${stallN === 1 ? '' : 's'} over 50 ms in ${stallSteps} step${stallSteps === 1 ? '' : 's'}${stallN ? ' (each one fails; zero is the rule)' : ' (zero: good)'}${(b.speed ?? 1) > 1 ? ` [measured in real time at speed x${b.speed}: a freeze is a long real gap at any speed; frames per second are not measured in a speed run]` : ''}`}`);
  L.push(''); L.push(`LAGS (steps under ${LAG_FPS} fps, with a frame gap over ${LAG_GAP_MS} ms, or with ANY stall (a gap over 50 ms): zero stalls is the rule, so each is a failure; worst first;${(b.speed ?? 1) > 1 ? ` at speed x${b.speed} the real gap threshold is NOT relaxed: any real frame gap over 50 ms is a SERIOUS LAG;` : ''} this is the list to read first)`);
  if (dropsFinding(b, 'stall')) L.push('not available: the sizes ran at the same time on one computer, so no frame gap is real. Run them one after the other.');
  else if (!lg.length) L.push('none: every step stayed at or above 30 fps with no gap over 100 ms');
  else for (const l of lg.slice(0, o.short ? 15 : 40)) L.push(`${l.serious ? 'SERIOUS LAG: ' : ''}${l.fps != null ? `${l.fps} fps` : 'fps n/a'}, worst gap ${l.worstGap} ms, ${l.stalls} stall${l.stalls === 1 ? '' : 's'}  ${l.where}\n    ${l.transition}; ${l.cause}`);
  if (lg.length > (o.short ? 15 : 40)) L.push(`and ${lg.length - (o.short ? 15 : 40)} more (all in the JSON rows)`);
  L.push('');
  if (kinds.size) L.push(`FINDINGS BY KIND: ${[...kinds].sort((a, b2) => b2[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  if (b.parallel) L.push(`PARALLEL RUN: the frames shared this computer, so every frame rate, stall and settle time below is NOT valid, and ${rows.reduce((n, { r }) => n + r.flags.filter((f) => TIMING_KINDS.has(f.kind)).length, 0)} timing findings (stall, low-fps, slow-load, fade-slow, unsettled) are left out. Layout, snaps, coverage and console errors are valid.`);
  if ((b.speed ?? 1) > 1) L.push(`SPEED RUN x${b.speed}: the page's clock ran ${b.speed} times faster, so settle and fade lengths are in page time (valid), but frame rates (low-fps), gpu-bound and fade-under-stall findings are NOT valid and are left out (${rows.reduce((n, { r }) => n + r.flags.filter((f) => SPEED_INVALID.has(f.kind)).length, 0)} dropped). Layout, coverage, console errors and STALLS (real-time frame gaps over 50 ms) are valid.${(b.speed ?? 1) > FRAME_LIMIT_SPEED ? ` ABOVE ${FRAME_LIMIT_SPEED}x the page draws only a frame or two of each ease, so fade, snap and pop findings (fade-instant, flash, card-pop, generic-pop...) are NOT valid either and are left out (${rows.reduce((n, { r }) => n + r.flags.filter((f) => FRAME_LIMITED_KINDS.has(f.kind)).length, 0)} dropped): use speed=${FRAME_LIMIT_SPEED} or less for those.` : ' Snaps and fades are valid up to 4x.'} Run once without speed for the real timings.`);
  L.push(`device: ${b.device}`);
  L.push(`sizes: ${b.parts.map((p) => `${p.size.id} ${p.size.w}x${p.size.h}@${p.size.dpr} (${p.rows.length} steps, ${mins(p.ms)}${p.stopped ? ', STOPPED' : ''})`).join('; ') || 'none'}${b.parts.length > 1 ? (b.parallel ? ' (sizes ran at the same time)' : ` (ran one after the other, ${mins(wall)} in all)`) : ''}`);
  if (b.failed.length) { L.push(''); L.push('SIZES THAT DID NOT FINISH'); for (const f of b.failed) L.push(`- ${f.size}: ${f.why}`); }
  for (const p of b.parts) for (const n of p.notes) L.push(`- NOTE ${p.size.id}: ${n}`);
  for (const p of b.parts) if (p.coverage?.length) {
    const miss = p.coverage.filter((c) => c.missed.length || c.reached < c.total);
    L.push(''); L.push(`COVERAGE ${p.size.id}: ${p.coverage.reduce((n, c) => n + c.reached, 0)} of ${p.coverage.reduce((n, c) => n + c.total, 0)} stops in ${p.coverage.length} talks${miss.length ? '' : ' (all reached)'}`);
    for (const c of miss) L.push(`- NOT REACHED in "${c.deck}": ${c.total - c.reached} of ${c.total} stops${c.missed.length ? ` (stop ${c.missed.join(', ')})` : ''}`);
  }
  const show = (gs: Group[], head: string) => {
    if (!gs.length) return;
    L.push(''); L.push(head);
    for (const g of gs) {
      L.push(`[${g.kind}] ${g.what} (${g.places.length} place${g.places.length === 1 ? '' : 's'})`);
      L.push(`    ${g.places.slice(0, o.short ? 4 : 8).join(' | ')}${g.places.length > (o.short ? 4 : 8) ? ` | and ${g.places.length - (o.short ? 4 : 8)} more (all in the JSON)` : ''}`);
    }
  };
  show(fails, 'FAILING (fix these)'); show(warns, 'WARNINGS');
  const slow = rows.slice().sort((a, b2) => b2.r.busyMs - a.r.busyMs).slice(0, 10);
  if (slow.length) { L.push(''); L.push('SLOWEST TO SETTLE'); for (const { p, r } of slow) L.push(`${sec(r.busyMs)}  ${where(p, r)}${r.settled ? '' : '  (never settled)'}`); }
  const choppy = rows.filter(({ r }) => r.frames.fps != null && r.frames.frames >= 10).sort((a, b2) => a.r.frames.fps! - b2.r.frames.fps!).slice(0, 10);
  if (choppy.length) { L.push(''); L.push('LOWEST FRAME RATE (while moving)'); for (const { p, r } of choppy) L.push(`${r.frames.fps} fps, worst gap ${r.frames.worstGap} ms, ${r.frames.hitches} hitches, ${r.frames.stalls} stalls  ${where(p, r)}`); }
  if (!dropsFinding(b, 'gpu-bound')) {
    const waits = rows.filter(({ r }) => r.gpu && r.gpu.boundGpu + r.gpu.boundCpu >= 3).sort((a, b2) => b2.r.gpu!.boundGpu - a.r.gpu!.boundGpu || b2.r.gpu!.boundCpu - a.r.gpu!.boundCpu).slice(0, 10);
    L.push(''); L.push('WAITED ON THE GPU OR THE COMPOSITOR? (slow frames per step: "gpu/compositor" = a long gap after short script work, which is the GPU or the frosted-glass blur, not the scripts; "cpu" = the scripts were slow)');
    if (waits.length) for (const { p, r } of waits) L.push(`gpu/compositor ${r.gpu!.boundGpu}, cpu ${r.gpu!.boundCpu}  ${where(p, r)}`);
    else L.push('no step had three or more slow frames: nothing to attribute');
    const talk = rows.filter(({ r }) => /outline \(opening the talk\)/.test(r.label) && r.gpu);
    if (talk.length) { L.push(`TALK OPENS: ${talk.map(({ r }) => `${r.group} gpu/compositor ${r.gpu!.boundGpu}, cpu ${r.gpu!.boundCpu}`).join('; ')}. To test the glass: run the same audit twice, once as is and once with &noglass=1 (the frosted blur off), and compare the talk-open fps and these counts.`); }
  }
  const stalled = rows.filter(({ r }) => r.gpu?.slow.length && r.flags.some((f) => f.kind === 'stall' || f.kind === 'low-fps')).slice(0, 12);
  if (!dropsFinding(b, 'stall') && stalled.length) {
    L.push(''); L.push('SLOW FRAMES NAMED (the three slowest frames of each step that stalled or ran slow, with who asked for frames: skin-build is a junction rebuild, patient-glide the patient change)');
    for (const { p, r } of stalled) L.push(`${where(p, r)}: ${r.gpu!.slow.map((f) => `work ${f.ms} ms, gap ${f.gap} ms${f.bound ? `, waited on ${f.bound}` : ''}, asked by ${f.tags.join('/') || '-'}${f.calls != null ? `, ${f.calls} calls ${f.triangles} tris` : ''}`).join(' | ')}`);
  }
  for (const p of b.parts) {
    const g = p.rows.map((r) => r.gpu).filter((x): x is RowGpu => !!x);
    if (!g.length) continue;
    const mx = (k: 'calls' | 'triangles' | 'programs' | 'geometries' | 'textures') => Math.max(...g.map((x) => x[k]));
    const lastG = g[g.length - 1]!, climb = memoryClimb(p.rows.map((r) => r.gpu));
    L.push(''); L.push(`${p.size.id} RENDERER (three's gl.info, counts not bytes): most draw calls in a frame ${mx('calls')}, most triangles ${mx('triangles')}, programs ${mx('programs')}, geometries ${g[Math.min(g.length, LEAK_BASELINE_STEPS) - 1]!.geometries} after the views were built to ${lastG.geometries} at the end (most ${mx('geometries')}), textures ${g[Math.min(g.length, LEAK_BASELINE_STEPS) - 1]!.textures} to ${lastG.textures} (most ${mx('textures')}); junction-skin rebuilds ${g.reduce((n, x) => n + x.skinRebuilds, 0)}; ${climb ? `LEAK SUSPECT: +${climb.geometries} geometries, +${climb.textures} textures since step ${climb.from + 1}` : 'no climb in geometries or textures'}`);
  }
  for (const p of b.parts) {
    const ins = p.rows.map((r) => r.fadeIn).filter((x): x is number => x != null), outs = p.rows.map((r) => r.fadeOut).filter((x): x is number => x != null);
    const fps = p.rows.map((r) => r.frames.fps).filter((x): x is number => x != null);
    L.push(''); L.push(`${p.size.id} SUMMARY: step settle median ${sec(median(p.rows.map((r) => r.busyMs)))}; card fade in median ${ins.length ? `${Math.round(median(ins))} ms (max ${Math.round(Math.max(...ins))})` : 'n/a'}, out median ${outs.length ? `${Math.round(median(outs))} ms (max ${Math.round(Math.max(...outs))})` : 'n/a'}; fps median ${fps.length ? median(fps) : 'n/a'}, lowest ${fps.length ? Math.min(...fps) : 'n/a'}`);
  }
  if (con.length) { L.push(''); L.push('CONSOLE (errors and warnings)'); for (const c of con.slice(0, 25)) L.push(`${c.n}x [${c.level}] ${c.text.slice(0, 300)}  (first: ${c.first})`); if (con.length > 25) L.push(`and ${con.length - 25} more (in the JSON)`); }
  if (!o.short) {
    const inv = animInventory(b);
    L.push(''); L.push(`ANIMATIONS (${animTotal} runs of ${inv.length} kinds; CSS animations and transitions only: the app's own clock tweens show up in the step table and the fade numbers)`);
    for (const l of inv.slice(0, 80)) L.push(l); if (inv.length > 80) L.push(`and ${inv.length - 80} more kinds (in the JSON)`);
    if (!inv.length) L.push('none recorded');
    L.push(''); L.push('EVERY STEP (size | group > label | settle | cards done | fade in/out ms | fps, p95 gap, worst gap, hitches, stalls | css animations (longest ms) | page sweep words/media | gl.info draw calls, triangles, programs, geometries, textures, slow frames waited on, skin rebuilds | findings f/w)');
    for (const { p, r } of rows) {
      const an = r.anims ?? [], longest = an.reduce((m2, a) => Math.max(m2, a.plannedMs ?? 0), 0), f = r.flags.filter((x) => x.sev === 'fail').length, w = r.flags.filter((x) => x.sev === 'warn').length;
      L.push(`${where(p, r)} | ${sec(r.busyMs)}${r.settled ? '' : ' NEVER SETTLED'} | cards ${fmt(r.cardsMs, ' ms')} | fade ${fmt(r.fadeIn)}/${fmt(r.fadeOut)} | ${fmt(r.frames.fps, ' fps')}, p95 ${r.frames.p95Gap}, worst ${r.frames.worstGap}, ${r.frames.hitches} hitches, ${r.frames.stalls} stalls | anims ${r.animN ?? an.length}${longest ? ` (${longest})` : ''} | sweep ${r.scan ? `${r.scan.texts}/${r.scan.media}${r.scan.capped ? ' capped' : ''}` : 'n/a'} | ${r.gpu ? `gl ${r.gpu.calls} calls ${r.gpu.triangles} tris ${r.gpu.programs} prog ${r.gpu.geometries} geo ${r.gpu.textures} tex, bound gpu ${r.gpu.boundGpu} cpu ${r.gpu.boundCpu}, skins ${r.gpu.skinRebuilds}` : 'gl n/a'} | ${f}f ${w}w`);
    }
    L.push(''); L.push(`CHECKS RUN ON EVERY STEP (${CHECKS.length})`);
    for (const c of CHECKS) L.push(`- ${c.id}: ${c.what}`);
    L.push(''); L.push('GAPS: WHAT NO CHECK HERE CAN SEE');
    for (const g of GAPS) L.push(`- ${g}`);
    for (const c of CANNOT_SEE) L.push(`- ${c}`);
  } else {
    L.push(''); L.push('OPEN FIRST: this report cannot judge taste or pixels, and frame rates in a frame are this computer\'s GPU. The full report lists every check and every step.');
  }
  L.push(''); L.push('The raw table (every step, every animation record, every size) is in Copy JSON.');
  return L.join('\n');
}

export const renderJson = (b: Bundle): string => JSON.stringify(b);
