# Focus reveal (the liver's tip fades over the GE junction)

Status: BUILT, PUSHED, NOT YET SEEN ON A DEVICE (Mohammad, 26 Nov 2026).

## What he asked for (his words)
"the esophagus is not being seen through the liver edge, perhaps we should make it visible during those slides, like give some fade to the tip of the liver (slowly fade it, transition to fade, not abruptly), and in normal situations, when we zoom into this area, maybe activate the fade if we're trying to look at the GE junction".

## Root cause
The esophagus is part of the stomach's mesh, and the gut is drawn after the liver and depth-tested against it (2D's `#gutHide`): wherever the liver's left lobe lies in front, the esophagus and the cardia are cut away entirely, not washed. A colour fade of the liver alone would show the page there, not the esophagus. The organ veil's own sheet named it: "the stomach behind the liver ... cut away by depth; letting them show needs the organs drawn in depth order".

## The rule (one, for every slide, deck, view and screen)
A **focus** is a structure an organ hides (`FOCI` in `src/scene/focus-reveal/config.ts`). It is revealed by how much it is being looked at:
- **The camera** (slides and free exploration alike): the focus near the middle of the room the cards leave (on within 0.5 of the room's half, off from 0.8) and the camera closer than the whole figure (off at 1.15 times the whole framing, on from 1.45, smooth on the log; `rig.zoomOverWhole`, the organ veil's measure). A hand's zoom onto the junction and a slide that frames it are the same case.
- **The slide's word**: a slide that labels the varices (stations VAR or AZY, its own labels or those its words name) is about the junction, so the zoom does not count, only that the junction is in the room (the varices frames stand only about 1.2 times the whole figure close, measured).
- **Over time**: the strength eases toward that (an exponential, tau 0.5 s: about 1.5 s to settle, both ways). Nothing switches.
- **Locally**: the fade lies on a band round the focus's segment on the screen: whole within 0.07 scene units, gone at 0.20. The liver keeps 15% of its wash there (fadeMax 0.85) and its outline stays, so its shape still reads.

## How it is drawn
Before the liver's fill: the liver's silhouette marks stencil bit 8 (no colour, no depth); then the stomach's own fill and line (the same programs, the same uniforms) are drawn inside it once per pixel, laid by the reveal's strength there; then the liver's fill, its opacity taken down by the same function. So the faded tip lies over the esophagus, as the caudate lobe reads through the liver. Outside the liver's silhouette nothing changes. The organ veil's map is drawn with the same fade, so the varices' tint from the liver eases off over the junction with it. Off in the split orbit and the depth-of-field pass (as the veil), and it goes with the organs' own fade (dive, Circuit).

## Code
`src/scene/focus-reveal/` (config.ts the rule in numbers; glsl.ts the one chunk; reveal.ts the scene's measure, ease and uniforms; uniforms.ts), `organs/layer.ts buildFocusReveal`, `organs/organ-shader.ts` (one line), `parts/frame.ts` (the camera step eases it), `parts/render.ts` (writes it), the slide's word through `ui/deck/figure-calls.ts` -> intent `focus` -> `reconcile.ts setSlideFocus`. Test: `tests/focus-reveal.test.ts`.

## A new focus
One more row in `FOCI`: its segment, the organs that hide it, the organs drawn under the fade, the stations that make a slide about it.

## Risks
Unseen on a device. One more draw of the liver (no colour) and of the stomach while it is on; nothing at all while it is off. The fundus frames of Gastric varices put the junction at the room's edge: there it is partly on.
