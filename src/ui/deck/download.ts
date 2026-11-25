import { clock } from '../../clock/frame.ts';
/** Hands a Blob to the browser as a download (one link, clicked and taken out again; the one place that does it: capture, the zip and a deck's files all come through here). `keepMs`: how long the object URL lives. */
export function saveBlob(blob: Blob, name: string, keepMs = 4000): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  clock.after(() => URL.revokeObjectURL(url), keepMs, 'download-url');
}
/** Saves text as a file (a Blob and a link; the browser keeps it). */
export function download(name: string, text: string, type = 'text/plain'): void { saveBlob(new Blob([text], { type }), name); }
