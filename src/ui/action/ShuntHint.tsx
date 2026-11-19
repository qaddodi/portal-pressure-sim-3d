// The hint card for a shunt waiting for its target (2D main.js renderPaintHint: a tool card at the foot of the figure): the title with Cancel, then what each pair makes. Its lines are the 2D app's
// (shunt-words.copied.ts). Shown while a shunt waits, in the 2D app's own .tool-card; "Tap" on touch, "Click" and the Esc line where there is a pointer and a keyboard.
import { useShunting, cancelShunt } from './shunt.ts';
import { SHUNT_WORDS as W } from './shunt-words.copied.ts';
import { OrderIcon } from './icons.tsx';

const fine = (): boolean => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function ShuntHint() {
  const now = useShunting((s) => s.now);
  if (!now) return null;
  const f = fine();
  return (
    <div className="tool-card stage-blocker" id="toolHint" role="status" style={{ position: 'fixed' }}>
      <div className="tc-title"><OrderIcon n="stent" className="ic" />{now.only === 'tips' ? W.tipsOnly : W.title}<span className="tc-sp" /><button type="button" className="btn sm" onClick={() => cancelShunt()}>{W.cancel}</button></div>
      {now.only === 'tips'
        ? <div>{f ? W.clickThe : W.tapThe}<b>{W.l1b}</b>{W.tipsEnd}</div>
        : (
          <>
            <div>{f ? W.clickTarget : W.tapTarget}</div>
            <div>{W.l1a}<b>{W.l1b}</b>{W.l1c}</div>
            <div>{W.l2a}<b>{W.l2b}</b>{W.l2c}</div>
            <div>{W.l3a}<b>{W.l3b}</b>{W.l3c}</div>
            {f && <div>{W.esc}</div>}
          </>
        )}
    </div>
  );
}
