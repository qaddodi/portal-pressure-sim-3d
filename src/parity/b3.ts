// B3 (colour lenses): the twelve `lens:*` rows, derived from the lens table the scene renders from (scene/lenses/model.ts LENS_IDS, words.copied.ts, legend.ts, tokens.copied.ts).
// (The Lens menu's rows, `menu:Lens/*`, are claimed by b1.ts; the slide hooks are the deck batches' tables, flipped from the same tables.)
//   present  the lens exists with the 2D's name, its key (legend) and its colour table in every look
//   wired    it is reachable by a person (the ten of the Lens menu and the L key: ui/shell/store.ts LENS_IDS; 'system' and 'since' are the two a slide asks for, through
//            hp/plan.ts lensOf into the scene-link) AND it really colours the vessels: computeLens, run on a frame, puts a colour (or lanes) on the portal trunk, from the
//            engine's frame (pressures, flows, diameters) and the healthy patient the app loads at start (scene/api.ts loadHealthy).
//   Since is present only: the lens counts its change from a baseline (scene/lenses/field.ts setSinceRef, sceneApi.setSinceRef) and without one it counts from the state the
//   figure showed as the lens came in, but no slide hands it the state of the slide before yet (the deck link, src/ui/deck, calls setSinceRef): wired the day it does.
import { rowId, type Claim } from './claim.ts';
import { NODES, EDGES } from '../engine/hales/portal/topology.js';
import { LENS_IDS, SINCE_BASELINE_FED, computeLens, lensColourAt, type LensId } from '../scene/lenses/model.ts';
import { LENS_TOKENS } from '../scene/lenses/tokens.copied.ts';
import { LENS_WORDS } from '../scene/lenses/words.copied.ts';
import { legendFor } from '../scene/lenses/legend.ts';
import { lensOf } from '../decks/hp/plan.ts';
import { LENS_IDS as MENU_LENSES } from '../ui/shell/store.ts';
import type { LookId } from '../scene/palette.ts';

const LOOKS = Object.keys(LENS_TOKENS) as LookId[];
const RAMPS = ['pressure', 'flow', 'velocity', 'heat', 'drop', 'oxygen'] as const;
/** The ramp a lens reads from the look's colour table (the stream, direction and vein-system lenses read named colours instead). */
const RAMP_OF: Partial<Record<LensId, (typeof RAMPS)[number]>> = { pressure: 'pressure', flow: 'flow', velocity: 'velocity', heat: 'heat', drop: 'drop', oxygen: 'oxygen' };

/** The 2D lens exists here: a name, a key for it, and its colours in every look. */
function exists(id: LensId): boolean {
  const key = legendFor(id, 'light');
  if (!key.name || !key.aria) return false;
  const ramp = RAMP_OF[id];
  return LOOKS.every((l) => (ramp ? LENS_TOKENS[l][ramp].length > 1 : !!LENS_TOKENS[l].flowNormal && !!LENS_TOKENS[l].trPv));
}

/** A frame of the right shape (every vein flowing forward at 10 mmHg): enough to ask whether the lens puts a colour on a vessel. Real frames are tested in tests/b3-lenses.test.ts. */
function colours(id: LensId): boolean {
  const nn = (NODES as unknown[]).length, ne = (EDGES as unknown[]).length;
  const frame = { P: new Float32Array(nn).fill(10), Q: new Float32Array(ne).fill(0.5), D: new Float32Array(ne).fill(1) };
  const ctx = { healthy: { Q: frame.Q, D: frame.D, P: new Float32Array(nn).fill(5) }, ref: new Float32Array(nn).fill(5) };
  try {
    const d = computeLens(id, frame, 'light', ctx);
    return d.mode > 0 && lensColourAt(d, 'PV_TRUNK', 0) != null;
  } catch { return false; }
}

const reachable = (id: LensId) => (MENU_LENSES as readonly string[]).includes(id) || (() => { try { return lensOf(id) === id; } catch { return false; } })();
/** Lenses a slide counts a baseline for (they need the deck link to hand the baseline over). */
const NEEDS_SLIDE_BASELINE = new Set<LensId>(SINCE_BASELINE_FED ? [] : ['since']);

export const claims: readonly Claim[] = (LENS_IDS as readonly LensId[])
  .filter((id) => exists(id) && (LENS_WORDS.some((w) => w[0] === id) || id === 'system' || id === 'since'))
  .map((id) => ({ id: rowId('lens', id), wired: reachable(id) && colours(id) && !NEEDS_SLIDE_BASELINE.has(id) }));
