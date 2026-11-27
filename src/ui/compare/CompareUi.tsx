// Compare on screen (2D main.js renderBanner, compare.js section): the switch under the top bar (Then, Now, Change and the Differences button), the "Showing <then>" badge, and the
// Differences table. They are always in the page and fade (opacity), never pop. The table is rebuilt only when a shown number changes.
import { useEffect, useState } from 'react';
import { Icon } from '../shell/icons.tsx';
import { useShell } from '../shell/store.ts';
import { useEngine, latest, patient } from '../../engine/index.ts';
import { useCompare, type CompareView } from './store.ts';
import { CMP, comparing, comparingAria, thenTitle, changeTitle, showing, thenKicker } from './words.ts';
import { describe, diffRows, GROUPS } from './model.ts';
import { activeLabels } from './labels.ts';
import { patientLabel } from '../timeline/index.ts';
import { useClock } from './useTick.ts';
import './compare.css';
import { useTalkOn } from '../../state/deck.ts';

export function CompareBanner() {
  const snap = useCompare((s) => s.snap), view = useCompare((s) => s.view);
  const talk = useTalkOn();
  const on = !!snap && !talk;
  const when = snap?.when ?? '';
  const [nA, nB] = snap?.names ?? [CMP.then, CMP.now];
  const pick = (v: CompareView) => useCompare.getState().setView(v);
  const seg: [CompareView, string, string][] = [['A', nA, thenTitle(when)], ['B', nB, CMP.live], ['D', CMP.change, changeTitle(when)]];
  return (
    <>
      <div className="cmp-banner" data-on={on} inert={!on}>
        <span className="cmp-label">{comparing(when)}</span>
        <div className="cmp-seg" role="group" aria-label={comparingAria(when)}>
          {seg.map(([v, name, title]) => <button key={v} type="button" aria-pressed={view === v} title={title} onClick={() => pick(v)}><b>{name}</b></button>)}
        </div>
        <button type="button" className="cmp-table-btn" title={CMP.tableTitle} onClick={() => useShell.getState().open('compare')}>{CMP.tableBtn}</button>
      </div>
      <div className="cmp-badge" data-on={on && view === 'A'} aria-hidden={!(on && view === 'A')}>{showing(when)}</div>
    </>
  );
}

function Card({ cls, letter, kicker, name, detail }: { cls: 'a' | 'b'; letter: string; kicker: string; name: string; detail: string }) {
  return <div className={`cmp-card ${cls}`}><span className="ck"><i>{letter}</i>{kicker}</span><span className="cn">{name}</span><span className="cd">{detail}</span></div>;
}

/** The pinned moment against the live model: both states named, every difference tabulated. The pinned one is kept while the sheet fades out. */
/** The Differences table (the panel that holds it is compare/DifferencesSheet.tsx, in the sheets' chunk: the banner here is in the boot entry). */
export function Differences() {
  const snap = useCompare((s) => s.snap);
  const open = useShell((s) => s.sheet === 'compare');
  const tick = useClock(open && !!snap, 500);   // (the table follows the model while it is open: frames come ten times a second, the table is rebuilt only when a shown number changes)
  const [kept, setKept] = useState(snap);
  useEffect(() => { if (snap) setKept(snap); }, [snap]);
  useEffect(() => { if (!snap && open) useShell.getState().close(); }, [snap, open]);
  useEngine((s) => s.status);
  const A = snap ?? kept;
  if (!A) return null;
  void tick;
  const f = latest.frame;
  const [nA, nB] = A.names ?? [CMP.then, CMP.now];
  const rows = f ? diffRows(A.metrics, f.metrics) : [];
  let at = 0;
  return (
    <>
      <div className="cmp-top"><span className="cmp-over">{comparing(A.when)}</span>
        <button type="button" className="sh-btn cmp-stop" onClick={() => useCompare.getState().stop()}><Icon n="close" />{CMP.stop}</button></div>
      <div className="cmp-states">
        <Card cls="a" letter="T" kicker={A.names ? nA : thenKicker(A.when)} name={A.label} detail={describe(A.changes)} />
        <Card cls="b" letter="N" kicker={A.names ? nB : CMP.nowLive} name={patientLabel()} detail={describe(activeLabels(f?.params ?? patient.params))} />
      </div>
      <table className="cmp-table">
        <thead><tr><th>{CMP.metric}</th><th>{nA}</th><th>{nB}</th><th>{CMP.change}</th></tr></thead>
        {GROUPS.map(([g, n]) => {
          const part = rows.slice(at, (at += n));
          return (
            <tbody key={g}>
              <tr className="cmp-g"><th colSpan={4} scope="colgroup">{g}</th></tr>
              {part.map((r) => (
                <tr key={r.label}><td><span className="cmp-n">{r.label}</span><span className="unit">{r.unit}</span></td><td className="a">{r.a}</td><td className="b">{r.b}</td>
                  <td className={r.cls}>{r.tri && <span className="tri" aria-hidden="true">{r.tri}</span>}{r.text}</td></tr>
              ))}
            </tbody>
          );
        })}
      </table>
      <p className="cmp-hint">{CMP.hint}</p>
    </>
  );
}
