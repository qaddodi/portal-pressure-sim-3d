# Share card (og:image)

Approved 28 Nov 2026 by Mohammad: pick "A: Light, mark left" of three mocks (production review P-17).

- Reference picture: `public/brand/og.png` (1200 x 630), drawn from the app's own tokens and fonts: the Light ground (#F1EBE0), the app mark at the left in its dark tile, "Portal Pressure / Simulator 3D" in Source Serif 4 semibold, and the page's description in Inter beneath.
- Rejected: B (Light, everything centred) and C (Dark ground, large name, small mark).
- Served at `/brand/og.png` and named by `og:image` with a full address; never part of an install (`scripts/pwa.mjs`). When the domain moves (P-32), update the address in `index.html`.
