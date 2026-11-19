// The measurement card of a procedure slide (2D tool-reading.js): the one pressure monitor, following the slide's procedure (reading-card.ts). Redraws on the clock's tween phase through the shared chart GL.
import { useEffect } from 'react';
import { Monitor } from '../ir/Monitor.tsx';
import { readingCard, readingSource, useReadingCard } from './reading-card.ts';

export function ReadingCard({ tool, slide, fp, h = 190 }: { tool: { of?: unknown } | null; slide: { id?: string; procedure?: unknown } | null; fp: Record<string, unknown> | null; h?: number }) {
  const n = useReadingCard((s) => s.n), said = useReadingCard((s) => s.said), pending = useReadingCard((s) => s.pending);
  useEffect(() => { readingCard.configure(tool, slide, fp); }, [tool, slide]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { readingCard.pin(fp); }, [fp]);
  return (
    <div className="pz-mon pz-reading" data-reading={pending ? 'pending' : undefined}>
      <Monitor src={readingSource} h={h} deps={[n]} />
      <div className="sr-only" role="group" aria-label="Pressure readings"><p>{said}</p></div>
    </div>
  );
}
