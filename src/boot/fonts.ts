import { clock } from '../clock/frame.ts';
// The first card waits for its fonts (done bar: no text before its card, no flash of unstyled text). Never waits forever:
// after `timeoutMs` the app goes on with the fallback faces rather than a blank page.
const FACES = ['400 17px Inter', '600 17px Inter', '600 26px "Source Serif 4"', '400 13px Inter'];

export async function fontsReady(timeoutMs = 4000): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return true;
  const loading = Promise.all([...FACES.map((f) => document.fonts.load(f, 'HVPG 0123456789 mmHg')), document.fonts.ready]).then(() => true);
  const late = new Promise<boolean>((res) => clock.afterReal(() => res(false), timeoutMs));
  try { return await Promise.race([loading, late]); } catch { return false; }
}
