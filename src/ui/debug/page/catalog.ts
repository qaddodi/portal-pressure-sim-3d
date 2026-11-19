// What the debug page can open, listed from the app's own tables (the decks, the patients, the sheets, the views), so a new slide or patient is in it the day it exists.
// Each entry is a specimen: the real thing, opened the way the app opens it. Pure: handed the lists, so a Node test names the sections without the app.
export type Section = 'view' | 'sheet' | 'slide' | 'patient';
export interface Entry { id: string; section: Section; label: string; group: string; note?: string }
export interface CatalogSource {
  views: readonly { id: string; label: string }[];
  sheets: readonly string[];
  decks: readonly { id: string; title: string; slides: readonly { title: string }[] }[];
  patients: readonly { id: string; label: string; group: string }[];
}
export const SECTION_NAMES: Record<Section, string> = { view: 'Figure views', sheet: 'Sheets and menus', slide: 'Slides', patient: 'Patients' };

export function buildCatalog(src: CatalogSource): Entry[] {
  const out: Entry[] = [];
  for (const v of src.views) out.push({ id: `view:${v.id}`, section: 'view', label: v.label, group: SECTION_NAMES.view });
  for (const s of src.sheets) out.push({ id: `sheet:${s}`, section: 'sheet', label: s[0]!.toUpperCase() + s.slice(1), group: SECTION_NAMES.sheet });
  for (const d of src.decks) {
    // stops as the presenter counts them (startTalk's `at`): 0 the outline, 1..n the slides, n + 1 the quick check
    out.push({ id: `slide:${d.id}:0`, section: 'slide', label: `${d.title}: outline`, group: d.title });
    d.slides.forEach((s, i) => out.push({ id: `slide:${d.id}:${i + 1}`, section: 'slide', label: `${i + 1}. ${s.title}`, group: d.title, note: `slide ${i + 1} of ${d.slides.length}` }));
    out.push({ id: `slide:${d.id}:${d.slides.length + 1}`, section: 'slide', label: `${d.title}: quick check`, group: d.title });
  }
  for (const p of src.patients) out.push({ id: `patient:${p.id}`, section: 'patient', label: p.label, group: p.group });
  return out;
}

export const byId = (cat: readonly Entry[], id: string): Entry | undefined => cat.find((e) => e.id === id);

/** Which entries a spec names: a comma list of ids, section names ('slide'), a deck ('slide:hvpg'), or 'all'. Names it could not find come back in `unknown` (a report says so, never skips quietly). */
export function resolveSpec(cat: readonly Entry[], spec: string | readonly string[]): { entries: Entry[]; unknown: string[] } {
  const parts = (Array.isArray(spec) ? spec : String(spec).split(',')).map((s) => s.trim()).filter(Boolean);
  const entries: Entry[] = [], unknown: string[] = [], seen = new Set<string>();
  const add = (e: Entry) => { if (!seen.has(e.id)) { seen.add(e.id); entries.push(e); } };
  for (const p of parts) {
    if (p === 'all') { cat.forEach(add); continue; }
    const hit = cat.filter((e) => e.id === p || e.section === p || e.id.startsWith(`${p}:`));
    if (!hit.length) unknown.push(p); else hit.forEach(add);
  }
  return { entries, unknown };
}

/** The default Sweep: one of each kind, enough to see every card family without opening everything (a deck's outline, the sheets, the three views, a few patients). */
export function defaultSweep(cat: readonly Entry[]): Entry[] {
  const first = new Set<string>();
  return cat.filter((e) => {
    if (e.section === 'view' || e.section === 'sheet') return true;
    if (e.section === 'slide') { const d = e.id.split(':')[1]!; if (first.has(d)) return false; first.add(d); return true; }
    return e.section === 'patient' && ['csph', 'cirr-decomp', 'healthy'].some((k) => e.id.endsWith(k));
  });
}
