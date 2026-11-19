// The comparison line under the Tests head while a moment is pinned (2D dock.js updateHeader, .workspace-comparison): "Since <when>", then the HVPG, the liver flow and the shunt as their change
// since then. Folded away (hidden) when nothing is pinned. Its own component, so a model frame re-renders only this line, and only while a moment is pinned.
import { useCompare } from '../compare/store.ts';
import { useFrame } from './frame.ts';
import { hiddenNow } from './hidden.ts';
import { compareRows } from './copied/idle-keys.copied.js';
import { fmt } from './copied/num.copied.js';

function Rows({ when, a }: { when: string; a: Record<string, number> }) {
  const f = useFrame();
  const b = f?.metrics as Record<string, number> | undefined;
  if (!b) return null;
  const rows = compareRows(a, b, !hiddenNow()?.has('trueHVPG'), true, fmt) as ReadonlyArray<readonly [string, string]>;
  return (
    <>
      <span className="comparison-label">{`Since ${when}`}</span>
      {rows.map(([label, txt]) => <span key={label}>{label}<b>{txt}</b></span>)}
    </>
  );
}

export function CompareLine({ active }: { active: boolean }) {
  const snap = useCompare((s) => s.snap);
  const on = active && !!snap;
  return <div className="workspace-comparison" hidden={!on} aria-live="off">{on && snap && <Rows when={snap.when} a={snap.metrics as unknown as Record<string, number>} />}</div>;
}
