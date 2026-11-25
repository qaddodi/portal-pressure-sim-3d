// B13c (decks R to W): the rows of the 2D app this batch has built, derived from the decks the 3D app carries (src/decks/rw), never typed.
//   present  the slide's words, camera shot, model steps and its list of needed features are in the 3D app (tests/decks-rw-*.test.ts hold each against the 2D deck)
//   wired    every feature the slide needs from other batches has landed (src/decks/rw/hooks.ts), so the slide can play whole; a slide that still waits on one is present, not wired
// The `camera:*` rows are this batch's too: every camera form the 2D decks use is placed by src/decks/rw/cams.ts (a body region or box as a shot, the lobule and sinusoid views as their scene shots).
import { RW_IDS } from '../decks/rw/copied/index.ts';
import { DECKS } from '../decks/rw/copied/all.ts';
import { buildDeck } from '../decks/rw/plan.ts';
import { registerBuiltinHooks } from '../decks/rw/hooks-builtin.ts';
import { hasHook, missingHooks } from '../decks/rw/hooks.ts';
import { place } from '../decks/rw/cams.ts';
import { REGIONS_2D, CIRC_REGIONS_2D } from '../decks/rw/copied/plate.ts';
import { LOBULE_CAMS } from '../scene/lobule/shots.ts';
import type { Claim } from './claim.ts';
import { OWN_3D_SLIDES } from './own-slides.ts';

registerBuiltinHooks();
const out: Claim[] = [];
for (const id of RW_IDS) {
  const d = buildDeck(DECKS[id]!);
  let all = true;
  for (const s of d.slides) {
    const wired = missingHooks(s.hooks, hasHook).length === 0;
    all &&= wired;
    if (OWN_3D_SLIDES.includes(`${d.id}/${s.id}`)) continue;   // (a slide of ours: the 2D inventory has no row for it)
    out.push({ id: `slide:${d.id}/${s.id}`, wired });
  }
  out.push({ id: `deck:${d.id}`, wired: all });
}

// ── the camera rows: the inventory names each camera form a 2D deck uses (a region, 'fit', 'on' for { on: [...] }, the first number of a box) ──
const CAMERA_NAMES = ['380', '500', '580', '690', '695', 'liver', 'fit', 'portal', 'lobule', 'varices', 'route', 'hepatic', 'gej', 'fundus', 'bleed', 'splenic', 'on', 'heart', 'sinusoid', 'dips', 'gutLiver', 'spleen', 'collaterals', 'gut', 'series', 'tips', 'wall'];
for (const n of CAMERA_NAMES) {
  const body = n in REGIONS_2D || n === 'fit' || n === 'on' || /^\d+$/.test(n);
  const scale = (LOBULE_CAMS as readonly string[]).includes(n);
  const circuitOnly = !body && !scale && n in CIRC_REGIONS_2D;   // (gutLiver, series, collaterals, tips: Circuit regions; the Circuit view frames them, B7)
  if (!body && !scale && !circuitOnly) continue;
  // (each is placed for real: a name that did not place would throw here and take the claim file down, which the parity test shows)
  if (body && /^\d+$/.test(n)) place([Number(n), 100, Number(n) + 300, 400]); else if (body && n === 'on') place({ on: ['PV_TRUNK'] }); else if (circuitOnly) place(n, 'circuit'); else place(n);
  out.push({ id: `camera:${n}`, wired: !circuitOnly });
}

export const claims: readonly Claim[] = out;
