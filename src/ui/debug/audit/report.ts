// ?audit: the report. One AuditData per screen size (what a run produced), one Bundle for the whole session; `renderText` is what Copy puts on the clipboard (short: what failed, grouped,
// with where, then the slowest and the choppiest), `renderJson` the whole table (every step, every size) for an agent to read. Pure: a Node test builds and reads them.
import type { AuditFinding, FrameStats, Sev } from './judge.ts';

export interface AuditSize { id: string; w: number; h: number; dpr: number }
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
}
export interface ConsoleLine { level: 'error' | 'warn' | 'window' | 'promise'; text: string; at: string }
export interface AuditData {
  size: AuditSize; build?: string; ms: number; depth: 'quick' | 'full'; stopped: boolean;
  rows: AuditRow[]; console: ConsoleLine[]; notes: string[];
}
export interface Bundle {
  build: string; device: string; at: string; depth: 'quick' | 'full'; framed: boolean;
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
export function groupFindings(b: Bundle): Group[] {
  const m = new Map<string, Group>();
  for (const p of b.parts) for (const r of p.rows) for (const f of r.flags) {
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

/** What no run of this can see, first, so a clean report is not read as "all good". */
export const CANNOT_SEE = [
  'Taste: whether anything looks ugly, un-2D or off is still your eye. Pixels are never read.',
  'Frame rates in a frame are THIS computer\'s GPU, not an iPhone\'s or iPad\'s. Run ?audit=here on the iPhone and the iPad for their real numbers.',
  'The sampler reads layout every 33 ms while it runs, so frame rates here run a little under the app\'s own (?perf).',
  'The tab must stay in front for the whole run: a hidden tab stops the clock and every number after it is wrong (the report says so when it happened).',
  'Fade lengths are known to about 33 ms; the page\'s own CSS fades under 70 ms read as a snap.',
];

export function renderText(b: Bundle): string {
  const L: string[] = [];
  const groups = groupFindings(b), con = groupConsole(b);
  const fails = groups.filter((g) => g.sev === 'fail'), warns = groups.filter((g) => g.sev === 'warn');
  const steps = b.parts.reduce((n, p) => n + p.rows.length, 0);
  L.push(`AUDIT v1 · build ${b.build} · ${b.at} · depth ${b.depth} · ${b.framed ? 'sized frames' : 'this screen'}`);
  L.push(`device: ${b.device}`);
  L.push(`sizes: ${b.parts.map((p) => `${p.size.id} ${p.size.w}x${p.size.h}@${p.size.dpr} (${p.rows.length} steps, ${mins(p.ms)}${p.stopped ? ', STOPPED' : ''})`).join('; ') || 'none'}`);
  L.push('');
  L.push('OPEN FIRST (what this report cannot tell you)');
  for (const c of CANNOT_SEE) L.push(`- ${c}`);
  if (b.failed.length) { L.push(''); L.push('SIZES THAT DID NOT FINISH'); for (const f of b.failed) L.push(`- ${f.size}: ${f.why}`); }
  for (const p of b.parts) for (const n of p.notes) L.push(`- NOTE ${p.size.id}: ${n}`);
  L.push('');
  L.push(`RESULT: ${fails.length} failing finding${fails.length === 1 ? '' : 's'}, ${warns.length} warning${warns.length === 1 ? '' : 's'}, ${con.length} distinct console message${con.length === 1 ? '' : 's'}, ${steps} steps measured`);
  const show = (gs: Group[], head: string) => {
    if (!gs.length) return;
    L.push(''); L.push(head);
    for (const g of gs) {
      L.push(`[${g.kind}] ${g.what} (${g.places.length} place${g.places.length === 1 ? '' : 's'})`);
      L.push(`    ${g.places.slice(0, 6).join(' | ')}${g.places.length > 6 ? ` | and ${g.places.length - 6} more (all in the JSON)` : ''}`);
    }
  };
  show(fails, 'FAILING (fix these)'); show(warns, 'WARNINGS');
  const rows = b.parts.flatMap((p) => p.rows.map((r) => ({ p, r })));
  const slow = rows.slice().sort((a, b2) => b2.r.busyMs - a.r.busyMs).slice(0, 10);
  if (slow.length) { L.push(''); L.push('SLOWEST TO SETTLE'); for (const { p, r } of slow) L.push(`${sec(r.busyMs)}  ${where(p, r)}${r.settled ? '' : '  (never settled)'}`); }
  const choppy = rows.filter(({ r }) => r.frames.fps != null && r.frames.frames >= 10).sort((a, b2) => a.r.frames.fps! - b2.r.frames.fps!).slice(0, 10);
  if (choppy.length) { L.push(''); L.push('LOWEST FRAME RATE (while moving)'); for (const { p, r } of choppy) L.push(`${r.frames.fps} fps, worst gap ${r.frames.worstGap} ms, ${r.frames.hitches} hitches, ${r.frames.stalls} stalls  ${where(p, r)}`); }
  for (const p of b.parts) {
    const ins = p.rows.map((r) => r.fadeIn).filter((x): x is number => x != null), outs = p.rows.map((r) => r.fadeOut).filter((x): x is number => x != null);
    const fps = p.rows.map((r) => r.frames.fps).filter((x): x is number => x != null);
    L.push(''); L.push(`${p.size.id} SUMMARY: step settle median ${sec(median(p.rows.map((r) => r.busyMs)))}; card fade in median ${ins.length ? `${Math.round(median(ins))} ms (max ${Math.round(Math.max(...ins))})` : 'n/a'}, out median ${outs.length ? `${Math.round(median(outs))} ms (max ${Math.round(Math.max(...outs))})` : 'n/a'}; fps median ${fps.length ? median(fps) : 'n/a'}, lowest ${fps.length ? Math.min(...fps) : 'n/a'}`);
  }
  if (con.length) { L.push(''); L.push('CONSOLE (errors and warnings)'); for (const c of con.slice(0, 25)) L.push(`${c.n}x [${c.level}] ${c.text.slice(0, 300)}  (first: ${c.first})`); if (con.length > 25) L.push(`and ${con.length - 25} more (in the JSON)`); }
  L.push(''); L.push('The whole table, every step and size, is in Copy JSON.');
  return L.join('\n');
}

export const renderJson = (b: Bundle): string => JSON.stringify(b);
