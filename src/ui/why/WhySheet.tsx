import { ShellPanel } from '../surface/Panel.tsx';
import { useWhy } from './store.ts';
import { waterfall, WHY } from './model.ts';
import './why.css';

/** Why? a number is what it is (2D why.js): the sentence, the contribution bars and the formula; waiting lines while the model calculates. */
export function WhySheet() {
  const { state, result } = useWhy();
  const ready = state === 'ready' && result;
  const rows = ready ? waterfall(result) : [];
  return (
    <ShellPanel id="why" label={WHY.title} head={ready ? result.label : WHY.title}>
      <div className="why-body" data-state={state}>
        {state === 'loading' && <><p className="why-sub">{WHY.calculating}</p><i className="why-skel" style={{ width: '90%' }} /><i className="why-skel" style={{ width: '70%' }} /><i className="why-skel" style={{ width: '80%' }} /></>}
        {state === 'failed' && <p className="why-sub">{WHY.failed}</p>}
        {ready && (
          <>
            <p className="why-sentence">{result.sentence}</p>
            {rows.length > 0 && (
              <div className="why-wf">
                <div className="why-over">{WHY.waterfall(result.unit)}</div>
                {rows.map((r) => (
                  <div className="why-row" key={r.key}>
                    <span className="lab" title={r.full}>{r.short}</span>
                    <span className="bar"><i data-k={r.kind} style={{ left: r.left, width: r.width }} /></span>
                    <span className="val">{r.value}</span>
                  </div>
                ))}
                <p className="why-note">{WHY.note}</p>
              </div>
            )}
            {result.formula && <div className="why-formula">{result.formula}</div>}
          </>
        )}
      </div>
    </ShellPanel>
  );
}
