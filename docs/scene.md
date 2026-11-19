# The 3D scene (src/scene/)

Plain three.js in one object (`CelScene`), drawn by the one clock. `Stage.tsx` is only the R3F canvas around it and the pointer handling.

## What the other threads call (`src/scene/api.ts`)

```ts
import { sceneApi, cel, usePick } from '../scene/api.ts';
sceneApi.goTo('free', room, ms?)        // fly to a named shot, fitted into the free room (CSS px {x,y,w,h}); straight, 950 ms, ease in-out cubic
sceneApi.setRoom(room)                  // the cards moved: shift the picture into the new room, same curve
sceneApi.setCatheter({ advance, balloon })   // 0..1 each; the caller tweens them on the clock (route: advance 0 to 1, wedge: balloon 0 to 1)
sceneApi.setNamedVessels(['RHV_IVC'])   // edge IDs the slide talks about: flow-mark option A runs chevrons on these and the picked vessel
sceneApi.pick('PV_TRUNK' | null)        // vessel highlight; usePick() holds the picked edge ID for the data card
sceneApi.anchor('tip' | 'ra' | 'ivc' | 'rhv' | 'pv' | 'spleen')   // scene points for tags
sceneApi.project(point)                 // where a scene point is on the canvas now (CSS px); sceneApi.cameraMoving is true in flight
sceneApi.flowPulse()                    // option D only
sceneApi.refit()                        // glide the hand's pan and zoom home to the shot's framing (the Fit button, a second tap on the active view)
```

Shots (`camera/shots.ts`): `title`, `route`, `free`, `wedge`, `hvpg`, `play`, `pick`. A shot says what to look at and how much of the body it needs;
the room solver (`camera/room.ts`) pulls the camera back when the free room is too small, and shifts the projection into the room's centre.
The rig tweens every field straight from the current pose to the next (no fit waypoint), including the room, so a card move and a shot can overlap.

## Where things live

| File | Job |
|---|---|
| `palette.ts` | scene tones from the one looks table; highlight colour; flow-mark colours chosen by contrast per vessel and look |
| `materials/shaders.ts`, `cel.ts` | banded toon, screen-pixel ink hull with the highlight fade, flow marks, data-texture reads; `CelObject` = ink + toon on one geometry |
| `anatomy/placeholder.ts`, `vessels.ts` | procedural organs; vessels named by topology edge ID, centrelines in flow order, one geometry each |
| `highlight.ts` | downstream/upstream walk of the topology; fade in and out (180 ms) |
| `flow.ts` | the four flow-mark options behind `useSettings().flowMarks`; speed curve (`markSpeed`) |
| `catheter.ts` | HVPG route and balloon from `{advance, balloon}` |
| `gesture/` | the figure's hands, ported from the 2D app (`stage-gestures.js`): `view.ts` limits and rubber band, `ease.ts` glide curves, `flick.ts`, `wheel-glide.ts`, `frame-queue.ts` (every glide asks the clock for a frame, never rAF), `controller.ts` events |
| `scene.ts` | assembles it; `update(now)` returns true while anything moves |

Colour: the cel shaders do their banding in sRGB space (the spec's factors are written that way) and write their output as is, so a flat area is
exactly the token hex. The body plate and the clear colour go through three's own colour management and land on the same hex. (The first mocks
wrote linear values straight out and looked darker.)

## Gestures (`gesture/controller.ts`, all numbers as in the 2D app)

| Input | Does |
|---|---|
| one finger / mouse drag | turns the figure within ±25° (`dragToOrbit`, the one rule), momentum on release |
| two fingers | pinch zoom and pan together; the point under the midpoint stays under it; one finger left after a pinch pans, never taps or throws |
| Shift-drag, middle button | pan, flick on release |
| Mac trackpad two-finger scroll | pan on the rubber band |
| trackpad pinch, Ctrl/⌘ + wheel, Safari gesture events | zoom about the pointer; the page itself never zooms |
| mouse wheel | zoom about the pointer, glided about 100 ms |
| double click | zoom ×2 about the point (Shift: out); touch never |

Zoom 0.6 to 6 (stretches a little past, springs back after 220 ms); the figure can never be lost (its edge may not pass the room's middle). Touches within
12 px of the sides or 34 px of the foot are the system's. Cards and the wallet are page elements above the canvas, so a gesture that starts on one never
reaches the figure. A new shot or Fit stops what the hand started (`handsOff`) and the hand's view glides home with the camera.
