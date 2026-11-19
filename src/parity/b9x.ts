// B9, the structure cards and the keys that reach them: the 2D card gallery's Structure cards (each kind's card and its Details face; the gallery lists every one twice, the
// second as "#2") and the "Reach and act" shortcuts. Every claim is derived from what the app renders from: the card catalogue (cardFor), the Details face (detailsFor), the
// figure's tap tables (tap-map.ts) and the vessels the scene draws (NETWORK_BY_ID); a kind the catalogue has no card for is not claimed.
//   present  the card (or its Details face) exists with the 2D words
//   wired    a person gets to it from the figure (a tap, or Tab and Enter) and its Details face is one tap on its name away
// A lobule part's card has no Details face in 2D (its name is not a button), so the lobule "-details" rows are not claimed: 2D's gallery shows the patient chart there, which is the charts' (B10).
import { decideKey } from '../ui/keys/keymap.ts';
import { step } from '../scene/labels/walk.ts';
import { WALK_ORGANS } from '../ui/action/walk-organs.ts';
import { ORGAN_TAP, LOBULE_TAP } from '../ui/action/tap-map.ts';
import { structureRows } from '../ui/action/structures.ts';
import { NETWORK_BY_ID } from '../scene/vessels/network.ts';
import { rowId, type Claim } from './claim.ts';

const out: Claim[] = [];
for (const r of structureRows()) {
  for (const sfx of ['', '#2']) {
    if (r.card) out.push({ id: rowId('card', `structure/${r.id}${sfx}`), wired: r.reach });
    if (r.details) out.push({ id: rowId('card', `structure/${r.id}-details${sfx}`), wired: r.reach });
  }
}

// ── Reach and act ──
const key = (k: string) => decideKey({ key: k }, { target: 'page', searchOpen: false, sheetOpen: false, talk: false, keysOn: true, cardOpen: true });
const shortcut = (keys: string, wired: boolean) => out.push({ id: rowId('shortcut', `Reach and act/${keys}`), wired });
// Click: a tap on a vessel, an organ or a lobule part opens its card (tap.ts)
shortcut('Click', NETWORK_BY_ID.size > 0 && Object.keys(ORGAN_TAP).length > 0 && Object.keys(LOBULE_TAP).length > 0);
// 1 – 9 run the open card's controls (ActionCard.triggerCardVerb, through useKeys)
shortcut('1 – 9', [1, 2, 3, 4, 5, 6, 7, 8, 9].every((n) => key(String(n))?.type === 'card-verb'));
// Tab · Enter: one stop per drawn vessel, then the organs 2D's walk ends on; Enter opens the card (VesselWalk)
shortcut('Tab · Enter', NETWORK_BY_ID.size > 0 && WALK_ORGANS.length === 3);
// The arrows follow the flow from the vessel in focus, as 2D's do (its stage handles Left and Right only; Up and Down are not the figure's in either app), and Shift does not stop them.
const follows = step('PV_TRUNK', 'down', 1) !== null && step('PV_TRUNK', 'up', 1) !== null;
shortcut('← → ↑ ↓', follows);
shortcut('Shift ← →', follows);

export const claims: readonly Claim[] = out;
