# Organ veil (organs cover the vessels inside them; organs show through organs)

Status: BUILT, PUSHED, NOT YET SEEN (Mohammad, 25 Nov 2026: "just implement all, but can reverse it all in one step if i don't like it. go"). Plan and numbers: `/mnt/project-files/organ-veil/plan.md`.

## What he asked for (his words)
- "can we make it so that organs cover or like change the fade or show their texture (both) of vessels going inside them; however, if we zoom in towards a blood vessel this effect decreases/disappears at some zoom (not too much zoom in)".
- "same thing for like organs; if we zoom in into an organ if there's another organ in front of it it should show through elegantly".
- His answers to the plan's questions, taken as the spec: a vessel keeps 45% of itself at the deepest (veil 0.55); the outline dims with the body; the vessel veil is gone at 2x the whole-figure framing; a picked vessel stays crisp; the first pass of organ show-through is the kidney, the spleen and the caudate lobe; no mock.

## Traits (what is built)
- **Vessels.** Where an organ lies in front of a vessel, the vessel's colour (body, outline, blood marks together) is taken toward the organ's own colour at that pixel (its shading and nodules), by how deep behind the organ's front surface the vessel is: nothing at 0.03 scene units, whole at 0.20 (about 1.5 to 10 vein radii). Strength 0.55 at most, so 45% of the vessel is left. The vessel stays one opaque draw: nothing is blended, so nothing stacks where a tube and its junction skin overlap.
- **Zoom (vessels).** Whole up to 1.2x the whole-figure framing (the camera's distance against the whole figure's in the same room, the viewer's own zoom included), gone from 2x, smooth on the log of the distance. The HVPG, wedge, free and route shots (2.2x to 2.8x by their extents) are crisp; the title shot keeps all of it.
- **Organs.** An organ in front of the kidney, the spleen or the caudate lobe (liver, stomach, duodenum, small bowel, colon) has its fill opacity taken down by up to 0.55 where the organ behind is. Its line stays. Over bare page nothing changes. Starts at 1.5x, whole at 3x.
- **Left as they were.** Devices (catheters, stents, probes), the glow and the crossing shadow, the organ lines. Off in the split orbit and the depth-of-field pass.
- **Dive and Circuit (26 Nov 2026).** The veil goes with the organs: its strength is the zoom's share times the organs' own fade (the dive's dissolve, the Circuit's leaving), `veilShare` in config.ts. It is never switched by the view's name: that switch took every vessel's tint off in the dive's first frame (and put it back in the way out's landing frame, and at the Circuit's start), part of the Anatomy to Lobule flicker. In a dive the vessel veil is gone by 2x as before; the organs' show-through rises from 1.5x as it does on a hand zoom, then leaves with the organs. Test: `tests/dive-nothing-switches.test.ts`.
- **Not covered, on purpose (first pass).** The stomach behind the liver, the duodenum, and the right atrium behind the heart are drawn after the organ in front and cut away by depth; letting them show needs the organs drawn in depth order. Plexus strands and the suture thread carry no veil.

## Reference
No picture yet: nothing has been seen on screen. The reference is this sheet, the plan and the commit named below.

## Code
`src/scene/organ-veil/` (config.ts is the whole spec in numbers; glsl.ts the two shader chunks; organ-map.ts the half-size map; uniforms.ts the shared uniforms), read by `vessels/shaders.ts`, `vessels/skin/shaders.ts`, `blood/cells/shader.ts` and `organs/organ-shader.ts`; drawn from `scene.ts render`; the zoom is `rig.zoomOverWhole`. Test: `tests/organ-veil.test.ts`.

## How to take it back in ONE STEP
Set `ORGAN_VEIL.on` to `false` in `src/scene/organ-veil/config.ts` (one line). No map is drawn, every shader reads strength 0, no organ is put on the map's layers, and every picture is the one before it. To remove it for good, revert the commit that built it: the two commits 095a55c9 and 38c0819d (git revert 38c0819d 095a55c9).

## Rejected
None yet. The line "Vessels stay crisp over the organs (plan question 1)" in `anatomy-placement.md` is replaced by this look (his newest word, 25 Nov).

## Risks (told to him)
Unseen on a device. One extra half-size draw of the organs per frame while the veil or the show-through has any strength (not measured on an iPhone). The map is not drawn at all from 2x in (vessels) and below 1.5x (organs).
