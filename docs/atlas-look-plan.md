# The atlas look: a plan to make the 3D app beautiful

19 Nov 2026, 5:10 PM ET. Read at the integration tip `bf442b6` (`claude/project-thread-ge1swr`) and the 2D app at `b3058ef3`
(`claude/settings-topbar-icon-flvft1`). Evidence: Mohammad's 11 iPhone screenshots at `bf442b6` (Dark look, CSPH), the one at `7e3a295`
(Light, before the shader fix), the 2D pictures in `public/guides/beta-start-guide.pdf`, and the code. Nothing was run: no browser, no
headless, no shots. Where a cause is read from code and not proven on a device, it says "likely".

This is a plan, not code. Every work package at the end can be its own thread.

---

## 0. The short version

The 3D app does not look like the 2D app for five reasons, and none of them is "3D is hard". Each one is a value that was typed
fresh in 3D when 2D already had it, or a 3D default nobody turned off.

| # | What you see on the iPhone | Why (file) | What 2D does (file) |
|---|---|---|---|
| 1 | Organs are heavy, muddy brown (Light) or grey beige (Dark) and own the picture | The 3D organs use the old flat `--organ-*` tokens, opaque (`src/looks/looks.ts`: liver `#905B49`, dark `#A88C82`) | The organ painter uses three tones per organ (`--og-liver-1/2/3`), a gradient, and the whole organ layer at **55 % opacity** (`styles/app-06-plate.css:170`, "Organs recede behind the vessels: the plate is context, the circulation is the subject") |
| 2 | Black outlines everywhere; varices become a black spindle | Ink is opaque near-black at a fixed 1.2 to 1.8 CSS px (`docs/look-and-feel.md` §3, `scene.ts:204`, `organs/layer.ts` ORGAN_STYLE). On a 3x iPhone that is 3.6 to 5.4 device px on every tube, however thin | Vessel outline = 0.14 × radius, held to **1.5 to 3 device px**, in the casing colour at **64 %** (`src/ui/tube-cel-glsl.js` CEL, `tokens.css:284`). Organ outline = the organ's own dark tone `--o3`, 1.1 px at 62 %, under the 55 % layer (so about 34 %) |
| 3 | Vessels look like shiny plastic pipes with seams, ball joints and bulbous ends | World-lit two-band toon with shade × 0.62 and a specular dot (`vessels/shaders.ts`); a sphere cap on every end of every piece (`vessels/tubes.ts:64`); ink and body of each piece in one draw, so piece B's ink lands on piece A's body at a join; the veil pass is `DoubleSide`, transparent, no stencil (`vessel-object.ts:156`) | Three gentle tones in **screen space** (shadow −17 %, lit +15 % toward white, `CEL.SHADE`/`CEL.LIT`), lit from the top left of the screen, so two pieces of one vein shade the same at the join. One outline round the union of joined tubes (`tube-joint.js`, `tube-join-glsl.js`) |
| 4 | Labels sit on the wrong vessel ("Lower IVC" on the SMV); things don't line up | The camera rests turned (yaw 0.18 to 0.32 rad, FOV 30°, `camera/shots.ts`) while the tiers span z −0.32 to +0.54, so the cava slides 40 to 70 2D units against the portal tree. The label stations still read the **placeholder** vessel courses (`labels/stations.ts` imports `anatomy/vessels.ts`) and put every node on the front tier (`nodeAt`, `TIER_Z.front`) | 2D is a flat plate seen face on |
| 5 | Lobule: extruded boxes, a hexagonal prism, ropy sinusoids, a dotted brown field with heavy black hexagons. Sinusoid: a strip floating in black | Cells and nuclei are `ExtrudeGeometry` depth 1 under a perspective camera, each with an ink hull (`lobule/view.ts:180`); lobule tubes have 6 sides (`tubeSet(..., 6)`); the neighbour field "dissolves" with the screen-door dither (`FADE_GLSL`), which reads as dots; the sinusoid is a short extruded strip (`sinusoid/flat.ts`) | The lobule is a flat histology plate: round-cornered cells at 92 %, a 0.6 px membrane, a nucleus dot, the vessels on top in the anatomy's own renderer (`lobule-paint.js`, `lobule-zoom.js`). Neighbours are flattened 30 %, faded into the page from 1.1 R to 3.2 R, and blurred with distance (`lobule-look.js`). The sinusoid is **one full-screen shader** in micrometres that fills the screen with plates (`sinusoid-gl.js`) |

**The ten moves, in order of visual impact**

1. Organs become 2D's quiet wash: lift the `--og-*` three-tone tables, paint 2D's gradient, inner turn and rim light in the shader, and composite the organ layer at 2D's opacity. (WP1)
2. Vessel ink and shading become 2D's: outline width by radius in device px, casing colour at its alpha, three soft screen-space tones, no specular. (WP2)
3. Joins: no caps at joined ends; per tier, all ink first, then all bodies; the veil drawn once per pixel with the stencil. (WP3)
4. The camera rests face on with a long lens (FOV 12 to 15°), so the plate lines up with 2D; the orbit is a gesture, not the rest pose. Labels read the real courses. (WP4)
5. The lobule and sinusoid become 2.5D: 2D's flat histology lifted onto planes under an orthographic camera, the vessels in the anatomy's own renderer on top, and the field as one procedural shader with 2D's fade and blur. (WP5, WP6, WP7)
6. The dive from the liver into the lobule into the sinusoid becomes one continuous camera move with depth cues (the thing 3D does better than 2D). (WP8)
7. Varices, strands and the cavernoma read as bundles with one outline, in pressure colour, never black. (WP9)
8. The GPU never kills a whole layer silently again: an on-device compile page, a fallback material, and a pixel-ratio and MSAA policy for iPhone. (WP10)
9. A look board on the Mac: 2D and 3D side by side at the same framing, captured in his own browser, compared by a node script. (WP11)
10. The finish: line quality, easing, loading, empty states, reduced motion, dark-look edges. (WP12)

**Three decisions for Mohammad** (my recommendation first):
- **A. Organs translucent like 2D** (organ layer at 55 % on Light and Dark, 72 % on Soft) rather than opaque 3D bodies. Recommended: it is the 2D rule word for word, and it is what makes the vessels the hero.
- **B. Rest the anatomy face on** (yaw 0, pitch 0, long lens) and let the drag orbit and spring back, rather than resting turned. Recommended: the plate then matches 2D 1:1 and the labels line up; the 3D shows the moment you touch it.
- **C. Lobule and sinusoid as 2.5D** (2D's painters on planes, 3D only in the dive and the vessels) rather than modelled 3D tissue. Recommended: 2D's lobule is a histology plate, and every 3D artifact in the screenshots comes from extruding it.

---

## 1. What 2D actually is (the target, measured)

2D reads as an atlas because of a strict value structure: a pale page, a paler-than-you-think organ wash, and saturated, clean vessels
with fine outlines. The organs are almost the same value as the page. The vessels are the only strong colour.

```
  value (Light look)      2D today                         3D today (7e3a295 / bf442b6)
  ─────────────────────────────────────────────────────────────────────────────────────
  page   #F1EBE0  ████   page                             page
  organs ≈#E1C0B1 ███▒   organ wash (55 %)                ▓▓▓▓ organs #905B49  ← darkest thing on screen
  vessel lumen    ██▓▓   pressure ramp #85B6E9..#680C2F   (missing / black at 7e3a295)
  outlines        ░      sepia at 64 %, 0.5-1 css px      ████ opaque ink 1.2-1.8 css px
```

Effective organ colours (the two gradient stops' middle at the layer's opacity over the page; computed from `styles/tokens.css`):

| Look | Liver | Stomach | Spleen | Gut | Kidney | Heart |
|---|---|---|---|---|---|---|
| Light (2D) | `#E1C0B1` | `#E9CEC1` | `#D4BBC4` | `#EECCBC` | `#C691AA` | `#E4BAAE` |
| Light (3D now) | `#905B49`, lightened by `organTone` for ink contrast | `#A67A6C` | `#7A5F78` | `#AF826E` | `#895F7A` | `#9D575C` |
| Soft (2D, layer 72 %, gut 70 %) | `#BA8568` | `#B4886E` | `#AD8698` | `#CAAB97` | `#AB718C` | `#B68B77` |
| Dark (2D, layer 55 %) | `#503329` | `#574038` | `#432F3C` | `#5B4339` | `#5B2A47` | `#522C27` |
| Dark (3D now) | `#A88C82` | `#A99088` | `#93889A` | `#AC9289` | `#A07E8E` | `#AE8387` |

On Light the 3D organs are about twice as dark as 2D's; on Dark they are about twice as **light**. Both are backwards from "quiet
context". On Dark, 2D's organ outline (`--og-liver-3 #C1998B`) is *lighter* than the fill, a soft light edge, not a black line.

Vessels in 2D (`src/ui/tube-cel-glsl.js`):
- Fill: the lens colour (Pressure by default). Three tones only: shadow (×0.83) below s = −0.16, base, lit (15 % toward white) above s = 0.24, where s is the place across the tube against a **fixed screen direction** (top left). Each edge one device pixel soft. Hairlines get no tones.
- Outline: `clamp(0.14 × R, 1.5, 3.0)` **device** px, the look's casing colour at its alpha (Light 59 44 34 at .64; Soft .66; Dark 14 11 9 at .3; .38 under a colour lens). Veiled vessels keep half of it.
- Dark lumens on the dark looks get a 1 device px light edge inside the wall (`rimInk`).
- No specular, no rim light. The "wet dot" is a 3D invention.

The lobule in 2D (`src/ui/lobule-paint.js paintLobule`, `lobule-zoom.js` header): "a quiet canvas holds the tissue" under the vessels.
Cells are round-cornered rectangles (corner 0.38 × short side) at 92 % over the gap colour (80 % on dark, base pulled 72 % toward the gap),
a 0.6 px membrane, a nucleus dot (radius max(0.9, 0.16 × width)). Zone 3 deeper and warmer (`cordTone`). Sinusoids drawn by the anatomy's
vessel renderer, 25 % narrower than before so the cords read (`SIN_NARROW`). Neighbours: contrast cut 30 % (`NEIGHBOUR_FLAT`), faded into the
page from 1.1 R (72 % at mid-way, `FADE_MID`) to 3.2 R, never more than 50 % at any screen edge (`EDGE_FADE`), blurred with distance (`fieldDof`).

The sinusoid in 2D (`src/ui/sinusoid-gl.js`): one full-screen fragment shader in the sinusoid's own frame (µm, x along the flow), so the
tissue fills the screen to every edge; plates of tidy polygonal hepatocytes on both sides and the next plates out; endothelium as one
thin sheet cut by real fenestrae; Disse with microvilli, collagen and lymph running back; stellate and Kupffer cells as textbook figures;
albumin as point sprites. "Flat fill, no outline, as the lobule draws its cells: a shape reads by its colour against what is under it."

---

## 2. Art direction (the bible for every thread)

### 2.1 Principles
1. **The circulation is the subject; everything else is paper.** The vessels are the only saturated, high-contrast things in Anatomy. Organs sit within about 15 % of the page's value (Light) and are never darker than the mid-pressure vessel.
2. **2D's numbers, 3D's depth.** Every colour, opacity, line width and tone step comes from 2D's tokens by copy script. 3D adds only what depth needs: correct overlap, a dive, an orbit, and soft depth cues. If 3D needs a number 2D does not have, it is written once in `looks.ts` with a comment saying why.
3. **Lines describe, they do not box.** Outlines are thin, warm and partly transparent. Black ink never appears on the Light looks.
4. **Shading is a hint of roundness, not lighting.** Three tones, fixed to the screen's top left, so the picture does not change when the figure turns a few degrees. No specular, no cast shadows, no SSAO.
5. **Flat things stay flat.** Histology (lobule, sinusoid) is a plate. Extrusion is never used to make a 2D shape "3D".

### 2.2 Value and hierarchy per view

| Layer (front to back) | Anatomy | Lobule | Sinusoid |
|---|---|---|---|
| Labels, callouts | text + halo, constant size | same | same |
| Hero | vessels in the lens colour, fine casing | sinusoids, venules, central vein in pressure colour | the lumen and its blood, the wall and its pores |
| Support | catheter, devices, varices | portal triads (venule, arteriole, ductule), lymph, bile | Disse, lymph, stellate, Kupffer |
| Context | organs at 55 % | hepatocyte plates (pale, 92 %) | hepatocyte plates |
| Far context | the body plate, the faint cava and azygos (veil) | neighbouring lobules: −30 % contrast, faded and blurred | the neighbouring plates, dimmer |
| Ground | page colour, flat | page colour | page colour (never black on Light) |

### 2.3 Palette

Lift, do not type. Add to `scripts/copy-b3-data.mjs` (or a new `scripts/copy-organ-tones.mjs`) a generated `src/looks/organ-tones.copied.ts` with,
per look, every `--og-<organ>-1/2/3`, `--og-light`, `--og-dark`, `--og-ao`, `--og-vol-shade`, `--organ-body`, `--gut-a`, the organ layer opacity
(.55, Soft .72, kidney .85/.88), `--casing-rgb`, `--casing-a` (and its `.cmap` value), and the lobule's `--lz-*` and sinusoid's `--sv-gl-*`.
`looks.ts` keeps the UI tokens and reads organ and vessel values from the copied file. `lobule/tones.ts` stops typing `CELL_BASE` hexes and reads `--lz-*`.

### 2.4 Line rules (replace `look-and-feel.md` §3)

| Object | Width | Colour | Opacity |
|---|---|---|---|
| Vessel | `clamp(0.14 × R_px, 1.5, 3.0)` device px, R_px the tube's screen radius | `--casing-rgb` | `--casing-a` (.64 Light, .66 Soft, .30 Dark; .38 under a colour lens) |
| Veiled vessel (behind an organ, the cava) | half of the above | same | same × 0.5 |
| Organ silhouette | 1.1 CSS px (kidney 1.4) | the organ's `--og-*-3` (lighter than the fill on Dark) | .62 (kidney .95; RA .35), then the layer's .55 |
| Organ crease (bowel loops, colon bands) | 0.84 CSS px | `--og-*-3` | .42 |
| Picked vessel | + 4 device px ring outside the outline | 2D's selection ring colour | the ring's alpha |
| Devices (catheter, stent) | 2D's device floors (`visual-style.md` D3) | device ink per look | 1 |
| Lobule cells | 0.6 CSS px membrane, inside only | `--lz-plate-line` | as 2D |

The width is computed in the vertex shader from the tube's projected radius (it already has `vR` and `wpc`); the floor is in device pixels
so a hairline never vanishes and a thin strand never turns into a black rope.

### 2.5 Shading recipe

**Vessels** (port `celTones` from `tube-cel-glsl.js` into `VESSEL_FS`):
```glsl
// across: -1..1 across the tube as seen (already computed in VESSEL_FS)
// g: the unit screen direction from the axis toward this pixel = sign(across) * screenSide
float s = abs(across) * dot(g, CEL_DIR);            // CEL_DIR = normalize(-1,-1) in screen space (x right, y down)
lum *= 1.0 - 0.17 * (1.0 - smoothstep(-0.16 - et, -0.16 + et, s));
lum  = mix(lum, vec3(1.0), 0.15 * smoothstep(0.24 - et, 0.24 + et, s));
```
Because it uses the screen and not the world normal, two pieces of one vein at a join, and a vein seen at 20° of orbit, keep the same three
tones: no seams, no flicker. Drop `spec` and `rim` for vessels (set both to 0; keep the uniforms for the catheter's metal).

**Organs** (a new `ORGAN_FS`; replaces the three-band toon for organs only). It paints what 2D paints with SVG strokes, in one pass:
```
fill   = mix(o1, o2, t_grad)          // 2D #og-<t>: a linear gradient from the box's top left (.15,0) to bottom right (.85,1)
fill  += ogVol                        // radial from (.34,.26): +22 % light-ink at the centre, +17 % vol-shade at the rim
turn   = 1 - ndv (screen-facing)      // the inner shade s1..s3: 2D strokes 30/18/8 px wide at .09/.15/.24 along the inside edge
fill   = mix(fill, og-dark, 0.09*b1 + 0.15*b2 + 0.24*b3)  // three soft steps of `turn`, not a continuous gradient
rim    = rim light on the edge facing the screen's top left: og-light at .58, 3 px
alpha  = layer opacity (.55 / .72)    // see 2.6
```
`t_grad` and the radial use the organ's own 2D box (write it into the organ file at build: `art/organs-simple/build.py` already has the
outlines), so the gradient sits where 2D's does. The organs then look like 2D's from the front, and turn gently when orbited because `turn`
comes from the real normal.

### 2.6 Compositing (how translucent organs work in 3D without sorting)

2D lays each organ group on the page at 55 %. In 3D, do it in two cheap ways, in order of preference:

1. **Pre-mix against the plate (no blending at all).** Everything behind an organ is the page or the body plate (a flat colour), plus the back
   tier. So the shader can output `mix(plate, organColour, layerAlpha)` opaque. Overlapping organs (stomach over liver) show the front one,
   as the 3D depth says. Cost: zero. This alone gets 95 % of the look.
2. **The back tier through the organs** (cava, azygos, the vessels in `BACK_EDGES`) already has its own veil pass drawn over the organs at 0.4. Keep it, but fix how it is drawn (WP3).

An offscreen organ layer (render organs to a half-res target, composite at alpha) is possible but is a second render target on iPhone; not needed.

### 2.7 Background, plate, light and dark
- Ground = `--bg`, flat. The body plate (`--organ-body`) is optional in 2D (`#backdrop` at .7); keep it off unless a 2D slide shows it.
- No vignette, no gradient sky, no fog in Anatomy. Depth in Anatomy comes only from overlap and the veil.
- **Dark looks:** organs deep (the table above), organ edges light (`--og-*-3`), vessel casing at .3, dark lumens get 2D's `rimInk` light edge, the dark pressure ramp (already copied in `lenses/tokens.copied.ts`). Never a black outline on a dark ground.
- **Black look:** the organs need a little more separation from `#000`; lift only the organ layer's opacity (2D's own Black tokens), nothing else.

---

## 3. Vessels

### 3.1 Relation to organs (the core of "inside the liver")

2D's model is simple and right for teaching: **every vessel is drawn over the organs**, and the organs are a translucent wash, so a vein
"inside" the liver reads as inside because the liver tint lies around it, not over it. Only the retroperitoneal tier (cava, azygos) is drawn
*behind*: veiled to about a fifth (`stage-geo.js:168`: "behind the liver it is about a fifth of full").

The 3D already copies the first half (`CelScene.render`: organs, clear depth, vessels on layer 1). What it lacks is the wash. With WP1 the
intrahepatic portal and hepatic trees will read exactly as in 2D. Then, 3D can add three things 2D cannot, all optional and all small:

```
     ┌───────────── liver (55 % wash) ─────────────┐
     │   ╲ RHV        MHV │   LHV ╱                │   front tier: portal tree, hepatic veins, full colour
     │    ╲═══════╗  ║    ║ ╔═══╱                  │
     │     ═══PV══╬══╬════╬═╝                      │
     │  ░░░░░░░░░░║░░║░░░░║░░░░  cava (veil .2)    │   back tier: drawn behind, through the wash, half outline
     └─────────────────────────────────────────────┘
```

1. **X-ray edge on orbit** (optional): when the user orbits past ±8°, fade the organ's fill toward the plate by up to 25 % and keep its
   silhouette line, so the vessels behind the liver's thick right lobe don't "sink". Driven by one uniform from the rig, eased.
2. **Cutaway window for the dive** (WP8): as the camera dives into the liver, a soft-edged disc around the dive point clears the liver's
   wash (an SDF in the organ shader: `alpha *= smoothstep(r0, r1, dist(screenPos, divePoint))`), so you see the sinusoid bed you are diving
   into, not a brown wall.
3. **Depth separation of crossings**: the tiers already give over and under. Add 2D's rule only: same-tier crossings get no knock-out ring (V2 was parked in 2D).

What not to do: no real transparency sorting of organs, no depth-tested vessels against organs (that is what buried them), no fog.

### 3.2 Joins, tapers, fillets

The B3 thread has done the geometry (run-ons smoothed, `taper`, `flare`). The remaining artifacts are rendering:

- **Caps.** `buildTubes` adds a `SphereGeometry` at both ends of every course. Keep a cap only at a *free* end (no run-on, no fork, no node shared
  with a drawn vessel); at a joined end, end the tube open, one radius inside its neighbour. The caps also carry the curve's end tangent for
  every vertex, so `across` is wrong on them: a source of the "seam" ring.
- **Ink then fill, per tier.** One draw per vessel draws its hull and body together, so the next vessel's hull is drawn over the first's body
  at the join (the dark collar in IMG_5631 and 5637). Draw, for each tier back to front: all hulls (depth test on, depth write **off**), then
  all bodies (depth test and write on). Bodies cover every hull inside the union, so a join has one outline, as in 2D. Cost: about 55 more draw
  calls; still under 150. Or keep one draw per vessel and give the hull `renderOrder = tier * 2`, the body `tier * 2 + 1`, using two
  materials on two groups of the same geometry (`geometry.addGroup` for the `hull` halves): still one geometry, two draws.
- **The veil drawn once.** The veil mesh is `DoubleSide`, transparent and blends its back faces, front faces, hull and caps on top of each other:
  the "grey ghost tube with dark ball joints". Draw it with the stencil: `stencilWrite: true, stencilFunc: NotEqualStencilFunc, stencilRef: 1,
  stencilZPass: ReplaceStencilOp`, front faces only, after clearing the stencil once per frame. Each pixel is blended once at 0.4, exactly 2D's veil.
  Fading free ends (`fades.ts`) need the same, or they get ball ends too.
- **Bulbous ends** (IMG_5631 hepatic veins): the caps keep the un-swollen radius while the tube swells with the data texture's diameter, and
  the flare collar adds on top. With caps gone at joins this goes; for free ends, give the cap's vertices the same `rk` path as the tube's last ring.
- **Taper and width at zoom.** Widths are in 2D figure units (correct). Add a screen floor: a vessel is never thinner than 1.5 device px of fill
  plus its outline, as 2D's `visual-style.md` D3 asks for devices.

### 3.3 Chevrons
Already 2D's (`chevOne`, the stream chain landed in `a8eddb5`). Two checks: the chevron ink flips by lumen lightness (2D B1: near-black on a
light lumen, cream on a dark one), and heads stay off vessels under the veil (2D does not run heads on the faint cava).

### 3.4 Pressure colour legibility
- The lens ramps are already lifted per look. With the organs as a wash, the Light ramp's pale end (`#B8D5ED` at 0) sits on `#E1C0B1`: about 1.3:1. The outline carries it (2D's reasoning). Keep it.
- Dark: the dark ramp ends at `#B31553` on organs at `#503329`: fine. Add `rimInk` (2.7 above).
- Never let a vessel's lens colour be replaced by the ink: on a thin strand, the outline width rule (2.4) guarantees at least half the width is fill.

### 3.5 Selection and hover
Keep the 3D "long ahead, short behind" highlight (Mohammad approved it in the 19 Nov mocks), but draw it as 2D draws a pick: a ring 4 device px
outside the outline in the ring colour, and the lumen ×1.12. Hover (Mac): 2D's lumen ×1.18 + 0.04, easing out toward joined ends over a third of
the vessel (at most 60 units) so it never stops in a hard line. Nothing else dims.

---

## 4. Organs

### 4.1 Shape
The organs thread's pillows (`art/organs-simple/build.py`: 2D outlines inflated, half-thickness 0.05 to 0.18) are the right idea. Keep the
silhouettes exactly 2D's. Changes:
- **Bowel and colon relief is too deep.** IMG_5630/5633: the small bowel's loops are embossed into deep grooves and, with three bands of world
  light, read as a brain. 2D draws the loops as tube strokes mixed to near-solid tones (`.ob-*`: `o1` 40 to 64 % toward `o2`/`o3`), so the pile reads
  as one soft mass with fine creases. Do the same: flatten the loop relief to about a third, smooth the normals, and draw the creases as the 0.84 px
  `--og-gut-3` line at .42 (decal or vertex attribute), not as geometry.
- **Liver nodules** (cirrhosis): 2D lays `org-lobules` at 28 % "in the surface, not on it". The 3D vertex paint (`organs/vertex-paint.ts`) is at
  full strength and on a regular grid: halve it, jitter the cell centres, and fade it out under 3 device px per nodule (zoomed out it should be a faint tooth, not a grid).
- **Heart and RA**: 2D draws the RA with a faint line (.35) and no inner shade of its own. Copy.
- **Kidney**: its own plum (`--og-kidney-*`), layer .85 (Soft .88), outline 1.4 px at .95: 2D's one organ that is meant to stand out.
- **Duodenum, oesophagus, stomach seam**: 2D fades the duodenum into the head of the pancreas (`duFade`) and the oesophagus upward (`esoFadeG`). Copy both as alpha ramps in the organ shader.

### 4.2 How they recede
- Shading per 2.5, colour per 2.3, layer per 2.6. No ink hull on organs at all: the silhouette line comes from the organ shader's own edge
  (`fwidth` on `ndv` near 0) in `--og-*-3`, so it is the organ's colour, partly transparent, and costs no extra draw. This also halves the
  organ draw calls.
- Disease states (dusk, cirrhosis, infarct, bleed, lens grey) already live in `organ-look.ts`: they now act on the copied three tones and on the layer opacity, as 2D's `organ-dim.js` does (saturation .12, opacity .72 for a lens other than Pressure).

---

## 5. Lobule, neighbours and sinusoid

### 5.1 Recommendation: 2.5D
The 2D lobule is a histology plate; its beauty is flatness, fine lines and colour. Every ugly thing in IMG_5636 to 5640 comes from making
it 3D: extruded cells show their side walls, the central vein is a 6-sided prism, the sinusoids are 6-sided tubes with an outline each, the
Disse lymph is a second tube twisted round each sinusoid (the "rope"), and the field is dithered.

So:
- **Camera:** orthographic, straight down the lobule's axis, in both Lobule and Sinusoid (the dive in WP8 is the only perspective moment).
- **Tissue:** one plane, painted. Port `paintLobule` (`lobule-paint.js`) to a fragment shader or, faster to land, run 2D's recorder
  (`paint-gl.js` draws the 2D context calls on the GPU) into a texture once per state change, mip-mapped, on a plane. 2D already caches it
  ("drawn once into a cached canvas, never per frame"); do the same. Cells as 2D draws them, not instanced boxes.
- **Vessels:** the anatomy's vessel renderer (after WP2/WP3), flat-shaded in screen space, on the plane at +ε: sinusoids, inlet venules,
  portal venule, central vein, arterioles, ductules. The central vein and the venule are discs cut across, drawn as 2D's `celDisc` (ring band,
  wall line opened where vessels join) on a quad, not a cylinder. The lens colours and chevrons come for free.
- **Disse and lymph:** a flat pale-green band under each sinusoid (2D: stroke `2r + 2 + 3.5 fibSin`), no outline, no second tube.

### 5.2 Neighbours (the out-of-focus field)
One full-screen procedural shader, under the lobule plane:

```
 hex SDF field, same spacing as the lobule view (lobule R)          ┌─────────── screen ───────────┐
 lines: septa as the 2D field tile draws them, not black            │ ░░▒▒▒▒▒▒░░  faded 50 % max   │
 colour: tissue tone, contrast −30 % (NEIGHBOUR_FLAT)                │ ▒▒▓▓▓▓▓▓▒▒  ring 1: sharp    │
 fade toward --bg: 0 inside 1.1 R, 72 % at mid, 100 % at 3.2 R       │ ▒▓▓[LOB]▓▓▒  the lobule      │
   but never more than 50 % at any screen edge (EDGE_FADE)           │ ▒▒▓▓▓▓▓▓▒▒                   │
 blur: AA width grows with distance from 2.4 rd to 10 rd (fieldDof)  │ ░░▒▒▒▒▒▒░░                   │
                                                                     └──────────────────────────────┘
```
Blur is free in an SDF shader: widen the smoothstep of every edge with distance (that *is* depth of field for flat line art). Per-tile detail
follows 2D's `FIELD_RS` octaves: dots for veins on small tiles, sinusoid hints on big ones, crossfaded by `fieldBlend`. No dither anywhere.
State (fibrosis, septa, congestion, capillarized sinusoids) comes from the same model values as 2D's field (`lobule-zoom-field.js`), quantized as 2D does (`fsQ`).

### 5.3 Sinusoid
Lift `sinusoid-gl.js`'s fragment shader (it is GLSL ES 3.00 already, built for one GPU context) into a `ShaderMaterial` on a screen-filling
quad in the sinusoid view, with the same uniforms (`SLOT`, `SEED`, `UM`, `CELL`), and its albumin sprite pass. Keep 2D's JS that places the
traffic (`sinusoid-view.js`, `poreAt`, `cellAtInto`) so pores, labels and particles agree. Copy by script (`scripts/copy-sinusoid.mjs`), never retype.
The 3D adds only the dive into it (WP8). Acceptance: the screen is tissue to every edge on every device; on Light, never black.

### 5.4 Layout specs (both views)

| | iPhone portrait | iPhone landscape (wallet) | iPad / Mac |
|---|---|---|---|
| Lobule | lobule's flat-to-flat = 86 % of the free room's width; centre at the room's centre | lobule fits the room's height at 90 % | lobule fits the room's short side at 78 %, so ring 1 of neighbours shows |
| Portal tract orientation | as 2D: one tract at the left vertex | same | same |
| Sinusoid | flow left to right in landscape, **top to bottom in portrait** (2D does this: "left, or top on a portrait screen") | left to right | left to right |
| Sinusoid scale | the lumen = 18 % of the short side; plates fill the rest | same | 14 % |
| Scale cue | a 1 px scale bar at the bottom left: "100 µm" (lobule), "10 µm" (sinusoid), in `--text-3` | same | same |

---

## 6. Camera and framing

- **Perspective vs orthographic.** Anatomy: perspective with a long lens (FOV 12 to 15°, today 30°); at rest it is near enough orthographic
  that the 2D plate lines up, and a turn still shows depth. Lobule and Sinusoid: orthographic. Dive: perspective, with the FOV widening to 35°
  during the plunge and back (the classic "dolly zoom" makes a dive feel like going *into* something).
- **Rest shots.** `title`, `play`, `pick`: yaw 0, pitch 0 (today 0.18 to 0.32 yaw). The HVPG route shots may keep a small yaw (−0.14 to −0.3)
  because they look past the liver at the hepatic veins; check each against 2D's framing on the look board.
- **Orbit.** Drag orbits within ±25° (kept), and **springs back to the shot** 1.2 s after the hand lifts (critically damped). The atlas is
  the rest state; 3D is the reward for touching.
- **Tier depth.** With a long lens, the tiers (z −0.32 to 0.54) can stay; parallax at ±25° is then honest depth, not misregistration.
- **Per device.** The room solver is right; add a minimum on-screen width for the figure per device (iPhone portrait: the liver's width ≥ 52 % of the screen in `play`).
- **Transitions.** Anatomy ↔ Circuit is the morph (B7). Anatomy → Lobule → Sinusoid is the dive (WP8). Any other change is a straight 950 ms cut-free move (kept).

---

## 7. Labels and callouts against depth

- **Anchor on the real courses.** `labels/stations.ts` builds its curves from `anatomy/vessels.ts` (placeholder courses, old coordinates).
  Read `vessels/network.ts` `courseOf(id)` (and the run-on smoothed path) instead, and give each node its own tier's z, not `TIER_Z.front`.
  Likely root cause of "Lower IVC 5.7" on the SMV in IMG_5630/5631/5635. Test: for every station, the projected dot lies within the vessel's
  projected radius + 2 px at the rest shots.
- **Delete the placeholder anatomy** (`anatomy/placeholder.ts`, the placeholder vessel courses) once nothing reads them, as the handoff asked; add a test that nothing imports them.
- **Constant size**, never scaled by depth. During a camera move: fade out, back in 180 ms after landing (kept from the spec).
- **Back-tier labels** (IVC, azygos): the dot sits on the veiled vessel; draw the dot at full opacity with a hairline leader so it is clear the label belongs to the faint vessel.
- **Organ names**: 2D's `nameSpots` (done in `e53a61c`); when orbiting, follow the organ's front-face centroid, not the 2D point.
- **Lobule labels** (B6): tract and zone captions as 2D (`lobule-tract-labels.js`, `lobule-zoom-labels.js`), placed in plane coordinates; they never sit over the central vein.

---

## 8. Rendering tech

### 8.1 GPU and iOS robustness (the vessel-killing bug class)
The `7e3a295` screenshot lost every vessel to one compile error (a redeclared attribute). The test added then (`tests/shader-redefinition.test.ts`) checks text. Add three more layers:

1. **Compile the real shader text in node, no browser.** Assemble each `ShaderMaterial`'s final source exactly as three's `WebGLProgram` does
   (three's prefix for `ShaderMaterial`: `#version 300 es`, precision, the built-in attributes `position`, `normal`, `uv` and uniforms, then the
   `attribute`→`in` defines) and run it through **glslang** (`glslangValidator`, the Khronos reference compiler; `apt-get install glslang-tools`,
   no browser, seconds). One test per program: vessel, veil, organ, ink, lobule, sinusoid, circuit, charts. This catches redeclarations, type errors and missing precision.
2. **Compile on the device.** A `?gl` page (debug thread) that builds every program the app can use, calls `renderer.compile` on a hidden scene,
   reads `gl.getProgramParameter(LINK_STATUS)` and `getShaderInfoLog`, and shows one line per program, green or red, with the driver's log and
   Copy. Mohammad opens it once per build on iPhone, iPad and Mac: about 20 seconds for a real-GPU answer, no Actions, no headless.
3. **Fail loud, not invisible.** Set `renderer.debug.onShaderError` to swap the failing material for a plain flat one in the vessel's lens
   colour and put a red pill in the `?perf` bar ("vessel shader failed: 1"), and send it with the debug packet. A broken shader then looks
   plain, not missing.

### 8.2 iPhone performance (only what the look needs)
- **Pixel ratio**: cap at 2 on phones (3x screens gain nothing for flat art at this line width) and 2 on iPad and Mac. Today `figureDpr` caps at Figure detail (default 1.5): fine; make "Sharp" 2, never 3.
- **MSAA**: `antialias: true` at dpr 2 costs 4x samples on every pass. With WP2 the lines are AA'd in the shader (`fwidth`) and tones are 1 px soft; turn MSAA off when dpr ≥ 2, on at dpr 1. Check on the device: the hull's silhouette edge is the only geometric edge left un-AA'd.
- **Outlines**: the hull is the right technique for iPhone (no extra full-screen pass). A screen-space edge pass (depth + id) is Mac/iPad only and later.
- **Draw calls**: organs drop their ink (−9 draws); the lobule becomes a plane + vessels (from hundreds of instanced cells to a few draws); the field is one quad.
- **Overdraw**: no transparent `DoubleSide` anywhere in the vessel or organ passes (the veil fix). The lobule's dithered fade goes.
- **Warm-up**: `renderer.compileAsync` (parallel compile, `KHR_parallel_shader_compile`) for the lobule and sinusoid programs while the user is in Anatomy, so the dive never stalls.

### 8.3 Visual regression on the Mac only (the look board)
No cloud headless and no Actions minutes, so do it in his browser, where the GPU is real:
- A `?look` route lists fixed states (preset × view × look × device size × camera shot; about 40 to start), each from the app's own state link.
  It steps through them, waits for the clock to settle, and grabs the canvas (`canvas.toBlob` right after `render` in that frame, so no `preserveDrawingBuffer`).
- With `?look&with2d`, it opens the 2D preview of the same preset at the same frame in a second pane (same origin on `qaddodi.github.io`), so each
  row is 2D | 3D | difference. With the camera face on and the long lens (WP4), the anatomy plates line up and a difference image means something.
- Saving: on the Mac, `npm run look:serve` runs Vite plus a tiny POST endpoint that writes the PNGs to `look/<commit>/`; `npm run look:diff` (node, `pixelmatch`) compares with `look/baseline/` and writes one HTML contact sheet. He drives it from the Claude desktop browser through Remote Control; nothing runs in the cloud.
- The page doubles as the art review: the art director (or Mohammad) scrolls one page of 40 pairs and writes the notes.

---

## 9. Polish

| Area | What to do |
|---|---|
| AA | Shader-side AA everywhere (`fwidth`, one device px). The hull's outer silhouette is the one geometric edge left: once MSAA is off at dpr 2, push the hull out 0.5 device px more and fade its outermost half (pass the hull's own across-coordinate as a varying), so the outline's outer edge is soft too. |
| Line quality | Outline width by radius (2.4) is the single biggest quality jump. Check 45° vessels on iPhone for stair steps once MSAA is off. |
| Motion easing | One curve family (kept): in-out cubic for camera, out (0.2, 0.7, 0.2, 1) for cards. Lens crossfade 420 ms (kept). Organ state eases from 2D's `organ-ease.js`. Orbit spring-back critically damped, no overshoot. |
| Loading | The organ file (1.4 MB) arrives after the vessels: today the figure pops organs in. Fade the organ layer from 0 to its opacity over 420 ms when it arrives, and draw the plate silhouette (one flat shape from the 2D outlines, a few KB) until then. Never show vessels floating in space. |
| Empty states | A view with nothing to show (a lens with no data, a removed spleen) shows 2D's ghost/caption, never a blank area. Lobule and sinusoid never show the black clear colour on Light. |
| Reduced motion | Dive becomes a 300 ms crossfade between views, orbit spring-back is instant, chevrons stop (2D's rule), lens crossfade instant. |
| First frame | Already only after the first shot is placed (kept). Add: the clear colour is `--bg` from the first frame, not black (IMG_5639's black band). |
| Dark looks | `rimInk` on dark lumens; organ edges light; casing .3. Check every Dark shot on the look board. |
| Colour blindness | Pressure is the ramp plus the number; reversed flow is orange **and** the double head (2D B2). Keep both. |
| Orientation cue | A small "R" at the figure's left edge (patient's right), `--text-3`, as atlases do; hides on the iPhone wallet. Optional; ask. |

---

## 10. Work packages

Ordered by visual impact. Each can be a thread. "Owns" lists the files it may edit; two packages that share a file are marked and must run one after the other or in one thread.

| WP | Title | Owns (files) | Depends on | Acceptance (on the look board and the devices) | Model |
|---|---|---|---|---|---|
| **1** | **Organs as 2D's wash** | new `scripts/copy-organ-tones.mjs`, `src/looks/organ-tones.copied.ts`, `src/looks/looks.ts`, `src/scene/palette.ts`, `src/scene/organs/layer.ts`, `organ-look.ts`, `vertex-paint.ts`, new `src/scene/organs/organ-shader.ts`, `art/organs-simple/build.py` (bbox, loop relief) | none | Face-on Light, Soft, Dark: organ fill centres within ΔE 6 of the 2D table in §1; no organ darker than the 10 mmHg vessel on Light; organ silhouette in `--og-*-3`, no black; bowel reads as one soft mass; liver nodules faint. Test: tones equal 2D's tokens (`PPS_2D_REPO` check), and the copy script's `--check`. | Opus (organ artist rule: low) |
| **2** | **Vessel ink and shading as 2D's** | `src/scene/vessels/shaders.ts`, `vessel-object.ts`, `src/scene/scene.ts` (px line only), `palette.ts` (casing tokens) | WP1's copied tokens (or read casing from the 2D copy now) | Outline width = clamp(0.14 R, 1.5, 3) device px at casing alpha in every look (unit test on the JS twin of the shader math, as 2D's `celShadeJS`); three screen-space tones, no specular; thin strands never black; Dark `rimInk`. | Sonnet high |
| **3** | **Joins and the veil** | `src/scene/vessels/tubes.ts`, `network.ts` (free-end list), `vessel-object.ts` (veil, groups), `scene.ts` `render()` | after WP2 (same files) | No ring, collar or ball at any join at 1x to 6x zoom on iPhone; the cava a clean faint tube, no ball joints; free ends round; hepatic vein ends not bulbous. Tests: caps only at free ends; the veil material is FrontSide with the stencil. | Sonnet high |
| **4** | **Atlas camera and true label anchors** | `src/scene/camera/shots.ts`, `rig.ts`, `room.ts`, `gesture/controller.ts` (spring-back), `src/scene/labels/stations.ts`, remove `anatomy/placeholder.ts` and placeholder courses | none | Rest shots face on, FOV 14°: the figure overlays 2D's within 6 px on the look board; every station's dot on its vessel (test above); orbit springs back. | Sonnet high |
| **5** | **Lobule as a plate** | `src/scene/lobule/*` (except the field), new `scripts/copy-lobule.mjs` | WP2/3 for the vessel look (can start on tissue first) | Orthographic; no side walls anywhere; cells, membranes and nuclei as 2D (`paintLobule` numbers); central vein and venule as 2D discs; Disse a flat band; every 2D layer (zones, lymph, bile, stellate, collagen, nutmeg) present. | Opus high (artist judgment) |
| **6** | **The out-of-focus field** | new `src/scene/lobule/field.ts` (+ its shader), the field lines in `view.ts` | none (coordinate the one line in `view.ts` with WP5) | One draw; no dither dots; fade and blur by 2D's constants (`lobule-look.js`); edges never more than 50 % faded; state follows fibrosis and cirrhosis. Unit tests on `fadeAt`/`fieldDof` twins. | Sonnet high |
| **7** | **The sinusoid, lifted** | `src/scene/sinusoid/*`, new `scripts/copy-sinusoid.mjs` | none | 2D's shader drawn in 3D, full screen, every device; portrait runs top to bottom; pores, albumin and labels agree; `--check` proves the copy current. | Sonnet high |
| **8** | **The dive** | `src/scene/scene.ts` (view switch), `camera/rig.ts` (dive path, FOV), `lobule/view.ts` and `sinusoid/view.ts` entry hooks, organ shader's cutaway uniform | after 4, 5, 6, 7 | Anatomy → Lobule: 1.6 s; the liver's wash opens in a soft window round the dive point (0 to 0.5 s), the camera plunges with FOV 14→35→ortho (0.3 to 1.3 s), the field resolves from blur (1.0 to 1.6 s). Lobule → Sinusoid: 1.1 s, the chosen sinusoid grows to fill, plates arrive from the middle out (2D's order). Reverse plays backward. Never two views overlaid mid-state at rest (IMG_5638). | Opus high |
| **9** | **Varices, strands, cavernoma** | `src/scene/disease/strands.ts`, `vessels/coil.ts`, `vessels/cav.ts`, `vessels/shape-track.ts` | after WP2/3 (uses their ink rule and draw order) | Esophageal and fundal varices read as a bundle of pressure-coloured channels with one outline round the bundle (hulls first, bodies after, per bundle); no black spindle in any look; red wale visible. | Sonnet high |
| **10** | **GPU robustness and the phone budget** | `tests/glsl-compile.test.ts` (glslang), new `src/debug/gl-check.tsx` (`?gl`), `src/scene/Stage.tsx` (`onShaderError`, MSAA by dpr), `quality.ts` | none | Every program compiles in glslang in `npm test`; `?gl` green on iPhone, iPad, Mac; a forced bad shader shows a plain vessel and a red pill, not nothing; dpr ≤ 2, MSAA off at 2. | Sonnet high |
| **11** | **The Mac look board** | new `src/debug/look-board.tsx` (`?look`), `scripts/look-serve.mjs`, `scripts/look-diff.mjs`, `look/README.md` | WP4 for 2D overlay alignment (works without it) | 40 states captured on the Mac in under 3 minutes; HTML contact sheet 2D | 3D | diff; baseline per commit; nothing in the cloud. | Sonnet high |
| **12** | **Finish** | small edits across views, owned per item (coordinate) | after 1 to 9 | §9 table, item by item, checked on the board and the devices. | Sonnet high |
| **13** | **Circuit clean-up** | `src/scene/circuit/*`, `scene.ts stepCircuit` (strands' fade) | none | No black varix blobs in the Circuit (IMG_5635: likely the disease strands are not in the circuit fade; verify); lines and bands at 2D's weights. | Sonnet high |

**Parallel lanes** (no two threads on one file):
- Lane A, the anatomy look: WP1 ‖ WP4 ‖ (WP2 → WP3 → WP9).
- Lane B, the micro views: WP5 ‖ WP6 ‖ WP7, then WP8.
- Lane C, infrastructure: WP10 ‖ WP11 ‖ WP13.
- WP12 last.

Start WP1, WP2, WP4, WP5, WP7, WP10 now: they share no files and fix the six worst things in the screenshots.

---

## 11. Things nobody asked about, that will matter

- **One source of truth for the look.** `docs/look-and-feel.md` §2 to §4 contradict 2D (opaque organs, fixed ink, two-band vessels with specular). Rewrite those sections from this plan once Mohammad decides A to C, so no thread reintroduces them.
- **Copy scripts for everything visual.** Organ tones, casing, lobule and sinusoid tokens, the lobule painter, the sinusoid shader: each by script with `--check`, as the decks and B3 data already are. Hand-typed hexes (`lobule/tones.ts CELL_BASE`) drift.
- **Presenter and projector.** Dark and Navy are the projector looks; check line weights at 1080p on a projector-sized window (the Mac at 1920 × 1080, dpr 1, MSAA on).
- **Print and export.** An atlas gets screenshotted into slides. A "Copy figure" that renders the canvas at 2x with the labels drawn in (the look board's capture code gives this nearly free).
- **Pressure is the hero colour, so other lenses must keep the hierarchy.** On Flow, Velocity, Heat and Drop, organs go grey (2D's `LENS_GREY`): make sure the 3D wash greys too, or the warm organs fight the cool ramps.
- **Reversed-flow vessels** must stay legible on the warm organ wash (orange heads on a magenta lumen over salmon): check on Light with the look board.
- **Thin vessels at whole-figure zoom on iPhone**: arterioles and sinusoid strands under 1.5 device px go to a hairline in fill colour with no outline (2D's rule: "left out on hairlines").
- **Battery**: nothing draws when nothing moves (kept). The spring-back and the chevrons are the only idle motion; chevrons run only on named vessels (option A, kept).
- **Accessibility**: text over the figure keeps 2D's halo; with lighter organs the halo can be thinner. Check 4.5:1 for label text over the liver wash on every look.
- **Artist hand-off**: if a medical artist ever replaces the pillows, the contract is the 2D silhouette from the front, a gentle pillow, and the organ shader of §2.5; no textures, no baked lighting.

---

## 12. Sketch: the anatomy at rest after WP1 to WP4 (Light)

```
  page #F1EBE0 ─────────────────────────────────────────────────────────────
                         ┌─RA─┐ (pale rose, faint line)
              RHV 5.1 ── │    │══ IVC (blue, crisp)
        ┌──────────────── liver (pale salmon wash, sepia hairline) ──────┐
        │   ╲══ hepatic veins, light blue, 3 soft tones, thin casing      │   stomach (paler wash)
        │    ══ portal tree, magenta, chevrons on named vessels           │      spleen (lilac wash)
        │  ░░ cava behind, faint, half casing ░░                          │
        └──────────────────────────────── PV 17.6 ──────────────────────┘
                 SMV ║ (magenta)          bowel: one soft mass, fine creases, 66 %
```
Same plate as 2D, same numbers, same weights; the difference is that it turns when touched and dives when asked.
