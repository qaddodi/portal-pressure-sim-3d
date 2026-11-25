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
The anatomy is a long lens (FOV 14°) and rests face on (yaw 0, pitch 0 in `title`, `play`, `pick`), so the plate lines up with the 2D app's; only the catheter shots keep a small turn. The room solver (`camera/room.ts`) pulls the camera back when the free room is too small, and shifts the projection into the room's centre.
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
| `camera/tilt.ts`, `tilt-input.ts` | the gentle tilt (Settings > Figure depth > Tilt): pure core (target, easing, clamp, locks) and the pointer / device-orientation listeners |
| `scene.ts` | assembles it: the scene's state and construction; `update(now)` (in `parts/frame.ts`) returns true while anything moves |
| `parts/` | `CelScene`'s methods, one file per frame system (`camera`, `circuit`, `dive`, `views`, `flow`, `micro`, `skins`, `vessels`, `look`, `disease`, `procedures`, `pick`, `frame`, `inspect`, `render`, `build`) and `shared.ts` (its constants and helpers). Each part is an object of methods whose `this` is the scene, mixed into the class's prototype (`parts/define.ts`); the state stays in `scene.ts`, so it is not `private`. A new method goes in the part of its frame system, not in `scene.ts` (no line over 200 characters: lint rule `long-line`). |

Colour: the cel shaders do their banding in sRGB space (the spec's factors are written that way) and write their output as is, so a flat area is
exactly the token hex. The body plate and the clear colour go through three's own colour management and land on the same hex. (The first mocks
wrote linear values straight out and looked darker.)

## Gestures (`gesture/controller.ts`, all numbers as in the 2D app)

| Input | Does |
|---|---|
| one finger / mouse drag | turns the figure within ±25° (`dragToOrbit`, the one rule), momentum on release; the turn stays where the viewer leaves it, and only Fit, a second tap on the view pill or the 0 key (refit) brings it home (critically damped, `orbitHome`); a new shot eases it home with the move |
| two fingers | pinch zoom and pan together; the point under the midpoint stays under it; one finger left after a pinch pans, never taps or throws |
| Shift-drag, middle button | pan, flick on release |
| Mac trackpad two-finger scroll | pan on the rubber band |
| trackpad pinch, Ctrl/⌘ + wheel, Safari gesture events | zoom about the pointer; the page itself never zooms |
| mouse wheel | zoom about the pointer, glided about 100 ms |
| double click | zoom ×2 about the point (Shift: out); touch never |

Zoom 0.6 to 6 (stretches a little past, springs back after 220 ms); the figure can never be lost (its edge may not pass the room's middle). Touches within
12 px of the sides or 34 px of the foot are the system's. Cards and the wallet are page elements above the canvas, so a gesture that starts on one never
reaches the figure. A new shot or Fit stops what the hand started (`handsOff`) and the hand's view glides home with the camera.

## The dive (WP8, 19 Nov 2026)

`src/scene/camera/dive.ts` holds the numbers; `tests/scene-dive-wp8.test.ts` holds them in place. Anatomy to Lobule 1.6 s, Lobule to Sinusoid 1.1 s, Anatomy to Sinusoid the two together, each backward the same (`diveMs`).
The lens (`rig.fov`: 14 to 35 and back, with the dolly zoom, 0.3 s to 1.3 s of a plunge) is the camera's own and carries its value into a move that is reversed half-way, so it never jumps; Reduce Motion keeps the long lens.
Everything else the dive does is a function of the camera's DISTANCE from the liver's place, so the way out is the way in run backward however the move is reversed or resized: the cutaway window in the organs' wash
(`ORGAN_CUT`, the organ shader's `cut`: opens from 5.5 to 1.9 units out, soft edge, shut in every body shot), the body's dissolve (`bodyFade`), the sinusoid's tissue (`diveShare`) and the neighbours' focus
(`fieldSoft`, against the distance the lobule is framed at in this room). A card opened mid-dive keeps the dive's remaining time (`rig.setRoom`). `scene.stepPortrait` tells the sinusoid view when the room is portrait.

## The gentle tilt (depth upgrade 3, 19 Nov 2026)

An owner-approved exception to match-2D: the figure turns at most 3.5° (yaw) and 2.5° (pitch) toward the pointer on a laptop, or with the device's orientation on a phone or tablet (a dead zone, and the held position follows a steady hand over 4 s). It is an offset added to the shot's yaw and pitch in `rig.apply`, never kept in the hand's or the orbit's state, so Fit, Home and refit return to the exact rest view and `rig.fitRect` is measured with it off. Picking and tags use the same `rig.camera`, so they follow the tilted picture. It eases (260 ms in, 140 ms out) inside `rig.update`, so a frame is asked for only while it eases; the listeners (passive, on the window, never touching the gesture controller) wake the clock once per meaningful change. It is square (eased to zero) while a gesture runs, a camera move runs, or the view is not the body; with Reduce Motion or the switch off it is zero with no easing. iOS asks for motion data inside the first tap (never on load); a refusal leaves the pointer as the only input. `tests/scene-tilt.test.ts`.
