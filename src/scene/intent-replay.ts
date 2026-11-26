// N2: play a logged run (intent-log.ts) back in node. It runs the same pure `resolve` and `reconcile` the app runs, over a recorder instead of the scene, so what the figure was told to
// do can be read in order without a browser: `npm run debug -- packet replay <file>`.
import { resolve, EMPTY_INTENT, LAYER_ORDER, type FigureIntent, type LayerName, type Layers } from './intent.ts';
import { reconcile, type ReconcileTarget } from './reconcile.ts';
import { plain, LOG_MAX, type LogEntry } from './intent-log.ts';

/** Read a log back from a packet (anything an edited paste could hold is cut down to what replay can use). */
export function cleanLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LogEntry[] = [];
  for (const e of raw.slice(0, LOG_MAX)) {
    if (!e || typeof e !== 'object' || typeof (e as { t?: unknown }).t !== 'number') continue;
    const r = e as Record<string, unknown>;
    if (r.op === 'input' && typeof r.what === 'string') out.push({ t: r.t as number, op: 'input', what: r.what.slice(0, 80) });
    else if ((r.op === 'set' || r.op === 'clear') && (LAYER_ORDER as readonly unknown[]).includes(r.layer)) {
      const patch = r.op === 'set' && r.patch && typeof r.patch === 'object' ? plain(r.patch as Record<string, unknown>) : undefined;
      out.push({ t: r.t as number, op: r.op, layer: r.layer as LayerName, ...(patch ? { patch } : {}) });
    }
  }
  return out;
}

export interface ReplayStep { t: number; what: string; calls: string[] }
export interface Replay { steps: ReplayStep[]; final: FigureIntent; layersOn: LayerName[] }

/** Play the log over a recording target: for each entry, what it was and the calls the reconciler made for it. Pure. */
export function replayIntents(log: readonly LogEntry[]): Replay {
  let layers: Layers = {}, applied: FigureIntent = EMPTY_INTENT, calls: string[] = [];
  const q = (name: string) => (...a: unknown[]) => { calls.push(`${name}(${a.map((x) => JSON.stringify(x)).join(', ')})`); };
  const to: ReconcileTarget = {
    setNamedVessels: q('setNamedVessels'), pinOrgans: q('pinOrgans'), setSinceRef: (P) => { calls.push(`setSinceRef(${P ? `${P.length} values` : 'null'})`); },
    markVessels: q('markVessels'), pick: q('pick'), setResistors: q('setResistors'), setCaudatePin: q('setCaudatePin'), setSlideFocus: q('setSlideFocus'),
  };
  const steps: ReplayStep[] = [];
  for (const e of log) {
    calls = [];
    if (e.op === 'input') { steps.push({ t: e.t, what: `input: ${e.what}`, calls }); continue; }
    if (e.op === 'clear') { const { [e.layer]: _g, ...rest } = layers; void _g; layers = rest; }
    else layers = { ...layers, [e.layer]: { ...layers[e.layer], ...revive(e.patch) } };
    applied = reconcile(applied, resolve(layers), to);
    steps.push({ t: e.t, what: `${e.op} ${e.layer}${e.patch ? ' ' + JSON.stringify(e.patch) : ''}`, calls });
  }
  return { steps, final: applied, layersOn: LAYER_ORDER.filter((n) => layers[n]) };
}
/** (a since reference was reduced to its length when it was logged: a stand-in list of that length plays it back) */
function revive(p?: Record<string, unknown>): Partial<FigureIntent> {
  if (!p) return {};
  const o = { ...p } as Record<string, unknown>;
  const s = o.sinceRef as { n?: number } | null | undefined;
  if (s && typeof s === 'object') o.sinceRef = new Array<number>(Math.max(0, Math.min(1000, s.n ?? 0))).fill(0);
  return o as Partial<FigureIntent>;
}

/** The replay as text for a person or an agent: one line per entry, the calls indented, then what was still on at the end. */
export function replayText(r: Replay): string {
  const L: string[] = [];
  const t0 = r.steps[0]?.t ?? 0;
  for (const s of r.steps) { L.push(`+${((s.t - t0) / 1000).toFixed(2)}s  ${s.what}`); for (const c of s.calls) L.push(`        -> ${c}`); }
  L.push(`at the end: ${r.layersOn.length ? `layers on: ${r.layersOn.join(', ')}` : 'no layer on'}; named ${r.final.named.length}, lit ${r.final.marked.length}, picked ${r.final.picked ?? 'none'}, resistors ${r.final.resistors.length}`);
  return L.join('\n');
}
