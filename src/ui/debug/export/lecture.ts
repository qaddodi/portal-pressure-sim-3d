// One lecture (deck) as one Markdown outline: for every slide its two cards in full (the words card and the data card, with the live readings printed the way the cards print them, from the same
// per-slide states the cards read), the figure's camera in numbers and in words (what it is centred on, how far in, what stands in the room, where the labels stand), the lens, the marks
// and the vessels in view, and a flat wireframe of the slide (wire.ts). Pure: a deck and its states in, text out. The node script (scripts/export-lectures.mjs) loads the deck and zips the files.
import type { Deck, Slide } from '../../../decks/schema.ts';
import { caseOf } from '../../../decks/schema.ts';
import { outlineOf, OUTLINE_TITLE } from '../../../decks/outline.ts';
import type { CopiedDeck, CopiedSlide } from '../../../decks/hp/types.ts';
import { planSlide } from '../../../decks/hp/plan.ts';
import { camPlan } from '../../../decks/hp/cams.ts';
import { parseLine } from '../../text/line.ts';
import { valueText, type Fp } from '../../text/tokens.ts';
import { valueText as tableValue } from '../../talk/table-model.ts';
import { COLS } from '../../deck/from2d/table-marks.js';
import { TILE } from '../../charts/tiles.generated.ts';
import { SITE_TAGS } from '../../cards/card-fields.ts';
import { UI } from '../../strings.generated.ts';
import type { BakedDeck } from '../../charts/baked/store.ts';
import type { ViewState } from '../../charts/baked/view.ts';
import { estimateNeeds, framingOf, type Framing } from './frame.ts';
import type { Viewport } from '../../layout/device.ts';
import { surveyOf, wireSvg, type Survey } from './wire.ts';

export interface LectureInput {
  deck: Deck;
  copied: CopiedDeck;
  /** each slide's state (mergeStates): index 0 is the first slide */
  states: readonly (ViewState | undefined)[] | undefined;
  baked: BakedDeck | null;
  vp: Viewport;
  /** the screen's name in words ("Mac 1440×900") */
  screen: string;
  /** write wireframes (default true) */
  wire?: boolean;
  /** include each slide's speaker notes and question */
  notes?: boolean;
  /** only these slides (1-based); absent: all */
  only?: readonly number[];
}
export interface LectureOut { id: string; file: string; markdown: string; wires: { name: string; svg: string }[]; slides: { n: number; id: string; title: string }[]; missing: number; seconds: number }

const slug = (s: string) => s.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const SHORT = 90;

/** A line of words as the card prints it: bold and terms marked, each reading in its tile's own format from this slide's state (or the named slide's), a cut-off as a symbol. */
export function cardWords(text: string, fp: Fp | null, fpAt: (slideId: string) => Fp | null): string {
  let pieces: ReturnType<typeof parseLine>;
  try { pieces = parseLine(text); } catch { return text; }
  return pieces.map((p) => {
    switch (p.t) {
      case 'text': return p.text;
      case 'bold': return `**${p.text}**`;
      case 'term': return `${p.label}`;
      case 'value': return `**${valueText(p.key, p.at ? fpAt(p.at) : fp, p.decimals === 0)}**`;
      case 'cutoff': return p.text.replace(/ /g, ' ');
      case 'literal': return p.text;
      case 'step': return `(${p.n})`;
    }
  }).join('');
}

/** What an instrument is, in a line (the data card's `tool.kind`). */
const TOOL_WORDS: Readonly<Record<string, string>> = {
  criteria: 'a checklist of criteria, each marked met or not', flowtime: 'a flow-over-time chart', path: 'the path of a reading across the slides', doppler: 'a Doppler ultrasound trace',
  profile: 'a pressure profile along the vessels', curve: 'a curve of one reading against another', trace: 'a trace over time', flows: 'a flow diagram', fibroscan: 'a FibroScan reading',
  vitals: 'a vital-signs monitor', lumen: 'a lumen (vessel width) picture', stent: 'a stent picture', plane: 'a pressure plane (two readings against each other)', trial: 'a trial result card',
  evgraph: 'an event graph of the procedure', scope: 'an endoscope view', reading: 'one large reading', shift: 'a shift (before and after)',
  wall: 'a vessel wall picture', saag: 'the SAAG calculation', fluid: 'a fluid-forces picture', abdomen: 'an abdomen picture',
  hvpg: 'the HVPG catheter reading', menu: 'a menu of choices', lobule: 'a lobule picture', course: 'a course over time', forest: 'a forest plot',
  tiles: 'tiles of readings',
};
/** The words in an instrument's spec that a reader sees, by key. */
const TEXT_KEYS = new Set(['title', 'lead', 'rule', 'verdict', 'text', 'note', 'label', 'words', 'deltaLabel', 'fromLabel', 'name', 'caption', 'foot', 'head', 'sub', 'subtitle', 'patient']);

function textsOf(v: unknown, depth: number, out: string[]): void {
  if (depth > 4 || v == null) return;
  if (Array.isArray(v)) { for (const x of v) textsOf(x, depth + 1, out); return; }
  if (typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x === 'string') { if (TEXT_KEYS.has(k) && x.trim() && !out.includes(x)) out.push(x); } else textsOf(x, depth + 1, out);
  }
}
const scalarsOf = (o: Record<string, unknown>): string[] => Object.entries(o).flatMap(([k, v]) => {
  if (k === 'kind' || TEXT_KEYS.has(k)) return [];
  if (typeof v === 'string' && v.length <= 40) return [`${k}: ${v}`];
  if (typeof v === 'number' || typeof v === 'boolean') return [`${k}: ${v}`];
  if (Array.isArray(v) && v.length && v.length <= 8 && v.every((x) => typeof x === 'string' && x.length <= 24)) return [`${k}: ${(v as string[]).join(', ')}`];
  return [];
});

/** The live controls on the words card, in words: what each does. */
function controlWords(ctl: Record<string, unknown>, fp: Fp | null, slideFp: (id: string) => Fp | null): string[] {
  const out: string[] = [];
  const cmp = ctl.compare as { opts?: { label?: string; title?: string; line?: string }[]; name?: string } | undefined;
  if (cmp?.opts?.length) {
    const named = cmp.name ? ` (${cmp.name})` : '';
    const labels = cmp.opts.map((o) => `"${o.label ?? '?'}"`).join(', ');
    out.push(`- **Buttons on the words card${named}:** ${labels}; each puts that patient or treatment on the live model and the readings and words change`);
    for (const o of cmp.opts) if (o.line) out.push(`  - after "${o.label}": ${cardWords(o.line, fp, slideFp).slice(0, 240)}`);
  }
  const sc = ctl.scales as { own?: string; list?: string[] } | undefined;
  if (sc?.list) out.push(`- **View buttons:** ${sc.list.join(', ')} (opens on ${sc.own ?? sc.list[0]})`);
  const wi = ctl.whatIf as { label?: string; param?: string; min?: number; max?: number; ends?: string[] } | undefined;
  if (wi) out.push(`- **Slider:** ${wi.label ?? wi.param ?? 'a what-if'}${wi.min != null ? `, ${wi.min} to ${wi.max}` : ''}${wi.ends ? ` (${wi.ends.join(' to ')})` : ''}`);
  if (ctl.strain) out.push('- **Strain control:** the room can strain on the figure');
  return out;
}

/** The data card of a slide, as lines: the instrument, the tiles with their readings, the table. */
function dataCard(s: Slide, c: CopiedSlide, fps: (Fp | null)[], i: number, deck: Deck, baked: BakedDeck | null, slideFp: (id: string) => Fp | null): string[] {
  const out: string[] = [];
  const fp = fps[i] ?? null;
  const tool = c.tool as Record<string, unknown> | null | undefined;
  if (tool && typeof tool.kind === 'string') {
    out.push(`- **Instrument:** \`${tool.kind}\`, ${TOOL_WORDS[tool.kind] ?? 'an instrument'}`);
    const words: string[] = [];
    if (Array.isArray(tool.rows)) {
      for (const r of tool.rows as (string | unknown[] | Record<string, unknown>)[]) if (typeof r === 'string') words.push(r);
      // (a row the card tests against a reading is [words, key, comparison, cut-off]: its words are the criterion)
      else if (Array.isArray(r)) { if (typeof r[0] === 'string') words.push(r[0]); }
      else if (r && typeof r.text === 'string') words.push(`${r.text}${typeof r.note === 'string' ? ` [${r.note}]` : ''}${r.met ? ' (met)' : ''}`);
    }
    textsOf({ ...tool, rows: undefined }, 0, words);
    for (const w of words.slice(0, 12)) out.push(`  - ${cardWords(w, fp, slideFp).slice(0, 220)}`);
    const sc = scalarsOf(tool);
    if (sc.length) out.push(`  - settings: ${sc.slice(0, 10).join('; ')}`);
  }
  if (s.visual === 'table' && s.table) {
    const t = s.table, cols = t.cols ?? ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'];
    out.push(`- **Summary table** (${t.of.length} patients${t.asc ? ', with the ascites pair' : ''}; one row per patient, one column per reading):`, '');
    out.push(`  | ${[t.rowHead ?? 'Patient', ...cols.map((k) => (COLS as Record<string, string>)[k] ?? TILE[k]?.n ?? TILE[k]?.t ?? k)].join(' | ')} |`, `  |${' --- |'.repeat(cols.length + 1)}`);
    t.of.forEach((row, ri) => {
      const spec = typeof row === 'string' ? { id: row } : row;
      const own = spec.id ? slideFp(spec.id) : (baked?.tables?.[s.id]?.[ri] ?? null);
      const named = spec.id ? deck.slides.find((x) => x.id === spec.id) : null;
      const label = spec.title ?? spec.key ?? named?.title ?? spec.id ?? spec.preset ?? `row ${ri + 1}`;
      const show = (k: string): string => {
        if (k === 'wave') return '(waveform)';
        if (!own) return '…';
        return k === 'res' ? tableValue(k, own as Parameters<typeof tableValue>[1]) : valueText(k, own as Fp);
      };
      out.push(`  | ${[cell(label), ...cols.map(show)].join(' | ')} |`);
    });
    if (t.note) out.push('', `  note: ${cardWords(([] as string[]).concat(t.note).join(' '), fp, slideFp)}`);
  }
  if (s.tiles) {
    const keys = s.tiles.keys, hot = new Set(s.tiles.key);
    const arrows = s.tiles.delta ? ` (change arrows on: ${String(s.tiles.delta)})` : '';
    const tiles = keys.map((k) => `${TILE[k]?.n ?? TILE[k]?.t ?? k} ${valueText(k, fp)}${hot.has(k) ? ' (key)' : ''}`);
    out.push(`- **Tiles${arrows}:** ${tiles.join(' · ')}`);
  }
  if (s.visual && s.visual !== 'table') out.push(`- **Visual:** \`${s.visual}\`, the data card carries this slide`);
  if (s.scores) out.push(`- **Liver-function card:** ${Object.entries(s.scores).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (s.controls) out.push(...controlWords(s.controls as Record<string, unknown>, fp, slideFp));
  if (!out.length) out.push('- (no data card: the figure has the room)');
  return out;
}

/** The camera in words: what it is centred on, how far in, what stands in the room, what is cut, where the labels stand. */
function figureWords(fr: Framing, sv: Survey, c: ReturnType<typeof planSlide>, shot: { yaw: number; pitch: number }): string[] {
  const out: string[] = [];
  const mag = sv.heightShown > 0 ? 1 / sv.heightShown : 1;
  const how = sv.heightShown >= 0.85 ? 'the whole figure' : sv.heightShown >= 0.45 ? 'a wide view' : sv.heightShown >= 0.2 ? 'a medium close-up' : 'a close-up';
  out.push(`- **Framing:** ${how}, centred on \`${c.cam.name}\`. The room shows ${pct(sv.heightShown)} of the whole figure's height (${round(mag)}× in).`);
  const deg = (r: number) => round((Math.abs(r) * 180) / Math.PI);
  const turn = [
    shot.yaw ? `${deg(shot.yaw)}° to the viewer's ${shot.yaw > 0 ? 'right' : 'left'}` : '',
    shot.pitch ? `${deg(shot.pitch)}° ${shot.pitch > 0 ? 'above' : 'below'} level` : '',
  ].filter(Boolean);
  const turned = turn.length ? `turned ${turn.join(', ')}` : 'face-on (no turn, no tilt)';
  out.push(`- **Camera:** ${turned}; ${round(fr.distance, 2)} scene units away; the room leaves ${Math.round(fr.free.w)}×${Math.round(fr.free.h)} px.`);
  const shown = sv.organs.filter((o) => o.shown > 0.05);
  if (shown.length) {
    const word = (o: (typeof shown)[number]) => `${o.word} (${o.shown >= 0.97 ? 'whole' : `${pct(o.shown)} in frame`}, ${pct(o.span[0])} of the room's width)`;
    out.push(`- **Organs in the room:** ${shown.slice(0, 6).map(word).join('; ')}`);
  } else out.push('- **Organs in the room:** none (the frame is on vessels alone or off the body)');
  const cut = shown.filter((o) => o.shown > 0.05 && o.shown < 0.6).map((o) => o.word);
  if (cut.length) out.push(`- **Cut by the room's edge:** ${cut.join(', ')}`);
  return out;
}

/** The slide's figure words that are not the camera: lens, labels, marks, lit parts, scene effects. */
function figureMarks(s: Slide, c: CopiedSlide, sv: Survey, fp: Fp | null, slideFp: (id: string) => Fp | null): string[] {
  const out: string[] = [];
  const lens = UI.lenses.find((l) => l.id === (s.scene?.lens ?? 'pressure'));
  out.push(`- **Lens:** ${lens ? `${lens.name} (${lens.note})` : s.scene?.lens ?? 'pressure'}${c.lens ? '' : ' (the default; the slide asks for none)'}`);
  out.push('- **Look:** the reader\'s own look (light, dark and the others); a slide never sets one');
  if (sv.stations.length) {
    const edge = (st: Survey['stations'][number]) => (st.clear >= 40 ? `${st.clear} px clear` : `only ${st.clear} px from the room's edge`);
    out.push(`- **Labels on the figure:** ${sv.stations.map((st) => `${st.name} (${st.where}, ${edge(st)})`).join('; ')}`);
  }
  const lit = s.scene?.terms ?? [];
  if (lit.length) out.push(`- **Parts the words point at:** ${lit.join(', ')}`);
  const bits: string[] = [];
  const marks = ([] as Record<string, unknown>[]).concat((c.mark ?? c.marks ?? []) as Record<string, unknown>[]);
  for (const m of marks) {
    if (!m || typeof m !== 'object') continue;
    const on = String(m.organ ?? (Array.isArray(m.edges) ? m.edges.join('+') : m.seg ?? m.kind ?? 'the figure'));
    bits.push(`mark on ${on}${typeof m.label === 'string' ? `: "${cardWords(m.label, fp, slideFp)}"` : ''}`);
  }
  const co = c.callout as { at?: string; label?: string } | undefined;
  if (co && typeof co === 'object' && co.label) bits.push(`callout "${cardWords(co.label, fp, slideFp)}" at ${co.at ?? '?'}`);
  for (const k of ['glow', 'tint', 'layers', 'stented', 'lapseGlow', 'spot'] as const) { const v = c[k]; if (Array.isArray(v) && v.length) bits.push(`${k}: ${v.join(', ')}`); }
  for (const k of ['ghostStent', 'wash', 'strain', 'ripple'] as const) if (c[k]) bits.push(k);
  if (c.cath) bits.push(`catheter: ${String(c.cath)}`);
  if (c.view) bits.push(`view: ${String(c.view)}`);
  if (typeof c.procedure === 'string') bits.push(`procedure: ${c.procedure}`);
  if (bits.length) out.push(`- **Marks and effects:** ${bits.join('; ')}`);
  if (sv.vessels.length) {
    const names = [...new Set([...sv.vessels].sort((a, b) => b.widthPx - a.widthPx).map((v) => v.label))];
    out.push(`- **Vessels in the room (${names.length}, widest first):** ${names.slice(0, 14).join(', ')}${names.length > 14 ? ', and finer ones' : ''}`);
  }
  return out;
}

/** A lapse on the seconds clock (the meal step): its `days` only drive the engine's clock and are not a span of days to print. */
const isSecondsLapse = (c: CopiedSlide): boolean => (c.lapse as { clock?: string } | null | undefined)?.clock === 'seconds';

const modelWords = (c: CopiedSlide): string => {
  const bits: string[] = [];
  if (c.preset) bits.push(`patient ${c.preset}${c.presetDays ? ` (${c.presetDays} days)` : ''}`);
  if (c.params) bits.push(`changes ${JSON.stringify(c.params).slice(0, 120)}`);
  if (c.action) bits.push(`action ${JSON.stringify(c.action).slice(0, 100)}`);
  if (c.days) bits.push(isSecondsLapse(c) ? `a meal passes (${(c.lapse as { seconds?: number }).seconds ?? 6} s on screen)` : `${c.days} days pass`);
  if (c.sameAs) bits.push(`same as slide "${c.sameAs}"`);
  return bits.length ? bits.join('; ') : 'the patient the slide before had';
};

/** A deck as its Markdown file and its wireframes. */
export function lectureOf(inp: LectureInput, clockMs: () => number): LectureOut {
  const t0 = clockMs();
  const { deck, copied, vp } = inp;
  const wantWire = inp.wire !== false;
  const fps: (Fp | null)[] = deck.slides.map((_, i) => (inp.states?.[i]?.fp as Fp | undefined) ?? null);
  const byId = new Map(deck.slides.map((s, i) => [s.id, i]));
  const slideFp = (id: string): Fp | null => { const j = byId.get(id); return j == null ? null : fps[j] ?? null; };
  const missing = fps.filter((f) => !f).length;
  const whole = (camPlan('fit') as { shot: { half: [number, number] } }).shot;
  const md: string[] = [];
  const wires: { name: string; svg: string }[] = [];
  const list: LectureOut['slides'] = [];
  md.push(`# ${deck.title}`, '', `*${deck.level} · ${deck.minutes} min · ${deck.slides.length} slides · screen planned: ${inp.screen}*`, '', deck.summary, '');
  md.push('**By the end you can:**', ...deck.objectives.map((o) => `- ${o}`), '', `**${OUTLINE_TITLE}:** ${outlineOf(deck).join(' → ')}`, '');
  if (missing) {
    md.push(`> **Numbers missing for ${missing} slide(s):** the baked per-slide states for this talk were not found, so readings print as "…".`);
    md.push(`> Run \`node scripts/bake-charts.mjs --only ${deck.id}\`.`, '');
  }
  const only = inp.only?.length ? new Set(inp.only) : null;
  deck.slides.forEach((s, i) => {
    const n = i + 1;
    if (only && !only.has(n)) return;
    const c = copied.slides[i]!;
    const fp = fps[i] ?? null;
    const plan = planSlide(deck.id, c, i);
    const shot = plan.scene.shot;
    const opening = caseOf(s);
    const body = [s.line, s.caveat ?? '', s.cite ?? ''].join(' ');
    const dataKind = s.table ? 'table' as const : s.tiles && !s.tool ? 'tiles' as const : s.tool || s.visual || s.scores ? 'tool' as const : s.tiles ? 'tiles' as const : 'none' as const;
    const needs = estimateNeeds(vp, { title: s.title, body, extra: (s.eq ? 60 : 0) + (s.sides ? 90 : 0) }, dataKind === 'none' ? null : { kind: dataKind, rows: s.table?.of.length });
    const fr = framingOf(shot, vp, needs);
    const body3d = plan.scene.view === 'body';
    const sv = body3d ? surveyOf(fr, plan.scene.labels, whole) : surveyOf({ ...fr, free: { x: 0, y: 0, w: 0, h: 0 } }, [], whole);
    const wireName = `wire/${String(n).padStart(2, '0')}-${slug(s.id)}.svg`;
    if (wantWire) {
      const notDrawn = body3d ? undefined : plan.scene.view === 'circuit'
        ? 'Circuit map view: a 2D diagram, not drawn in node'
        : `${plan.scene.view} view: a close-up of the liver's own structure, not drawn in node`;
      const placed = fr.plan.cards.map((cd) => ({ name: cd.slot === 'words' ? 'Words card' : 'Data card', note: `planned, height estimated ${Math.round(cd.rect.h)} px` }));
      wires.push({ name: wireName, svg: wireSvg(fr, { title: `${deck.title}, slide ${n}: ${s.title}`, notDrawn, labels: plan.scene.labels, cards: placed }) });
    }
    list.push({ n, id: s.id, title: s.title });
    md.push('---', '', `## ${n}. ${s.title}`, '');
    const tag = s.site ? SITE_TAGS[s.site] ?? s.site : '';
    md.push(`*${[s.kicker, tag && `level: ${tag}${s.also ? ` + ${SITE_TAGS[s.also] ?? s.also}` : ''}`, `id \`${s.id}\``].filter(Boolean).join(' · ')}*`, '');
    if (wantWire) md.push(`![wireframe of slide ${n}](${wireName})`, '');
    const box = (r: { x: number; y: number; w: number; h: number }) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}`;
    const placed = fr.plan.cards.map((cd) => `${cd.slot === 'words' ? 'words card' : 'data card'} at ${box(cd.rect)}`).join('; ');
    md.push(`**Layout (${inp.screen}):** ${placed}; figure room ${box(fr.free)}. Card heights are estimated from the words; nothing is measured here.`, '');
    if (opening) {
      md.push(`### Opens on a ${opening.kicker.toLowerCase()} card`, '', quote(cardWords(opening.text, fp, slideFp)));
      if (s.caseQ) md.push('', `Case question: **${cardWords(s.caseQ, fp, slideFp)}**`);
      if (s.interact?.commit.kind === 'choose') md.push('', ...s.interact.commit.options.map((o) => `- ${o.right ? '[right] ' : ''}${o.text}`));
      md.push('');
    }
    md.push('### Card 1: the words', '', `**${s.title}**`, '');
    if (s.line) md.push(quote(cardWords(s.line, fp, slideFp)), '');
    if (s.lineAhead) md.push(`Before the result is on the figure, the words read:`, '', quote(cardWords(s.lineAhead, fp, slideFp)), '');
    if (s.eq) md.push(`Equation: \`${s.eq.map((p) => (p.sub ? `${p.text}[${p.sub}]` : p.text)).join(' ')}\`${s.eqLegend ? ` (${s.eqLegend})` : ''}`, '');
    if (s.sides) md.push(...s.sides.map((x) => `- **${x.who}:** ${cardWords(x.text, fp, slideFp)}`), '');
    if (s.causes) md.push(`${s.causesHead ?? 'Causes'}: ${s.causes.join('; ')}`, '');
    if (s.caveat) md.push(`Caveat: ${s.caveat}`, '');
    if (s.cite) md.push(`Source line: ${s.cite}`, '');
    md.push('### Card 2: the data', '', ...dataCard(s, c, fps, i, deck, inp.baked, slideFp), '');
    md.push('### Figure', '');
    if (!body3d) {
      const cam = plan.scene.lobuleCam ? `, camera \`${plan.scene.lobuleCam}\`` : '';
      const ci = plan.scene.circuit;
      const map = ci ? `, map box ${ci.box.join(', ')}${ci.kMax ? `, closest zoom ${ci.kMax}× the whole map` : ''}` : '';
      md.push(`- **View:** ${plan.scene.view}${cam}${map}. The wireframe does not draw this view.`);
    } else md.push(...figureWords(fr, sv, plan, shot));
    md.push(...figureMarks(s, c, body3d ? sv : { ...sv, vessels: [] }, fp, slideFp));
    md.push(`- **Patient:** ${modelWords(c)}`);
    if (s.beats?.length) {
      const views = s.beats.map((b) => `${b.view}${b.lens !== plan.scene.lens ? `, lens ${b.lens}` : ''}`).join('; ');
      md.push(`- **Then, on each Next:** ${s.beats.length} more view(s) of the figure (${views}); the words and data stay`);
    }
    const lapseSpan = s.lapse ? (isSecondsLapse(c) ? 'a meal, on the seconds clock' : `${s.lapse.days} days`) : '';
    if (s.lapse) md.push(`- **Time-lapse:** ${lapseSpan}${s.lapse.from ? `, "${s.lapse.from}" to "${s.lapse.to}"` : ''}${s.lapse.plays ? ', plays on the figure' : ''}`);
    md.push('');
    if (inp.notes) {
      md.push(`### Speaker notes`, '', s.notes, '');
      if (s.ask) md.push(`Question for the room: **${s.ask[0]}** Answer: ${s.ask[1]}`, '');
    }
  });
  if (!only) {
    const last = fps[fps.length - 1] ?? null;
    md.push('---', '', '## Quick check', '');
    deck.checks.forEach(([q, a], i) => md.push(`${i + 1}. **${cardWords(q, last, slideFp)}**`, `   - ${cardWords(a, last, slideFp)}`));
    md.push('');
  }
  return { id: deck.id, file: `${deck.id}.md`, markdown: `${md.join('\n').replace(/\n{3,}/g, '\n\n')}\n`, wires, slides: list, missing, seconds: (clockMs() - t0) / 1000 };
}
