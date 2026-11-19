import './shell.css';
import { BOOT_CRASH } from './words.ts';

/** Shown instead of the app when the simulation's engine could not start (its worker failed to load, crashed, or never answered): the reason, and Reload. */
export function BootCrash({ reason, onReload = () => location.reload() }: { reason: string | null; onReload?: () => void }) {
  return (
    <main className="sh-nogl" role="alert">
      <div><h1>{BOOT_CRASH.title}</h1><p>{BOOT_CRASH.body}</p>{reason && <p className="sh-nogl-why selectable">{reason}</p>}<button type="button" onClick={onReload}>{BOOT_CRASH.reload}</button></div>
    </main>
  );
}
