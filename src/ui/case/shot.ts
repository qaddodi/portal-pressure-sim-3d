// A stop's shot on the figure: its fields are a slide's, so the slide's own planner (decks/hp/plan.ts planSlide) makes the scene of it, framing rules and all, and the scene takes it as it
// takes a slide's (ui/deck/scene-link.ts): the Circuit framed on its region, the lobule or the sinusoid on their cameras, the body on its shot, in the room the free play's cards leave.
import { sceneApi } from '../../scene/api.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { viewRoom } from '../shell/room.ts';
import { cutRoom } from '../tests/room.ts';
import type { StopShot } from './types.ts';
import { stopScene } from './shot-plan.ts';
import { useCaseRoom } from './room.ts';

/** Take the shot: the view pill follows, the lens is the shot's, and the camera flies there on the slide's own time. A view the figure cannot draw yet stands on the whole body. */
export function showShot(s: StopShot): void {
  const ready = useShell.getState().ready[s.view];
  const view = ready ? s.view : 'anatomic';
  useShell.setState({ view });
  const { vp, device } = useUi.getState();
  const base = viewRoom(view, vp, device);
  const sc = stopScene(ready ? s : { view: 'anatomic', cam: 'fit' }, base, useCaseRoom.getState().cut, device, vp.safe.left);
  const room = cutRoom(base);
  sceneApi.setLens(sc.lens);
  if (sc.view === 'circuit') {
    const c = sc.circuit;
    sceneApi.showCircuit(room, { box: c?.box ?? null, kMax: c?.kMax ?? null, resistors: c?.resistors ?? [], caudate: !!c?.caudate });
  } else if (sc.view === 'lobule' || sc.view === 'sinusoid') sceneApi.showView(sc.view, room, sc.lobuleCam ?? 'lobule');
  else sceneApi.showShot('body', sc.shot, room);
}
