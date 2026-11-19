// The one entry the debug tools load through (main.tsx): nothing here runs on the live site, and a preview or local run loads only what its address asks for
// (the address is read through flags.ts). Each tool is its own chunk, fetched when its flag is present.
import { flagOn, debugPage } from './flags.ts';
import { isPreview } from './gate.ts';

export async function mountDebug(): Promise<void> {
  if (!isPreview()) return;
  if (flagOn('watch') || debugPage()) (await import('./watch/mount.ts')).mountWatch();
  // the bug packet (chord, long press on the PREVIEW pill, pps.packet) is on every preview page, as in the 2D app
  (await import('./packet/trigger.ts')).installPacketTrigger();
}
