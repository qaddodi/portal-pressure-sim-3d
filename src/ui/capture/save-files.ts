// Hands files to the person: the share sheet where the device takes files (iPhone Safari: Save to Files, Copy, Claude, Messages), otherwise a download.
// Safari lets a page open the share sheet only inside the tap that asked for it, so this module is imported STATICALLY by the buttons: a dynamic import() in the tap
// waits on the network and the tap is spent by the time navigator.share runs (the share then fails with NotAllowedError and the file silently downloads instead).
import { deliverWay } from './capture-model.ts';
import { clock } from '../../clock/frame.ts';
import { saveBlob } from '../deck/download.ts';

const sleep = (ms: number) => new Promise<void>((ok) => clock.after(ok, ms));

/** Must be called from a tap, with no await before it. Resolves false when the person closed the sheet. */
export async function saveFiles(files: File[]): Promise<boolean> {
  const canShare = !!navigator.canShare?.({ files });
  if (deliverWay({ touchPoints: navigator.maxTouchPoints || 0, canShareFiles: canShare }) === 'share') {
    try { await navigator.share({ files, title: files[0]?.name }); return true; } catch (e) { if ((e as { name?: string })?.name === 'AbortError') return false; }
  }
  for (const f of files) {
    saveBlob(f, f.name, 20000);
    if (files.length > 1) await sleep(250);
  }
  return true;
}
