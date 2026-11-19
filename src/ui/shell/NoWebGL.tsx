import './shell.css';
import { NO_WEBGL } from './words.ts';

/** Shown instead of the app where WebGL 2 is missing. */
export function NoWebGL() {
  return (
    <main className="sh-nogl" role="alert">
      <div><h1>{NO_WEBGL.title}</h1><p>{NO_WEBGL.body}</p><a href={NO_WEBGL.href}>{NO_WEBGL.link}</a></div>
    </main>
  );
}
