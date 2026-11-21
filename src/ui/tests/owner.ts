// Who owns the figure's procedure layer right now (review #10). The IR pane (the HVPG catheter, a Watch treatment, the PPG by IR) and the Endoscopy tab's EUS-PPG each play ONE procedure on the
// one figure; the camera, the device and the readings are that procedure's until it ends. Each runner publishes its claim here at every change of its phase (`claim`), and every control that
// would start another procedure reads it (`useOwner`), so it is disabled BEFORE activation and says why in one status line with a way back to the owner, instead of accepting a press and
// answering with a toast. There is no cancel: the runners cannot yet give back the camera, the device and the readings as one operation, so the owner finishes by itself. Imports nothing from
// the runners (they import this).
import { create } from 'zustand';
import type { PaneId } from './panes.ts';

export type OwnerId = 'ir' | 'eus';
export interface Owner { id: OwnerId; /** the discrete phase the owner is in (its step or stage) */ phase: string; /** the Tests tab it lives on */ pane: PaneId; name: string }
const TABS_OF: Record<OwnerId, { pane: PaneId; name: string }> = { ir: { pane: 'hvpg', name: 'IR' }, eus: { pane: 'endoscopy', name: 'EUS-PPG' } };

export const useOwner = create<{ owner: Owner | null }>(() => ({ owner: null }));

/** A runner's claim: its phase while it plays, null when it has finished (and given the camera, the device and the readings back). Writes only when the claim changes. */
export function claim(id: OwnerId, phase: string | null): void {
  const cur = useOwner.getState().owner;
  if (phase == null) { if (cur?.id === id) useOwner.setState({ owner: null }); return; }
  if (cur && cur.id !== id) return;   // (never taken from a running owner)
  if (cur?.phase === phase) return;
  useOwner.setState({ owner: { id, phase, ...TABS_OF[id] } });
}
/** The owner that is not `me`: the one that stops `me` from starting (null when free). */
export const blockerOf = (owner: Owner | null, me: OwnerId): Owner | null => (owner && owner.id !== me ? owner : null);
/** The one status line near the controls. */
export const ownerNote = (o: Owner): string => `${o.name} is running on the figure (${o.phase}). Wait for it to finish, or go back to it.`;
