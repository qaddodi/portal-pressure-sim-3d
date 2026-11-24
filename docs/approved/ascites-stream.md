# Ascites stream (24 Nov 2026)

Approved look: **mock B, "thin tapered stream with a soft ripple"** (`/mnt/project-files/ascites-slide13-24nov/stream-mock-A-B.png`, right panel). Mohammad picked it ("2") on 24 Nov.
Complaint it answers: slide 13 ("Give albumin with a paracentesis of >5 L") showed the needle and drain line but no fluid leaving.

Traits (keep every one):
- An amber core runs inside the drain line (the line's own pale tube stays), tone `latex` (#DDB262 on Light), no outline.
- A thin stream falls from the drain line's tip, tapering as it falls (`FLUID` in `src/scene/devices/paracentesis.ts`: radius 2.4 at the tip to 1.1 at the foot, 100 units long), a lighter lit side from the tube tones.
- A flat ripple ellipse (half width 15, half height 2.7, thin line) where it lands. Soft, no glow, no drops.
- It flows while the model drains: it comes in as the drain begins (the procedure's `apply` time), the stream reaches down over the first 0.6 s, and it goes 0.5 s after the drain ends (`paracentesisFluidAt`, `DRAIN_MS` = the engine morph's length).
- It fades with the needle (never pops).

Rejected: A (drops falling and fading from the line's tip).
Tests: `tests/paracentesis-stream.test.ts`.
