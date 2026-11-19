// The Tests card (2D dock.js "Instruments card"): a card on the right of a wide screen, a sheet over the foot of a phone or an upright iPad, with a row of tabs (Pressure, IR,
// Doppler, Endoscopy, Ascites, FibroScan, Readouts, Trials; Over time lives under Pressure). Always in the page and fading; the instrument on show is remembered on the device.
// The Tests button, the I key and the search commands open it through the shell's `tests` feature.
import { useEffect, useMemo, type ReactNode } from 'react';
import './tests.css';
import { useUi } from '../ui-store.ts';
import { layoutOf, radius, cardScale } from '../layout/rules2d.ts';
import { registerFeature } from '../shell/features.ts';
import { useTests } from './store.ts';
import { TABS, tabOf, shortName, tinyName, PANES, type PaneId } from './panes.ts';
import { testsPlace } from './place.ts';
import { useTestsRoom } from './room.ts';
import { TIcon, TAB_ICON } from './icons.tsx';
import { ReadoutsPane } from './ReadoutsPane.tsx';
import { Why } from './Why.tsx';
import { notYet } from '../shell/words.ts';

/** The panes built so far; a tab whose pane is not here yet says so in a line (never a dead tab). */
const BUILT: Partial<Record<PaneId, (p: { narrow: boolean }) => ReactNode>> = {
  readouts: (p) => <ReadoutsPane narrow={p.narrow} />,
};
export function registerPane(id: PaneId, render: (p: { narrow: boolean }) => ReactNode): void { BUILT[id] = render; }

export function TestsLayer() {
  const open = useTests((s) => s.open), pane = useTests((s) => s.pane), show = useTests((s) => s.show), close = useTests((s) => s.close);
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device);
  const place = useMemo(() => testsPlace(vp, device), [vp, device]);
  const narrow = place.rect.w < 470;
  const layout = layoutOf(vp.w, vp.h);
  const r = Math.round(radius(vp.w, vp.h, layout));
  const roles = cardScale({ vw: vp.w, vh: vp.h, layout, part: 'data' });

  // the Tests button, the I key and the palette
  useEffect(() => registerFeature('tests', () => useTests.getState().toggle()), []);
  // the figure keeps the room the card leaves
  useEffect(() => {
    useTestsRoom.setState({ place: open ? place : null });
    return () => useTestsRoom.setState({ place: null });
  }, [open, place]);

  const tab = tabOf(pane);
  const body = BUILT[pane];
  const style = {
    width: place.rect.w, height: place.rect.h, transform: `translate(${Math.round(place.rect.x)}px, ${Math.round(place.rect.y)}px)`,
    ['--t-r' as string]: `${r}px`, ['--t-sm' as string]: `${Math.max(12, Math.round(roles.lab))}px`, ['--t-plot' as string]: `${place.vars.plot}px`, ['--t-square' as string]: `${place.vars.square}px`,
  };
  return (
    <div className="t-pos" data-open={open} data-live={open} data-narrow={narrow} data-kind={place.kind} data-device={device} style={style}>
      <div className="t-plate" />
      <section className="t-card" role="dialog" aria-label="Tests" inert={!open}>
        <div className="t-head">
          <h2 className="t-title">Tests</h2>
          <button type="button" className="t-x" aria-label="Close Tests" title="Close (Esc)" onClick={close}><TIcon n="close" /></button>
        </div>
        <div className="t-tabs" role="tablist" aria-label="Tests">
          {TABS.map((id) => (
            <button key={id} type="button" className="t-tab" role="tab" aria-selected={tab === id} aria-controls={`pane-${id}`} data-instrument={id} title={PANES[id].name} onClick={() => show(id)}>
              <TIcon n={TAB_ICON[id]!} />
              <span><span className="t-full">{shortName(id)}</span><span className="t-short">{tinyName(id)}</span></span>
            </button>
          ))}
        </div>
        <div className="t-body" id={`pane-${tab}`} role="tabpanel" aria-label={PANES[pane].name}>
          {open && (body ? <div key={pane}>{body({ narrow })}</div> : <p key={pane} className="t-note t-pane">{notYet(PANES[pane].name)}</p>)}
        </div>
        <Why />
      </section>
    </div>
  );
}
