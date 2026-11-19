// buildScreen(env): the screen report, a pure function of what it is handed (the app's stores, app.ts, and the page's layout, raw.ts). It runs the registered readers
// in order, each into its own part, then the rules over the result. Synchronous, no pixels, no GL read-back, no timers (the 2D app's screen/build.js).
//
//   buildScreen({ app, dom, detail, only, rules, history, ...more })  ->  { v: 1, detail, <part id>: part, ..., errors?, findings? }
//   A reader that throws is counted (caught) and named in report.errors; the other parts still come. A part is left out when its reader returns null.
// stableReport(report) drops the volatile parts (times, memory, frame counts) and the findings' times: two runs of one state then compare equal.
import './readers.ts';
import '../selfcheck/plugins.ts';
import { readerList } from '../core/registry.copied.js';
import { runRules } from '../core/rules.copied.js';
import { screenText } from '../core/text.copied.js';
import { caught } from '../caught.ts';
import type { AppSnapshot } from './app.ts';
import type { RawDom } from './raw.ts';

export const SCREEN_VERSION = 1;
const asList = (v: unknown): string[] | null => (v == null ? null : Array.isArray(v) ? v : [v as string]);

export interface BuildOptions { app: AppSnapshot; dom: RawDom; detail?: 'summary' | 'full'; only?: string | string[]; rules?: false | string | string[]; history?: unknown[]; [k: string]: unknown }

export function buildScreen(opts: BuildOptions): Record<string, any> {
  const detail = opts.detail === 'full' ? 'full' : 'summary';
  const only = asList(opts.only);
  const env: Record<string, unknown> = { ...opts, detail };
  delete env.app; delete env.dom;
  const report: Record<string, any> = { v: SCREEN_VERSION, detail };
  const parts: Record<string, unknown> = {}, errors: Record<string, string> = {};
  const ctx = { app: opts.app, dom: opts.dom, env, detail, parts };
  for (const r of readerList()) {
    if (only && r.id !== 'page' && !only.includes(r.id)) continue;
    try {
      const part = r.read(ctx);
      if (part != null) { parts[r.id] = part; report[r.id] = part; }
    } catch (e) {
      errors[r.id] = String((e as Error)?.message || e);
      caught(`screen:${r.id}`, e);
    }
  }
  if (Object.keys(errors).length) report.errors = errors;
  if (opts.rules !== false) {
    report.findings = runRules(report, { only: Array.isArray(opts.rules) || typeof opts.rules === 'string' ? opts.rules : undefined, kinds: opts.history ? undefined : ['state'], history: opts.history, env });
  }
  return report;
}

export function stableReport(report: Record<string, any>): Record<string, any> {
  const vol = new Set(readerList().filter((r: { volatile: boolean }) => r.volatile).map((r: { id: string }) => r.id));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(report)) {
    if (vol.has(k)) continue;
    out[k] = k === 'findings' ? (v as any[]).map((f) => { const g = { ...f }; delete g.at; return g; }) : v;
  }
  return out;
}
export { screenText };
