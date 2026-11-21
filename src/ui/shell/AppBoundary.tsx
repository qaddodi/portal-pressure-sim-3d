import { Component, useState, type ReactNode } from 'react';
import './shell.css';
import { APP_CRASH, NO_WEBGL } from './words.ts';
import { reloadKeepingState } from '../../boot/reload.ts';
import { crashDetails, detailsNow, noteFault } from '../../boot/crash-net.ts';

export { crashDetails };

function CopyDetails({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="sh-crash-alt" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setDone(true), () => undefined); }}>{done ? APP_CRASH.copied : APP_CRASH.copy}</button>;
}

/** The fallback card of either layer. It fades in (shell.css `.sh-crash`), never pops. */
export function CrashCard({ layer, message, onReload = () => { void reloadKeepingState(); } }: { layer: 'figure' | 'root'; message: string; onReload?: () => void }) {
  const figure = layer === 'figure';
  return (
    <main className={`sh-nogl sh-crash sh-crash-${layer}`} role="alert">
      <div>
        <h1>{figure ? APP_CRASH.figureTitle : APP_CRASH.title}</h1>
        <p>{figure ? APP_CRASH.figureBody : APP_CRASH.body}</p>
        <p className="sh-nogl-why selectable">{message}</p>
        <button type="button" onClick={onReload}>{APP_CRASH.reload}</button>{' '}
        <CopyDetails text={detailsNow(message)} />{' '}
        <a className="sh-crash-alt" href={NO_WEBGL.href}>{APP_CRASH.twoD}</a>
      </div>
    </main>
  );
}

interface Props { layer: 'figure' | 'root'; children: ReactNode }
/** The app's safety net, in two layers (never a blank page): `figure` wraps the 3D stage (the shell keeps working and the figure's place says what happened), `root` wraps the whole app (a full card). Each offers Reload
 *  (back on the same talk and slide, or the same patient: boot/reload.ts), Copy details and the 2D link. A thrown event handler or timer is not a render error and is not caught here. */
export class AppBoundary extends Component<Props, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { failed: e instanceof Error ? e.message || e.name : String(e) }; }
  componentDidCatch(e: unknown) { noteFault(`react:${this.props.layer}`, e); console.error(`[app] the ${this.props.layer} layer failed to render`, e); }
  render() { return this.state.failed === null ? this.props.children : <CrashCard layer={this.props.layer} message={this.state.failed} />; }
}
