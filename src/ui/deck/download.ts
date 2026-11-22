import { clock } from '../../clock/frame.ts';
/** Saves text as a file (a Blob and a link; the browser keeps it). */
export function download(name: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  clock.after(() => URL.revokeObjectURL(url), 4000);
}
