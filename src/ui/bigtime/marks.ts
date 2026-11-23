// What the timeline chart marks along the days, worked out from History's entries (timeline/model.ts): a line for every event the model raised and every change that is a
// procedure (TIPS 8 mm, Paracentesis), and a bar for every medicine from the day it was started to the day it was stopped. Pure: entries in, marks out.
export type Tone = 'change' | 'ok' | 'caution' | 'danger' | 'info';
export interface EntryIn { id: number; kind: 'start' | 'change' | 'jump' | 'event'; label: string; day: number; sev?: string; keys?: readonly string[]; action?: boolean; detail?: string; params?: unknown }
export interface MarkLine { id: number; day: number; label: string; tone: Tone; kind: 'change' | 'event'; detail?: string }
export interface Span { from: number; to: number | null }
export interface MedBar { key: string; name: string; spans: Span[] }
export interface Marks { lines: MarkLine[]; meds: MedBar[] }

/** a medicine's key in the changes list (action/changes.ts: `drug:<name>`, `diuretics`, `anticoag`) */
export const isMed = (key: string): boolean => key.startsWith('drug:') || key === 'diuretics' || key === 'anticoag';
const toneOf = (sev: string | undefined): Tone => (sev === 'ok' ? 'ok' : sev === 'caution' ? 'caution' : sev === 'danger' || sev === 'critical' ? 'danger' : 'info');

export function marksOf(entries: readonly EntryIn[], labelsOf: (params: unknown) => Map<string, string>): Marks {
  const lines: MarkLine[] = [];
  const bars = new Map<string, MedBar>(), open = new Map<string, Span>();
  let prev = new Set<string>();
  for (const e of entries) {
    if (e.kind === 'event') { lines.push({ id: e.id, day: e.day, label: e.label, tone: toneOf(e.sev), kind: 'event', ...(e.detail ? { detail: e.detail } : {}) }); continue; }
    if (e.kind === 'jump') continue;
    const labels = e.params != null ? labelsOf(e.params) : null;
    let medSetChanged = false;
    if (labels) {
      const now = new Set([...labels.keys()].filter(isMed));
      for (const k of now) if (!prev.has(k)) {
        medSetChanged = true;
        let b = bars.get(k); if (!b) { b = { key: k, name: labels.get(k)!, spans: [] }; bars.set(k, b); }
        const s: Span = { from: e.day, to: null }; b.spans.push(s); open.set(k, s);
      }
      for (const k of prev) if (!now.has(k)) { medSetChanged = true; const s = open.get(k); if (s) { s.to = e.day; open.delete(k); } }
      prev = now;
    }
    if (e.kind !== 'change') continue;
    // a change is a line unless it only started or stopped a medicine (the bar is its mark)
    const keys = e.keys ?? [], other = keys.filter((k) => !isMed(k));
    if (!e.action && !other.length && (keys.length || medSetChanged)) continue;
    const named = labels && other.length ? other.map((k) => labels.get(k)).filter((x): x is string => !!x).join(' · ') : '';
    lines.push({ id: e.id, day: e.day, label: named || e.label, tone: 'change', kind: 'change', ...(e.detail ? { detail: e.detail } : {}) });
  }
  return { lines, meds: [...bars.values()] };
}

/** the days a record covers, so a bar that opened before the first reading starts at the left edge */
export const clampSpan = (s: Span, a: number, b: number): Span | null => { const to = s.to ?? b; return to < a || s.from > b ? null : { from: Math.max(a, s.from), to: s.to == null ? null : Math.min(b, s.to) }; };
