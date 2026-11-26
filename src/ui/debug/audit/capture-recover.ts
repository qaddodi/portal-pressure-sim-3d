// "Recover last capture": the capture page (the Mac's outer page and `?audit=here`) offers the last run that was written to the device's storage (capture-store.ts) and not
// saved: a page that crashed or
// was ended by the browser leaves its files there. Press Recover to make the zip from them (one file at a time), then Save zip; Discard lets them go. Hidden when there is nothing to recover.
import { idbBackend, recoverable, recoverLine, reopenSession, type Backend, type Session } from './capture-store.ts';
import { saveFiles } from '../../capture/save-files.ts';

export function recoverUi(doc: Document, say: (t: string) => void): { el: HTMLElement; refresh(): Promise<void> } {
  const el = doc.createElement('div'); el.hidden = true; el.style.cssText = 'flex:1 1 100%;margin:6px 0 10px;padding:10px 12px;border:1px solid rgba(255,255,255,.28);border-radius:10px';
  const line = doc.createElement('div'); line.style.cssText = 'font-size:13px;margin:0 0 8px';
  const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  const mk = (t: string, on: () => void): HTMLButtonElement => {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = on;
    b.style.cssText = 'min-height:38px;padding:0 12px;border-radius:9px';
    return b;
  };
  let be: Backend | null = null, session: Session | null = null, zip: { blob: Blob; name: string } | null = null, busy = false;
  const recover = mk('Recover last capture', () => {
    if (busy || !session) return;
    busy = true; recover.disabled = true; say('Making the zip from the saved files…');
    void session.zip(new Date(), (n, of) => { if (n % 25 === 0 || n === of) say(`Making the zip from the saved files: ${n} of ${of}…`); }).then((blob) => {
      zip = { blob, name: `portal-pressure-recovered-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.zip` };
      save.hidden = false; say(`The zip is ready (${Math.round(blob.size / 1e5) / 10} MB). Tap Save zip.`);
    }, (e: unknown) => { say(`The zip could not be made: ${String((e as Error)?.message ?? e)}`); recover.disabled = false; }).finally(() => { busy = false; });
  });
  const save = mk('Save zip', () => {
    if (!zip || !session) return;
    const s = session, z = zip;
    void saveFiles([new File([z.blob], z.name, { type: 'application/zip' })]).then((ok) => { if (ok) { void s.saved().then(() => { el.hidden = true; }); } });
  });
  save.hidden = true;
  const drop = mk('Discard', () => { if (session && !busy) void session.discard().then(() => { el.hidden = true; say('The saved capture was discarded.'); }); });
  row.append(recover, save, drop); el.append(line, row);
  async function refresh(): Promise<void> {
    try {
      be = be ?? await idbBackend();
      if (!be) { el.hidden = true; return; }
      const r = recoverable(await be.listRuns());
      if (!r) { el.hidden = true; return; }
      session = await reopenSession(be, r); zip = null; save.hidden = true; recover.disabled = false;
      line.textContent = recoverLine(r); el.hidden = false;
    } catch { el.hidden = true; }
  }
  return { el, refresh };
}
