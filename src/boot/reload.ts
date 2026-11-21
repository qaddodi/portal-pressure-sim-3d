// Reload onto the newest build keeping what is on the screen (the build pill's own address: the talk and slide, or the patient with settings, view and camera).
import { reloadUrl } from '../ui/shell/build-pill.ts';

export async function reloadKeepingState(): Promise<void> {
  let state: string | null = null;
  try { state = (await import('../ui/shell/share-wire.ts')).shareLinkNow(); } catch { /* (the app is not up: the page's own address) */ }
  location.replace(reloadUrl(location.href, Date.now(), state));
}
