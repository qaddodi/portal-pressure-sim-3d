// The one entry the debug tools load through (main.tsx): nothing here runs on the live site, and a preview or local run loads only what its address asks for
// (the address is read through flags.ts). Each tool is its own chunk, fetched when its flag is present.
import { flagOn, debugPage, auditPage } from './flags.ts';
import { isPreview } from './gate.ts';

export async function mountDebug(): Promise<void> {
  if (!isPreview()) return;
  if (flagOn('watch') || debugPage()) (await import('./watch/mount.ts')).mountWatch();
  const audit = auditPage(undefined, matchMedia('(pointer: fine)').matches);
  if (audit === 'here' || audit === 'run') (await import('./audit/page.ts')).mountAudit(audit);   // ?audit: the self-test (zero cost without it)
  if (audit === 'capture') (await import('./audit/capture-child.ts')).mountCaptureChild();   // ?audit=capture: the app in a frame of the outer page, taking its pictures (capture-all.ts) and handing the files up
  const page = debugPage();
  if (page) (await import('./page/page.ts')).mountPage(page);
  (await import('./kill/mount.ts')).mountKillLedger();   // what the page held when a tab was ended (the Phone and Full checks print it)
  // the bug packet (chord, long press on the PREVIEW pill, pps.packet) is on every preview page, as in the 2D app
  (await import('./packet/trigger.ts')).installPacketTrigger();
}
