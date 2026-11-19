// The listeners behind the gentle tilt (tilt.ts holds the numbers): the pointer over the window on a laptop, the device's orientation on a phone or tablet.
// They only set the rig's tilt input and ask the clock for one frame when it changed enough; the easing and the frame cost are in the rig's own update, so nothing here
// draws, nothing runs per frame, and no pointer event is stopped, captured or cancelled (src/scene/gesture/controller.ts is untouched: passive listeners on the window).
//   iOS asks permission for motion data and only inside a tap: it is asked once, on the first tap (never on load), and a refusal leaves the pointer as the only input.
import type { CameraRig } from './rig.ts';
import { DeviceBase, deviceUnit, pointerUnit } from './tilt.ts';

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

/** Installs the listeners; returns the remover. Safe to call where there is no window (it does nothing). */
export function installTilt(env: TiltEnv, win: Window = window): () => void {
  if (typeof win === 'undefined') return () => undefined;
  const { rig } = env, tilt = rig.tilt, base = new DeviceBase();
  let lastMouse = -1e9, sensing = false, asked: 'no' | 'asking' | 'done' = 'no';
  const offs: (() => void)[] = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void) => { t.addEventListener(type, fn as EventListener, { passive: true }); offs.push(() => t.removeEventListener(type, fn as EventListener)); };
  const live = () => env.on() && !env.reduced();
  const put = (u: { x: number; y: number } | null) => { if (tilt.set(u)) env.wake('tilt'); };

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
  on(win.document, 'visibilitychange', () => { if (win.document.hidden) { tilt.reset(); base.reset(); env.wake('tilt'); } });

  // a phone or tablet: the device's orientation, from where it is held
  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || !live()) return;   // (a desktop browser sends one empty reading)
    if (e.timeStamp - lastMouse < 2000) return;                 // (a pointer is in use: it leads)
    const angle = (win.screen as Screen & { orientation?: { angle: number } }).orientation?.angle ?? 0;
    const d = base.read(e.beta, e.gamma, e.timeStamp);
    put(deviceUnit(d.db, d.dg, angle));
  };
  const sense = () => { if (!sensing) { sensing = true; on<DeviceOrientationEvent>(win, 'deviceorientation', onOrientation); } };
  const so = (win.screen as Screen & { orientation?: EventTarget }).orientation;
  if (so) on(so, 'change', () => base.reset());

  const ask = (win as unknown as { DeviceOrientationEvent?: Ask }).DeviceOrientationEvent;
  if (typeof ask?.requestPermission !== 'function') sense();   // Android and the rest: no prompt, the events just come
  else {
    // iOS: the question is asked inside a tap (a click is a user gesture), once, and only while the switch is on and motion is not reduced
    const request = () => {
      if (asked !== 'no' || !live()) return;
      asked = 'asking';
      ask.requestPermission!().then((r) => { asked = 'done'; if (r === 'granted') sense(); }, () => { asked = 'done'; });
    };
    on<MouseEvent>(win, 'click', (e) => { if ((e as PointerEvent).pointerType !== 'mouse') request(); });
  }

  // Settings applies live: off is the camera as it was (the rig zeroes the tilt on its next frame), on picks up the next movement
  offs.push(env.onSwitch(() => { if (!env.on()) put(null); env.wake('tilt'); }));
  return () => { for (const off of offs) off(); offs.length = 0; tilt.reset(); env.wake('tilt'); };
}
