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
| `scene.ts` | assembles it; `update(now)` returns true while anything moves |

Colour: the cel shaders do their banding in sRGB space (the spec's factors are written that way) and write their output as is, so a flat area is
exactly the token hex. The body plate and the clear colour go through three's own colour management and land on the same hex. (The first mocks
wrote linear values straight out and looked darker.)
