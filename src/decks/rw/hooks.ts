// What a 2D slide needs from the rest of the 3D app, as named hooks ("claimed hooks", parity plan B13). A slide is a list of fields; each field either is words, steers the
// model or camera (this folder carries it out), or asks for a feature another batch builds: a chart, an instrument, a lens, a procedure, a callout, a time-lapse. The feature
// gets a hook id; the batch that builds it calls `registerHook(id)` in the push that lands it, and every slide that needs it then reads as playable. Until then the slide's
// words, numbers and shot are all there and its hook is listed with its owner, so nothing is half-hidden and nothing is faked.
//
// Deck-agnostic: `hooksOf(slide)` reads any 2D deck's slide. A field this file does not know FAILS (tests/decks-rw-hooks.test.ts), so a new 2D field can never be skipped quietly.
import type { CopiedSlide } from './types.ts';

export interface Hook { id: string; owner: string; what: string }

const hook = (id: string, owner: string, what: string): Hook => ({ id, owner, what });

// ── the feature catalogue ──
/** Tool kinds (`tool: { kind }`) by the batch that draws them (parity plan: B10 charts, B11 instruments). */
const TOOL_OWNER: Record<string, string> = {
  criteria: 'B10', profile: 'B10', flowtime: 'B10', path: 'B10', curve: 'B10', trial: 'B10', flows: 'B10', lumen: 'B10', plane: 'B10', fluid: 'B10', forest: 'B10', stent: 'B10',
  course: 'B10', saag: 'B10', shift: 'B10', evgraph: 'B10', stiffness: 'B10',
  doppler: 'B11', trace: 'B11', hvpg: 'B11', fibroscan: 'B11', scope: 'B11', abdomen: 'B11', wall: 'B11', reading: 'B11', vitals: 'B11',
  menu: 'B12',
};
const PROCEDURE_OWNER = 'B5';
const VISUAL_OWNER: Record<string, string> = { table: 'B12', ladders: 'B12', outline: 'B12', check: 'B12', plane: 'B10', scale: 'B12', quadrant: 'B10', walls: 'B12', allpatients: 'B12' };

/** The fields that carry words (the cards typeset them) or are read by another field's feature; they need nothing of their own. */
const WORDS = new Set(['id', 'kicker', 'title', 'line', 'notes', 'ask', 'caveat', 'cite', 'site', 'vignette', 'causes', 'causesHead', 'eq', 'terms', 'tick', 'when', 'milestone', 'pill', 'bold', 'chartFoot']);
/** The fields that steer the model (numbers.ts runs them) or the camera (cams.ts frames them). */
const MODEL = new Set(['preset', 'presetDays', 'params', 'action', 'days', 'relax', 'ramp']);
const CAMERA = new Set(['cam', 'kMax', 'zone']);
/** Fields of a feature that another field names: the data card's tiles, the table's columns. They are part of that feature's hook. */
const PART_OF: Record<string, string> = {
  tiles: 'data', key: 'data', delta: 'data', dataTitle: 'data',
  of: 'visual', cols: 'visual', asc: 'visual', rowHead: 'visual', note: 'visual', vs: 'visual', foot: 'visual', focusRow: 'visual', plane: 'visual', cohort: 'visual', column: 'visual',
  beats: 'tool', wave: 'tool', graph: 'lapse', span: 'sites', marks: 'mark',
};

const COMPARE_WHAT: Record<string, string> = { params: 'the treatment', preset: 'the patient', slide: 'to another slide\'s state', lens: 'the lens', gate: 'the Doppler gate', tool: 'the instrument\'s options', days: 'the days' };
const compareKind = (c: Record<string, unknown>): string => ('params' in c ? 'params' : 'preset' in c ? 'preset' : 'slide' in c ? 'slide' : 'lens' in c ? 'lens' : 'gate' in c ? 'gate' : 'tool' in c ? 'tool' : 'days' in c ? 'days' : 'own');

/** The hooks a slide needs. `view` is the slide's own view field ('circuit'); the lobule and sinusoid views come from `cam`. */
export function hooksOf(s: CopiedSlide): Hook[] {
  const out = new Map<string, Hook>();
  const add = (h: Hook) => { out.set(h.id, h); };
  const bad: string[] = [];
  // Every slide needs the presenter to play its deck (today the presenter plays the HVPG deck's slice) and the page to run the deck's model steps on the engine worker.
  add(hook('presenter:deck', 'B12', 'the presenter plays decks beyond the slice: their stops, case cards, data card and quick check'));
  add(hook('engine:steps', 'S1', 'the page runs a deck\'s model chain on the engine worker (the host\'s `sequence`, streamed per slide)'));
  const cam = s.cam;
  if (typeof cam === 'string' && cam.startsWith('lobule')) add(hook('view:lobule', 'B8', 'the lobule view and its camera'));
  if (cam === 'sinusoid') add(hook('view:sinusoid', 'B8', 'the sinusoid view'));
  if (s.view === 'circuit') add(hook('view:circuit', 'B7', 'the Circuit view'));
  for (const f of Object.keys(s)) {
    const v = s[f];
    if (WORDS.has(f) || MODEL.has(f) || CAMERA.has(f)) continue;
    const parent = PART_OF[f];
    if (parent) continue;
    switch (f) {
      case 'view': if (v !== 'circuit' && v !== 'anatomic') bad.push(`view ${JSON.stringify(v)}`); break;
      case 'lens': add(hook(`lens:${String(v)}`, 'B3', `the ${String(v)} colour lens on the vessels`)); break;
      case 'since': case 'sinceLabel': add(hook('lens:since', 'B3', 'the "since" colour lens')); break;
      case 'labels': case 'tint': add(hook('figure:labels', 'B6', 'station labels named by the slide')); break;
      case 'glow': case 'glowSeq': case 'steps': case 'spot': case 'normalOutline': case 'ripple': case 'lapseGlow': add(hook('figure:glow', 'B3', 'the slide lights vessels and organs (glow, spot, numbered steps)')); break;
      case 'mark': case 'callout': add(hook('callout:slide', 'B6', 'the slide\'s call-out on the figure')); break;
      case 'sites': add(hook('callout:sites', 'B6', 'readings on the figure (pv, ivc, ra, split)')); break;
      case 'calipers': add(hook('figure:calipers', 'B11', 'calipers measuring a vessel on the figure')); break;
      case 'stented': add(hook('device:stent', 'B5', 'a stent drawn in a vein the model has no device for')); break;
      case 'cath': add(hook(`device:hvpg-catheter:${String(v)}`, 'B5', `the HVPG catheter, ${String(v)}`)); break;
      case 'cathKeep': add(hook('device:hvpg-catheter:keep', 'B5', 'the catheter stays in place across a lobule dive')); break;
      case 'wash': add(hook('view:wash', 'B8', 'the wedge\'s amber spreading along the sinusoid')); break;
      case 'layers': add(hook('view:layers', 'B8', 'the lobule\'s zone bands')); break;
      case 'scales': add(hook('view:scales', 'B8', 'the Anatomy / Lobule / Sinusoid switch on a slide')); break;
      case 'data': add(hook('card:tiles', 'B10', 'the data card of tiles with their ratings and changes')); break;
      case 'tool': {
        const t = v as { kind?: string; catheter?: unknown } | undefined;
        if (!t?.kind || !(t.kind in TOOL_OWNER)) { bad.push(`tool kind ${JSON.stringify(t?.kind)}`); break; }
        add(hook(`tool:${t.kind}`, TOOL_OWNER[t.kind]!, `the ${t.kind} instrument or chart in the data card`));
        break;
      }
      case 'visual': {
        const k = String(v);
        if (!(k in VISUAL_OWNER)) { bad.push(`visual ${k}`); break; }
        add(hook(`visual:${k}`, VISUAL_OWNER[k]!, `the ${k} over the dimmed figure`));
        break;
      }
      case 'compare': {
        // (a button group switches the model, the patient, a slide's state, the lens, the gate, the instrument or the days; `{ own: true }` is the slide's own state, a button of whichever group it is in)
        const kinds = new Set((v as Record<string, unknown>[]).map(compareKind).filter((k) => k !== 'own'));
        if (!kinds.size) kinds.add('params');
        for (const k of kinds) add(hook(`compare:${k}`, 'B12', `buttons that switch ${COMPARE_WHAT[k] ?? 'the model'} live`));
        break;
      }
      case 'whatIf': add(hook('slider:whatIf', 'B12', 'a slider that drags one parameter of the live model')); break;
      case 'lapse': add(hook('time:lapse', 'B12', 'the slide\'s days play as a time-lapse on the live figure')); break;
      case 'hvpgResp': case 'response': add(hook('card:response', 'B12', 'the beta-blocker response buttons')); break;
      case 'strain': add(hook('card:strain', 'B12', 'the hold-to-strain button')); break;
      case 'procedure': {
        const k = typeof v === 'string' ? v : (v as { kind?: string })?.kind;
        if (!k) { bad.push('procedure without a kind'); break; }
        add(hook(`procedure:${k}`, PROCEDURE_OWNER, `the ${k} procedure the Play button plays on the figure`));
        break;
      }
      case 'rail': add(hook('card:rail', 'B12', 'the level rail on the teaching card')); break;
      case 'sides': add(hook('card:sides', 'S3', 'two guidelines side by side on the teaching card')); break;
      case 'caseQ': add(hook('card:case-question', 'S3', 'the short question on the case card')); break;
      case 'question': add(hook('card:question', 'B12', 'a question slide that holds its answer back')); break;
      default: bad.push(`the field "${f}" (not classified in hooks.ts)`);
    }
  }
  if (bad.length) throw new Error(`slide "${s.id}": ${bad.join('; ')}`);
  // (a data card of tiles under a tool: the tool's hook already says the instrument, `card:tiles` the tiles)
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ── the registry the feature batches call ──
const have = new Set<string>();
/** A batch hands over a feature a slide needs (`tool:criteria`, `lens:flow`, `procedure:tips` …). Returns the remover. */
export function registerHook(id: string): () => void { have.add(id); return () => { have.delete(id); }; }
export const hasHook = (id: string): boolean => have.has(id);
export const registeredHooks = (): string[] => [...have].sort();

/** The hooks of a slide that nothing has registered yet. Empty: the slide can play whole. */
export const missingHooks = (hooks: readonly Hook[], has: (id: string) => boolean = hasHook): Hook[] => hooks.filter((h) => !has(h.id));
