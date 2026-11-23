# Ultrasound probe (23 Nov 2026)

Reference: mock "1A" in `/mnt/project-files/us-probe-mocks/option1-variants/` (contact sheet and 4x close-ups, Light and Dark). Picked by Mohammad, 23 Nov: "Just build 1A". Built from `src/scene/devices/probes/probe-shape.ts`; the app twin next to the mock is `/mnt/project-files/us-probe-mocks/built-1a/1a-mock-vs-app-twin-4x.png`.

Complaint it answered: "The US probe could look better."

Traits (the classic curvilinear probe; keep every one):
- Convex face: a round dome, 25 px footprint, edge 4.5 px behind the apex. Head 26.6 px wide at its fullest, a shoulder, a waist (14.6 px), a grip, a rubber boot tapering to 7.8 px. 54 px long, drawn at PROBE.SCALE 1.35 (73 px on screen).
- Cream shell (Light, Soft) or pale shell (Dark, Navy, Black), colours authored as drawn (`raw`), never greyed by the vessels' caps.
- Lens band on the face (navy, deeper on the dark looks) with an inked seam at its end (1.4 px, the head's ink).
- Flush accent ring (the look's own accent) at x 21.4 to 24.4 and a grey rubber boot from x 42.2, both with soft hairline seams (0.9 px).
- Status bead on the grip, in the look's accent, with the head's ink line.
- Short cable out of the boot that fades to nothing (never cut off).
- Two flat tones with one hard step from the upper-left world light, the head's white line (black on the dark looks) on the 4 px rim of the opposite colour, so it reads on every vessel.
- Unchanged: placement, the sample volume bars, the sight line, the flow axis, the narrow beam, the eases.

Rejected options (same sheets): graphite slim, pebble, paddle with a curvilinear fan, ergonomic bend, and the variants 1B (white and teal), 1C (warm grey, black lens), 1D (wide curve), 1E (slim, long grip), 1F (compact).

Tests: `tests/probe-shape.test.ts` (outline, bands, seams, room), `tests/device-edges.test.ts` (colours, edges, rim, raw tones, tail fade).

Open: the cable bends to one side of the probe's axis in the probe's own frame, so it mirrors when the probe stands on the other side of a vessel; the head is 1.3 px wider than the layout search's HALF (17.5) and the cable reaches the search's LEN (84), both left as they are because placement is not part of this change.
