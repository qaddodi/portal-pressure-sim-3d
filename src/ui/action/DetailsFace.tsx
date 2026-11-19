// The card's Details face (2D: the inspector's selection panel, opened by tapping the card's name): the same structure as 2D builds it. The kicker and name with Back, the
// direction word, the readings in a grid, Doppler here and Why this value?, the vessel's own line, About; a compartment lists the vessels that meet there. Readings are
// worked out from the newest frame by details.ts and the face re-renders only when a printed word changes.
import { setDopplerProbe } from '../tests/doppler/probe-state.ts';
import { useEffect, useState } from 'react';
import { Icon } from '../shell/icons.tsx';
import { useEngine } from '../../engine/store.ts';
import { useParamsTick } from './params.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { openWhy } from '../why/store.ts';
import { appAct } from './act.ts';
import { detailsFor, type Details } from './details.ts';
import { envNow } from './env.ts';
import { selectStructure, type Sel } from './selection.ts';
import { WORDS } from './details.generated.ts';

const STATE_CLS: Record<string, string> = { ok: 'ok', rev: 'rev', bad: 'bad', warn: 'warn' };

function useReads(d: Details): { texts: string[]; dir: readonly [string, string] | null } {
  const compute = () => { const e = envNow(); return { texts: d.stats.map((s) => (e ? s.read(e) : '—')), dir: e && d.dir ? d.dir(e) : null }; };
  const [r, setR] = useState(compute);
  useEffect(() => {
    const run = () => setR((prev) => { const n = compute(); return prev.dir?.[1] === n.dir?.[1] && prev.texts.every((t, i) => t === n.texts[i]) ? prev : n; });
    run();
    const off = [useEngine.subscribe(run), useParamsTick.subscribe(run), useLens.subscribe(run)];
    return () => off.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);
  return r;
}

/** What a structure's Details face is made of, for a selection (null where 2D's card has no Details). */
export function DetailsFace({ sel, onBack }: { sel: Sel; onBack(): void }) {
  const d = detailsFor(sel);
  if (!d) return null;
  return <Panel key={d.key} d={d} onBack={onBack} />;
}

function Panel({ d, onBack }: { d: Details; onBack(): void }) {
  const { texts, dir } = useReads(d);
  return (
    <div className="ac-body ac-details" data-key={d.key}>
      <div className="ac-dhead">
        <button type="button" className="ac-back" aria-label={WORDS.back} title={WORDS.back} onClick={onBack}><Icon n="arrow-left" /></button>
        <div className="ac-dtitle"><span className="ac-kicker">{d.kicker}</span><h2 className="ac-name" title={d.title}>{d.title}</h2></div>
      </div>
      <div className="ad-scroll">
      {dir && <div className="ac-state-row"><span className={`ac-state st-word ${STATE_CLS[dir[0]] ?? ''}`}>{dir[1]}</span></div>}
      <div className="ac-stats">
        {d.stats.map((s, i) => <div key={s.k} className={`ac-stat${s.wide ? ' wide' : ''}`}><span className="k">{s.k}</span><span className="v">{texts[i]}</span></div>)}
      </div>
      <div className="ac-as">
        {d.probe && <button type="button" className="ac-btn" onClick={() => { setDopplerProbe(d.probe!); appAct.feature('doppler', 'Doppler'); }}><Icon n="doppler" className="ac-ic" /><span className="ac-bl">{WORDS.doppler}</span></button>}
        {d.why && <button type="button" className="ac-btn" onClick={() => void openWhy(d.why!)}><Icon n="bulb" className="ac-ic" /><span className="ac-bl">{WORDS.why}</span></button>}
      </div>
      {d.note && <p className="ac-dnote">{d.note}</p>}
      {d.about && <section className="ac-dabout"><h3>{d.about.title}</h3><p>{d.about.text}</p></section>}
      {d.connections && (
        <section className="ac-dabout"><h3>{WORDS.connections}</h3>
          <div className="ac-as">{d.connections.map((c) => <button key={c.id} type="button" className="ac-btn" onClick={() => selectStructure({ type: 'edge', id: c.id })}><span className="ac-bl">{c.label}</span></button>)}</div>
        </section>
      )}
      </div>
    </div>
  );
}
