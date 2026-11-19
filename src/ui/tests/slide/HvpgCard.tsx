// The HVPG tracing as a slide's data card (2D tool-hvpg.js): the one monitor, and under it the three readings, one for each Next (FHVP, WHVP, HVPG), the ones taken filled and the next one named.
// A slide whose catheter on the figure takes the steps has no strip (its slides are the steps). The state machine is hvpg-card.ts; this draws it.
import { useEffect } from 'react';
import { Monitor } from '../ir/Monitor.tsx';
import { READS, NEXT_WORDS } from './copied/hvpg-card.copied.js';
import { hvpgCard, tracing, useHvpgCard } from './hvpg-card.ts';

export interface HvpgCardProps {
  /** the slide's own options (tool: { kind: 'hvpg', catheter?: true }) */
  tool: { catheter?: boolean } | null;
  /** the slide's catheter step on the figure (the slide's cath) */
  cath?: unknown;
  /** the slide's settled readings (the tiles' numbers) */
  fp: Record<string, unknown> | null;
  /** stepped onto going forward from the slide before (the tracing then plays the readings, one for each Next) */
  forward?: boolean;
  h?: number;
}

export function HvpgCard({ tool, cath, fp, forward = false, h = 190 }: HvpgCardProps) {
  const n = useHvpgCard((s) => s.n), at = useHvpgCard((s) => s.at), hidden = useHvpgCard((s) => s.hidden), reading = useHvpgCard((s) => s.reading);
  // configure and arrive before the first pin, as 2D's show() does; the card is let go with its slide
  useEffect(() => { hvpgCard.arrive({ forward }); return () => hvpgCard.park(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { hvpgCard.configure(tool, cath); }, [tool?.catheter, cath]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { hvpgCard.pin(fp); }, [fp]);
  return (
    <div className="pz-mon" data-reading={reading || undefined}>
      <Monitor src={tracing} h={h} deps={[n]} />
      <ol className="mon-steps" aria-label="Readings, one for each Next" data-at={String(at)} hidden={hidden}>
        {(READS as string[][]).map(([k, t], i) => (
          <li key={k} title={t} data-state={i < at ? 'done' : i === at ? 'now' : undefined}><span className="ms-dot"><i className="ms-fill" /><b>{i + 1}</b></span><span>{k}</span></li>
        ))}
        <li className="ms-next" aria-hidden="true"><span className="ms-h0">{(NEXT_WORDS as string[])[0]}</span><span className="ms-h1">{(NEXT_WORDS as string[])[1]}</span></li>
      </ol>
    </div>
  );
}
