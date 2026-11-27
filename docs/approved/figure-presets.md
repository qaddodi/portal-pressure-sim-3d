# Figure presets: Cool, Balanced, Rich (review R6)

Status: **feature approved by Mohammad, 25 Nov 2026** (item 9, "Do: 3,9,11,12,13"; the review's R6: "Settings down to Cool, Balanced, Rich"). **The look below is the one the code draws; he has not seen it yet** (pushed, not yet seen). Say if he wants another look and change this sheet with it.

## The look
- Settings, Display group: a title **Figure**, then one raised three-part control, **Cool · Balanced · Rich** (the same `.seg.full.menu-seg` the old Figure detail steps used, so no new control look), the chosen one raised and heavier. Under it one plain line saying what the chosen preset does; the four lines (three presets and Custom) share one grid cell and cross-fade, so the sheet never changes height or snaps. Then one row, **More**, that opens a page of the individual switches. Keyboard shortcuts stay in Display after it.
- **Custom:** no part of the control is raised and the line reads "Your own mix, set under More." A preset is stored nowhere: it is read back by comparing the nine switches, so changing one under More reads as Custom, and any preset can be picked again from Custom.
- **More** (page title "Figure, switch by switch", back to Settings): a line saying where the switches stand now, then Display (Blur effect, the Figure detail steps, Auto detail, Sharp while moving) and Figure depth (3D only: Organ depth, Gentle tilt, Depth of field, Living fluid, Device shadows), exactly the rows the sheet showed before.
- **Room for the Lite figure switch** (item 3, another thread): its row goes first in the Display group, above the Figure title; the presets stay directly under it.

## What each preset sets (`src/state/figure-presets.ts`, nine switches)
| | Blur | Figure detail | Auto detail | Sharp while moving | Organ depth, Tilt, Depth of field, Living fluid, Device shadows |
|---|---|---|---|---|---|
| **Cool** | off | Soft (1x) | on | off | off |
| **Balanced** | on | Standard (1.5x) | on | on | on |
| **Rich** | on | Sharp (2x) | off (held) | on | on |

- **Cool is the low-cost end** that lines up with the heat work: nothing the flat figure can do without is asked of the GPU, and it draws at 1x even in a gesture. Auto detail stays on, so it can still go lower on a slow device.
- **Balanced is what the app starts with**, so nobody's picture changes today; a device on its defaults reads Balanced.
- **Rich** holds the sharpest picture with every effect on; it runs warmest.
- A preset never touches the look, Keyboard shortcuts or Diagnostics. Reset everything returns to Balanced.

Bounds: `tests/figure-presets.test.ts`, `tests/depth-settings.test.ts`, `tests/detail-governor.test.ts`.
