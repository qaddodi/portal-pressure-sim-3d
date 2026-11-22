// The History rows (2D timeline.js markerRows): every change and event, newest first, each with a way back and, once its moment is saved, a way to compare it with now.
import { Icon } from '../shell/icons.tsx';
import { useShell } from '../shell/store.ts';
import { timeline, fmtClock, type Entry } from '../timeline/index.ts';
import { useTimeline } from '../timeline/store.ts';
import { pinEntry } from '../compare/bind.ts';
import { HIST } from './words.ts';

// (an event's words take its severity's ink; a plain note stays the text colour: no dot, no chip)
const SEV: Record<string, string> = { critical: 'var(--critical-ink)', danger: 'var(--danger-ink)', caution: 'var(--caution-ink)', ok: 'var(--ok-ink)' };

function Row({ e, i }: { e: Entry; i: number }) {
  const live = timeline.isLive(i), future = timeline.isFuture(i);
  const back = e.snap ? (live ? HIST.backHere : HIST.goBack) : null;
  return (
    <div className="hist-row" data-future={future || undefined} data-row={`e${e.id}`}>
      <div className="hist-head">
        <b className={`hist-t ${e.kind}`} style={e.kind === 'event' ? { color: SEV[e.sev ?? 'info'] } : undefined}>{e.kind === 'start' ? HIST.patient(e.label) : e.label}</b>
        <span className="when">{e.kind === 'start' ? HIST.start : fmtClock(e.t, e.day)}</span>
        <span className="hist-acts">
          {back && <button type="button" className="hist-ic" style={{ gridColumn: 1 }} title={back} aria-label={back} onClick={() => { useShell.getState().close(); timeline.goTo(i); }}><Icon n="rewind" /></button>}
          {e.frame && <button type="button" className="hist-ic" style={{ gridColumn: 2 }} title={HIST.compare} aria-label={HIST.compare} onClick={() => { useShell.getState().close(); pinEntry(e); }}><Icon n="camera" /></button>}
        </span>
      </div>
      {e.detail && <div className="hist-d">{e.detail}</div>}
      {e.snapFailed && !e.snap && <div className="hist-d">{HIST.nogo}</div>}
    </div>
  );
}

export function HistoryList() {
  useTimeline((s) => s.rev);
  const entries = timeline.entries();
  if (entries.length <= 1) return <p className="hist-empty"><b>{HIST.nothing}</b>{HIST.nothingHint}</p>;
  return <div className="hist-list">{entries.map((_, i) => entries.length - 1 - i).map((i) => <Row key={entries[i]!.id} e={entries[i]!} i={i} />)}</div>;
}
