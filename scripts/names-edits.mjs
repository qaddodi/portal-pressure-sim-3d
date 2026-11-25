// The name table (src/decks/names.ts) put into the words and the charts, by the generators, so a re-copy from 2D keeps it. Four edits, one source:
//   causeNames(deck)   every chip, plane point, ladder and table row that names a cause of portal hypertension says the cause's long name, and its short name where it has one
//                      (Right heart failure was also Heart, Heart failure; Sinusoidal obstruction syndrome was also Sinusoidal obstruction and Sinusoidal obstr. synd.; Clot, PVT and
//                      Portal vein thrombosis were three names for one cause);
//   defineFirst(deck)  a cause's abbreviation (SOS, PVT) is spelled out where its talk first uses it, as "Sinusoidal obstruction syndrome (SOS)";
//   namesEdits(json)   both of those on a deck's JSON text (what bavenoEdits() calls, so the four deck generators and apply-names.mjs agree);
//   zoneEdit(text)     the two profile charts' zone strip says Before the liver / In the liver / After the liver (one word each where the room is short), from LIVER_ZONES.
// Capture 36b7deac review items 3 and 6. tests/names-table.test.ts pins the result.
import { CAUSES, LIVER_ZONES, causeOfName } from '../src/decks/names.ts';

const LONG_FIELDS = ['label', 'name', 'title'];
// (a mark on the figure ("Clot" on the thrombus) and a what-if slider's name are not a cause's name)
const NOT_NAMES = new Set(['mark', 'marks', 'whatIf', 'notes']);

/** Put each cause's long and short name in every node that names it. Returns how many fields changed. */
export function causeNames(deck) {
  let n = 0;
  const walk = (node, slide, key) => {
    if (Array.isArray(node)) { node.forEach((x) => walk(x, slide, key)); return; }
    if (!node || typeof node !== 'object') return;
    const own = LONG_FIELDS.filter((f) => typeof node[f] === 'string');
    const c = own.map((f) => causeOfName(node[f])).find(Boolean);
    if (c) {
      for (const f of own) if (causeOfName(node[f]) === c && node[f] !== c.long) { node[f] = c.long; n++; }
      // (a chip or a point on the plane has a short name for where the room is short; a table row has none, and takes none)
      const wantsShort = 'short' in node || 'label' in node || key === 'compare' || slide.visual === 'plane' || slide.tool?.kind === 'saag';
      if (wantsShort && c.short !== c.long && node.short !== c.short) { node.short = c.short; n++; }
    }
    for (const [k, v] of Object.entries(node)) if (!NOT_NAMES.has(k)) walk(v, slide, k);
  };
  for (const s of deck.slides) walk(s, s, '');
  return n;
}

const PROSE = ['kicker', 'title', 'line', 'caveat', 'vignette', 'caseQ', 'question'];
// (what a slide prints besides prose: ids, presets and the other machine fields are not words)
const MACHINE = new Set(['notes', 'id', 'preset', 'cam', 'lens', 'tiles', 'key', 'cols', 'glow', 'labels', 'terms', 'tool', 'plane', 'rail', 'visual', 'data', 'at', 'kind', 'vessel', 'vessels', 'edges', 'site', 'same', 'own', 'ref', 'glowSeq', 'steps', 'sameAs', 'days', 'lit', 'reads']);
export const wordRe = (a) => new RegExp(`(^|[^A-Za-z])${a}(?![A-Za-z])`);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every string a slide prints, with the object and key that hold it (so a prose field can be told from a chip). */
export function leaves(slide) {
  const out = [];
  const walk = (node, holder, key) => {
    if (typeof node === 'string') { out.push({ holder, key, text: node }); return; }
    if (Array.isArray(node)) { node.forEach((x, i) => walk(x, node, i)); return; }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!MACHINE.has(k)) walk(v, node, k);
  };
  walk(slide, null, '');
  return out;
}
const inBraces = (t, i) => (t.slice(0, i).match(/\{/g) ?? []).length > (t.slice(0, i).match(/\}/g) ?? []).length;

/** Spell out each cause abbreviation (SOS, PVT) where the talk first uses it. Returns what it could not place (the abbreviation, the slide). */
export function defineFirst(deck) {
  const left = [];
  for (const c of CAUSES.filter((x) => x.abbr)) {
    const A = c.abbr, longRe = new RegExp(esc(c.long), 'i'), done = new RegExp(`${esc(c.long)}\\s*\\(${A}\\)|${A}\\s*\\(${esc(c.long)}\\)`, 'i');
    const per = deck.slides.map(leaves);
    const use = per.findIndex((ls) => ls.some((l) => wordRe(A).test(l.text)));
    if (use < 0) continue;
    if (per.slice(0, use + 1).some((ls) => ls.some((l) => done.test(l.text)))) continue;
    let placed = false;
    // (the long name's first mention in prose, at or before the first use: the abbreviation follows it)
    for (let s = 0; s <= use && !placed; s++) {
      for (const l of per[s]) {
        if (typeof l.key !== 'string' || !PROSE.includes(l.key)) continue;
        const m = longRe.exec(l.text);
        if (!m || inBraces(l.text, m.index)) continue;
        const at = m.index + m[0].length;
        if (l.text[at] === ' ' && l.text[at + 1] === '(') continue;
        l.holder[l.key] = `${l.text.slice(0, at)} (${A})${l.text.slice(at)}`;
        placed = true; break;
      }
    }
    // (no mention before: the first use in prose becomes the long name with its abbreviation)
    if (!placed) {
      for (const l of per[use]) {
        if (typeof l.key !== 'string' || !PROSE.includes(l.key)) continue;
        const m = wordRe(A).exec(l.text);
        if (!m) continue;
        const i = m.index + m[1].length;
        if (inBraces(l.text, i)) continue;
        const start = i === 0 || /[.!?:]\s$/.test(l.text.slice(0, i));
        const words = start ? c.long : c.long[0].toLowerCase() + c.long.slice(1);
        l.holder[l.key] = `${l.text.slice(0, i)}${words} (${A})${l.text.slice(i + A.length)}`;
        placed = true; break;
      }
    }
    if (!placed) left.push([A, use]);
  }
  return left;
}

/** A deck's JSON text with the name table put in (a deck it changes nothing in comes back as it was). */
export function namesEdits(json) {
  const deck = JSON.parse(json);
  if (!Array.isArray(deck.slides)) return json;
  const indent = /^\{\n( +)/.exec(json)?.[1].length ?? 1, before = JSON.stringify(deck, null, indent);
  causeNames(deck);
  defineFirst(deck);
  const after = JSON.stringify(deck, null, indent);
  return after === before ? json : after;
}

/** The profile charts' generated text with the zone strip's words taken from LIVER_ZONES (the two generators call it, and apply-names.mjs on the files already written). */
export function zoneEdit(text) {
  const cls = ['ppf-zone ppf-pre', 'ppf-zone ppf-liver', 'ppf-zone ppf-post'];
  const zones = '// 3D departure (25 Nov 2026, capture 36b7deac review item 3): the strip over the plot says Before the liver / In the liver / After the liver (src/decks/names.ts LIVER_ZONES),\n'
    + '// and where those do not fit, BEFORE, LIVER, AFTER: never a bare PRE, INTRA or POST, which are the stations\' own Pre-, Intra- and Post- under the axis.\n'
    + `export const ZONES = [\n${LIVER_ZONES.map((z, k) => `  { cls: '${cls[k]}', one: '${z.one.toUpperCase()}', top: '${z.word.toUpperCase()}' }`).join(',\n')}];`;
  let out = text.replace(/(?:\/\/ 3D departure \(25 Nov 2026, capture 36b7deac review item 3\)[^\n]*\n\/\/ and where[^\n]*\n)?export const ZONES = \[[\s\S]*?\];/, zones);
  if (out.includes('export const ZONE_SECOND')) out = out.replace(/export const ZONE_SECOND = '[^']*';/, `export const ZONE_SECOND = '${LIVER_ZONES[0].second.toUpperCase()}';`);
  return out;
}
