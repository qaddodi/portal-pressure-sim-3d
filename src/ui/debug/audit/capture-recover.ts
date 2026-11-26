// "Recover last capture": the capture pages (the Mac's outer page, `?audit=here` and the promotion page) offer the last run that was written to the device's storage (capture-store.ts) and
// not saved: a page that crashed or was ended by the browser leaves its files there. Press Recover and the run is offered like a finished one (capture-deliver.ts: its zips are made from
// storage one file at a time, in parts where the browser cannot hold the whole); Discard lets the files go. Hidden when there is nothing to recover.
import { idbBackend, recoverable, recoverLine, reopenSession, type Backend, type Session } from './capture-store.ts';
import { deliverUi } from './capture-deliver.ts';

export function recoverUi(doc: Document, say: (t: string) => void): { el: HTMLElement; refresh(): Promise<void> } {
  const el = doc.createElement('div'); el.hidden = true; el.style.cssText = 'flex:1 1 100%;margin:6px 0 10px;padding:10px 12px;border:1px solid rgba(255,255,255,.28);border-radius:10px';
  const line = doc.createElement('div'); line.style.cssText = 'font-size:13px;margin:0 0 8px';
  const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  const mk = (t: string, on: () => void): HTMLButtonElement => {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = on;
    b.style.cssText = 'min-height:38px;padding:0 12px;border-radius:9px';
    return b;
  };
  const deliver = deliverUi(doc);
  let be: Backend | null = null, session: Session | null = null, meta: { zipName: string } | null = null;
  const recover = mk('Recover last capture', () => {
    if (!session || !meta) return;
    const s = session;
    recover.hidden = true; drop.hidden = true;
    say('The saved capture is ready to save, from storage.');
    deliver.offer(s, meta.zipName.replace(/^portal-pressure-/, 'portal-pressure-recovered-'), new Date(), () => { void s.saved().then(() => { el.hidden = true; }); });
  });
  const drop = mk('Discard', () => { if (session) void session.discard().then(() => { el.hidden = true; deliver.clear(); say('The saved capture was discarded.'); }); });
  row.append(recover, drop); el.append(line, row, deliver.el);
  async function refresh(): Promise<void> {
    try {
      be = be ?? await idbBackend();
      if (!be) { el.hidden = true; return; }
      const r = recoverable(await be.listRuns());
      if (!r) { el.hidden = true; return; }
      session = await reopenSession(be, r); meta = r; deliver.clear(); recover.hidden = false; drop.hidden = false;
      line.textContent = recoverLine(r); el.hidden = false;
    } catch { el.hidden = true; }
  }
  return { el, refresh };
}
