// The colour key under the figure: what the lens means, drawn from legendFor (the 2D app's words and ramps). It fades in when the lens changes and
// holds still otherwise; type sizes come from custom properties the shell sets (--lg-title, --lg-num), so nothing here shrinks to fit.
import { useEffect, useState } from 'react';
import { useLens } from './store.ts';
import { legendFor } from './legend.ts';
import { resolveLook } from '../../looks/looks.ts';
import { useSettings } from '../../state/settings.ts';
import './legend.css';

export function useLook() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const m = matchMedia('(prefers-color-scheme: dark)'); const f = () => setDark(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return resolveLook(useSettings((s) => s.look), dark);
}

/** `variant="bar"` is the figure header's legend (the 2D app's `.legend`, in the top bar beside the Blood button, never over the figure): the full title and
 *  the compact caption both render, and the stylesheet shows the one that fits the screen (shell.css, as the 2D app's media rules do). */
export function Legend({ compact = false, reference = 'healthy', variant = 'under' }: { compact?: boolean; reference?: string; variant?: 'under' | 'bar' }) {
  const lens = useLens((s) => s.lens);
  const look = useLook();
  const g = legendFor(lens, look, reference);
  if (lens === 'neutral' && !g.dots) return null;
  const [title, unit] = compact ? g.caption ?? g.title ?? ['', ''] : g.title ?? ['', ''];
  const [cap, capUnit] = g.caption ?? g.title ?? ['', ''];
  return (
    <figure className="lg" key={`${lens}:${look}`} role="img" aria-label={g.aria} data-lens={lens} data-variant={variant}>
      {title ? <figcaption className="lg-title"><b>{title}</b>{unit ? <span> {unit}</span> : null}</figcaption> : null}
      {variant === 'bar' && cap ? <figcaption className="lg-cap" aria-hidden="true"><b>{cap}</b>{capUnit ? <span> {capUnit}</span> : null}</figcaption> : null}
      {g.bar ? (
        <div className="lg-bar-wrap">
          <div className="lg-bar" style={{ background: `linear-gradient(to right, ${g.bar.stops.map(([c, p]) => `${c} ${p}%`).join(', ')})` }}>
            {g.bar.ticks.map((t) => <i key={t} className="lg-tick" style={{ left: `${t}%` }} />)}
          </div>
          <div className="lg-nums">{g.bar.nums.map((n) => <span key={n.text} data-optional={n.optional ? '' : undefined} style={{ left: `${n.at}%` }}>{n.text}</span>)}</div>
        </div>
      ) : null}
      {g.dots ? <ul className="lg-dots">{g.dots.map((d) => <li key={d.name} title={d.title}><i style={{ background: d.colour }} />{d.name}</li>)}</ul> : null}
      {g.note ? <p className="lg-note">{g.note}</p> : null}
    </figure>
  );
}
