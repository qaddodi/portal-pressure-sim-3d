// The one status line that says another instrument holds the figure, with the way back to it (owner.ts, review #10). Shown on the pane whose controls it has disabled.
import { useOwner, blockerOf, ownerNote, type OwnerId } from './owner.ts';
import { useTests } from './store.ts';

/** The owner that blocks `me`, or null: read it to disable controls before activation. */
export const useBlocker = (me: OwnerId) => blockerOf(useOwner((s) => s.owner), me);

export function OwnerNote({ me }: { me: OwnerId }) {
  const b = useBlocker(me);
  if (!b) return null;
  return (
    <p className="ctl-sub tests-owner" role="status">
      {ownerNote(b)} <button type="button" className="btn sm" onClick={() => useTests.getState().show(b.pane)}>Back to {b.name}</button>
    </p>
  );
}
