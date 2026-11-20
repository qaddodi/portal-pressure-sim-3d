// The colour key inside the lens button, on the 2D markup (main.js renderLegend): #legend > .lg-title (title + <small> unit), .lg-cap (the short caption a narrow bar shows), .lg-scale (the bar, ticks and numbers), or the stream
// lenses' dots (.lg-cats.lg-dots) and note. Its words and ramps come from the lens model (scene/lenses/legend.ts); its look is the 2D stylesheet's.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLens } from '../../scene/lenses/store.ts';
import { legendFor } from '../../scene/lenses/legend.ts';
import { resolveLook } from '../../looks/looks.ts';
import { useSettings } from '../../state/settings.ts';
import { useCompare } from '../compare/store.ts';
import { I } from './icons.tsx';

function useLookId() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const m = matchMedia('(prefers-color-scheme: dark)'); const f = () => setDark(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return resolveLook(useSettings((s) => s.look), dark);
}

/** The key that was showing, kept on for one fade while the new one fades in on the same spot (grid, one cell): a lens or look change is a cross-fade, never a swap. */
const KEY_FADE_MS = 240;
function useLeaving(key: string, node: ReactNode): ReactNode {
  const prev = useRef<{ key: string; node: ReactNode }>({ key, node });
  const [out, setOut] = useState<{ key: string; node: ReactNode } | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = { key, node };
    if (was.key === key) return;
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setOut(was);
    const t = setTimeout(() => setOut(null), KEY_FADE_MS + 40);
    return () => clearTimeout(t);
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps -- (the leaving key is the old render, taken when the key changes)
  return out && out.key !== key ? out.node : null;
}

/** The colour key; while Compare shows its Change view (D), the key's scale is the one the figure is judged against (the "then" patient, as the previous shell passed it). */
export function LensKey() {
  const reference = useCompare((c) => (c.snap && c.view === 'D' ? c.snap.when : undefined)) ?? 'healthy';
  const lens = useLens((s) => s.lens);
  const look = useLookId();
  const g = legendFor(lens, look, reference);
  const first = g.bar?.nums[0]?.text ?? '', last = g.bar?.nums.at(-1)?.text ?? '';
  const marks = g.bar ? [...new Set([...g.bar.ticks, ...g.bar.nums.map((n) => n.at)].filter((p) => p > 1 && p < 99))] : [];
  const body = (out: boolean) => (
    <div className={out ? 'legend lk-out' : 'legend lk-in'} id={out ? undefined : 'legend'} role={out ? undefined : 'img'} aria-label={out ? undefined : g.aria} aria-hidden={out || undefined} key={`${lens}:${look}`}>
      {g.title && <div className="lg-title">{g.title[0]}<small>{g.title[1]}</small></div>}
      {g.caption && <div className="lg-cap" aria-hidden="true">{g.caption[0]}<small>{g.caption[1]}</small></div>}
      {g.bar && (
        <div className="lg-scale" style={{ marginLeft: `${first.length / 2}ch`, marginRight: `${last.length / 2}ch` }}>
          <div className="lg-bar" style={{ background: `linear-gradient(to right, ${g.bar.stops.map(([c, p]) => `${c} ${p}%`).join(', ')})` }} />
          {marks.map((p) => <span key={`t${p}`} className={`lg-tick${g.bar!.nums.find((n) => n.at === p)?.optional ? ' opt' : ''}`} style={{ left: `${p}%` }} />)}
          {g.bar.nums.map((n) => <span key={n.text} className={`lg-num${n.at >= 95 ? ' end' : n.at <= 1 ? ' start' : ''}${n.optional ? ' opt' : ''}`} style={{ left: `${n.at}%` }}>{n.text}</span>)}
        </div>
      )}
      {g.dots && (
        <div className="lg-cats lg-dots" title={g.dotsTitle}>
          {g.dots.map((d) => <span key={d.name} title={d.title}><i style={{ background: d.colour }} /><b>{d.name}</b></span>)}
        </div>
      )}
      {g.note && <div className="lg-cats"><span className="lg-note"><I n="info" />{g.note}</span></div>}
    </div>
  );
  const here = body(false);
  const leaving = useLeaving(`${lens}:${look}`, body(true));
  return <div className="lens-key">{leaving}{here}</div>;
}
