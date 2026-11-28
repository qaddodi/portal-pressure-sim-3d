// The listeners behind the gentle tilt (tilt.ts holds the numbers): the pointer over the window on a laptop, the device's orientation on a phone or tablet.
// They only set the rig's tilt input and ask the clock for one frame when it changed enough; the easing and the frame cost are in the rig's own update, so nothing here
// draws, nothing runs per frame, and no pointer event is stopped, captured or cancelled (src/scene/gesture/controller.ts is untouched: passive listeners on the window).
//   iOS asks permission for motion data and only inside a tap: it is asked once, on the first tap (never on load), and a refusal leaves the figure still
//   (28 Nov: the tap is a click, or a touch's pointerup, whichever is a user gesture first).
//   The device's turn is read as a rotation from the held orientation (tilt.ts), so a phone held upright is as steady as one held flat.
import type { CameraRig } from './rig.ts';
import { DeviceBase, OneEuro, deviceUnit, pointerUnit, screenTurn, wakeStep } from './tilt.ts';

export interface TiltEnv {
  rig: CameraRig;
  /** Asks the clock for one frame. */
  wake(tag: string): void;
  /** Settings > Figure depth > Tilt. */
  on(): boolean;
  /** Reduce Motion, read the page's one way (ui/a11y/motion.ts). */
  reduced(): boolean;
  /** Runs `fn` when the Tilt switch changes (zustand's subscribe, already narrowed); returns the remover. */
  onSwitch(fn: (on: boolean) => void): () => void;
}

type Ask = { requestPermission?: () => Promise<'granted' | 'denied'> };
/** After the screen turns the readings swing hard before it settles: the tilt is held square until this long after the last resize or turn (ms), then the held orientation is taken again. */
export const TURN_HOLD_MS = 600;
/** A refusal to ask outside a user gesture is tried again at the next tap, at most this many times (iOS names it NotAllowedError); a real answer, granted or denied, is final. */
const MAX_ASKS = 3;

/** Installs the listeners; returns the remover. Safe to call where there is no window (it does nothing). */
export function installTilt(env: TiltEnv, win: Window = window): () => void {
  if (typeof win === 'undefined') return () => undefined;
  const { rig } = env, tilt = rig.tilt, base = new DeviceBase(), fTop = new OneEuro(), fRight = new OneEuro();
  let lastMouse = -1e9, sensing = false, asked: 'no' | 'asking' | 'done' = 'no', tries = 0, holdUntil = -1;
  const restart = () => { base.reset(); fTop.reset(); fRight.reset(); };
  const offs: (() => void)[] = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void) => {
    t.addEventListener(type, fn as EventListener, { passive: true });
    offs.push(() => t.removeEventListener(type, fn as EventListener));
  };
  const live = () => env.on() && !env.reduced();
  const put = (u: { x: number; y: number } | null, src: 'pointer' | 'device' = 'pointer') => { const s = rig.stageSize; if (tilt.set(u, src, wakeStep(s.w, s.h))) env.wake('tilt'); };
  const turnOf = (): number => {
    const so = (win.screen as Screen & { orientation?: { angle: number } }).orientation;
    const old = (win as Window & { orientation?: number }).orientation;   // (older iOS: window.orientation)
    return so ? so.angle : typeof old === 'number' ? old : 0;
  };
  const hold = () => { restart(); holdUntil = win.performance.now() + TURN_HOLD_MS; if (tilt.source === 'device') put(null, 'device'); };

  // a laptop: the mouse, trackpad or pen over the page (a finger is a gesture, the controller's, and a phone's tilt comes from the device)
  on<PointerEvent>(win, 'pointermove', (e) => {
    if (e.pointerType === 'touch' || !live()) return;
    lastMouse = e.timeStamp;
    const s = rig.stageSize;
    put(pointerUnit(e.clientX, e.clientY, s.w, s.h));
  });
  // it goes square when the pointer leaves the page, the window loses focus or the tab is hidden
  on(win.document.documentElement, 'mouseleave', () => put(null));
  on(win, 'blur', () => put(null));
  on(win.document, 'visibilitychange', () => { if (win.document.hidden) { tilt.reset(); restart(); env.wake('tilt'); } else restart(); });
  on(win, 'resize', hold);

  // a phone or tablet: the device's orientation, from where it is held; the figure turns the opposite way (parallax)
  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || !live()) return;   // (a desktop browser sends one empty reading)
    if (e.timeStamp - lastMouse < 2000) return;                 // (a pointer is in use: it leads)
    if (e.timeStamp < holdUntil) { restart(); return; }         // (the screen is turning: square until it settles, then the held orientation is taken again)
    const d = base.read(e.alpha ?? 0, e.beta, e.gamma, e.timeStamp);
    const s = screenTurn(d.rx, d.ry, turnOf());
    put(deviceUnit(fTop.filter(s.top, e.timeStamp), fRight.filter(s.right, e.timeStamp)), 'device');
  };
  const sense = () => { if (!sensing) { sensing = true; restart(); on<DeviceOrientationEvent>(win, 'deviceorientation', onOrientation); } };
  const so = (win.screen as Screen & { orientation?: EventTarget }).orientation;
  if (so) on(so, 'change', hold);

  const ask = (win as unknown as { DeviceOrientationEvent?: Ask }).DeviceOrientationEvent;
  if (typeof ask?.requestPermission !== 'function') sense();   // Android and the rest: no prompt, the events just come
  else {
    // iOS: the question is asked inside a tap (a click, or a touch's pointerup: both are user gestures), once, and only while the switch is on and motion is not reduced
    const request = () => {
      if (asked !== 'no' || !live()) return;
      asked = 'asking'; tries++;
      ask.requestPermission!().then(
        (r) => { asked = 'done'; if (r === 'granted') sense(); },
        (err: unknown) => { asked = (err as { name?: string })?.name === 'NotAllowedError' && tries < MAX_ASKS ? 'no' : 'done'; },
      );
    };
    on<MouseEvent>(win, 'click', (e) => { if ((e as PointerEvent).pointerType !== 'mouse') request(); });
    on<PointerEvent>(win, 'pointerup', (e) => { if (e.pointerType === 'touch') request(); });
  }

  // Settings applies live: off is the camera as it was (the rig zeroes the tilt on its next frame), on picks up the next movement
  offs.push(env.onSwitch(() => { if (!env.on()) put(null, tilt.source); restart(); env.wake('tilt'); }));
  return () => { for (const off of offs) off(); offs.length = 0; tilt.reset(); env.wake('tilt'); };
}
