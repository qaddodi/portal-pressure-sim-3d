// The colour key as the first row of the data card (Mohammad, 22 Nov: the Origin key floated over the figure above the card; "put it in the instrument card, on top, and make it appear and disappear as part of the card").
// It is the card's own content, so it comes and goes with the card and never has a layer, a dock or a fade of its own. Its words and colours are key.ts's (the vessels' own colours, in the look the figure wears).
import { useMemo } from 'react';
import { keyModel } from '../../scene/labels/key.ts';
import { useLookId } from '../../looks/use-look.ts';

export function CardKey({ lens }: { lens: string }) {
  const look = useLookId();
  const m = useMemo(() => keyModel(lens, look), [lens, look]);
  if (!m) return null;
  return (
    <div className="pz-ckey" role="img" aria-label={m.aria} data-lens={m.lens}>
      <b>{m.name}</b>
      {m.scale && <i className="pz-ckey-bar" style={{ background: m.scale.gradient }} />}
      {m.swatches && <span className="pz-ckey-items">{m.swatches.map((s) => <span key={s.label} className="pz-ckey-k"><i style={{ background: s.colour }} />{s.label}</span>)}</span>}
    </div>
  );
}
