// The sinusoid's captions as 2D writes them (sinusoid-view.js caption / pageRun, label-captions.js leadMarks), so the 2D stylesheets that came with the app (styles/app-03-layouts.css `.sv-region`,
// `.sv-region-<key>`, `.sv-end`; app-01-chrome.css `.leader-dot`) set their type, case, colour and halo and nothing here repeats a number of theirs:
//   a caption is <div class="sv-region sv-region-<key>" data-target="sinusoid:…"> <span>NAME</span> <span class="v"><b>figure</b> unit</span> … </div>
//   the ends (the portal venule, the central vein) are written exactly as the Sinusoid's own, with `sv-end` added: 'sv-region sv-region-sin sv-end'.
// The cells' and the bands' names (Stellate cell, Kupffer cell, Hepatocyte, Space of Disse, Bile canaliculus) are small capitals by the base `.sv-region` rule; the readings' names
// (Sinusoid, Fenestrae, Lymph and the ends) are in sentence case by its `:is(.sv-region-sin, .sv-region-fen, .sv-region-lymph)` rule, with the number large and bold and the unit small.
// Pure: no DOM, so a test reads what the layer writes.
import { LEAD_LOOK } from './lead-look.copied.ts';
import type { NameKey } from './names.ts';

/** The class a caption wears (2D: caption(key, cls) with the ends' `'sv-region sv-region-sin sv-end'`, every other `sv-region sv-region-<key>`). */
export const regionClass = (key: NameKey): string => (key === 'in' || key === 'out' ? 'sv-region sv-region-sin sv-end' : `sv-region sv-region-${key}`);
/** The names that are in sentence case (the readings' names): 2D's stylesheet rule, listed here only for the tests that hold the layer to it. */
export const SENTENCE_KEYS: readonly NameKey[] = ['in', 'out', 'sin', 'fen', 'lymph'];

/** One node of a caption: a span or a bold figure, with its class and its children (text or nodes). */
export interface RNode { tag: 'span' | 'b'; cls?: string; kids: (RNode | string)[] }
/** A caption's children as 2D's pageRun writes them: the name (its lines split by the stylesheet's `white-space: pre-line`), then one `.v` per reading, its figure in <b> and its unit after it,
 *  split at `~` (`"100%~open"`, `"1,320~mL/day · Protein 87%"`); a reading with no unit is the figure alone. `note` is the one line a tap adds (SV_NOTE), set in the unit's type. */
export function regionTree(name: string, value: string, note: string | null = null): RNode[] {
  const lines = value ? value.split(' · ') : [];
  const out: RNode[] = [{ tag: 'span', kids: [name] }];
  for (const l of lines) {
    const [v, u] = l.split('~');
    out.push({ tag: 'span', cls: 'v', kids: [{ tag: 'b', kids: [v ?? ''] }, ...(u ? [` ${u}`] : [])] });
  }
  if (note) out.push({ tag: 'span', cls: 'sv-note', kids: [note] });
  return out;
}
/** The tree as one string, to tell when a caption's words have changed. */
export const treeKey = (t: readonly RNode[]): string => JSON.stringify(t);

/** The ringed dot where a leader lands (2D: `.leader-dot { fill: var(--stage-bg); stroke: var(--text-2); stroke-width: 1.3 }` of radius 2.4 over `.leader-dot-halo { fill: var(--stage-bg) }` of radius 5), as the CSS
 *  of one circle: the box is the dot and its ring (a stroke is centred on its radius), the halo the paper round it out to 5. */
export function dotCss(): { size: number; ring: number; halo: number } {
  const { dotR, ringWidth, haloR } = LEAD_LOOK;
  const size = dotR * 2 + ringWidth;
  return { size, ring: ringWidth, halo: Math.max(0, haloR - size / 2) };
}
