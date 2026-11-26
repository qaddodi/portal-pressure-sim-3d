// The sinusoid's shape follows the state ON THE GPU (code review 21 Nov, the dive's stalls: Ascites stop 9 switches to right heart failure with the camera on the sinusoid, and every 1/64 step of the
// lumen, its pinch or the collagen remeshed about 830k triangles inside one frame, 400 to 676 ms).
//
// Every vertex of the shapes is a function of its own place (x, the angle, the layer) and of TWO numbers at that x: the lumen's half width H(x) and the space of Disse's width D(x) (sinusoid/traffic.copied.js
// createGeom: H = UM.lum * lum * (1 - pinch * exp(-((x - xs) / 11)^2)) + 0.15 sin(0.11 x + 1.3), D = UM.disse * (1 + 0.25 col) + 0.2 sin(0.07 x)). The shapes are built ONCE, at the REST state (lum 1, pinch 0,
// col 0), and again with H and D each moved by one micrometre, so each vertex carries how it moves with each (`dH`, `dD`, and a second-order `dH2` for the wall's shell, whose columns are laid at equal arc length
// down an ellipse that scales with H). The vertex shader then moves it by the DIFFERENCE between the state's H and D and the rest's, from four numbers. Nothing is rebuilt on the CPU when the lumen, the pinch or
// the collagen ease: they ease, as everything does. tests/sinusoid-shape.test.ts holds the shader's move to a full rebuild at the same state.
import { Vector4 } from 'three';
import { UM } from '../sinusoid/layout.ts';

/** The state the shapes are built at: the host's REST (sinusoid/view.ts): lumen 1, pinch 0, collagen 0. */
export const REST_SHAPE = { lum: 1, pinch: 0, col: 0 } as const;
/** The lumen's half width and the space of Disse's width at the rest state. */
export const restHalfW = (x: number): number => UM.lum + 0.15 * Math.sin(x * 0.11 + 1.3);
export const restDisseW = (x: number): number => UM.disse + 0.2 * Math.sin(x * 0.07);

/** Where H is moved to for the samples the shell's polynomial of the fifth degree is fitted through (the app's lumen and pinch reach about -2 to +4.5 µm from the rest's); the other parts are linear in H. */
export const SHAPE_NODES: readonly number[] = [-2, -0.7, 1.1, 3, 5];
/** The inverse of the Vandermonde matrix of the nodes (rows: the powers 1 to 4 of H, columns: the samples), so a vertex's coefficients are `inv` times its samples' moves from the rest. */
export function shapeInverse(): number[][] {
  const n = SHAPE_NODES.length, a = SHAPE_NODES.map((x) => [...Array.from({ length: n }, (_, j) => x ** (j + 1)), ...Array.from({ length: n }, (_, j) => (j === SHAPE_NODES.indexOf(x) ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
    [a[c], a[piv]] = [a[piv]!, a[c]!];
    const d = a[c]![c]!; for (let j = 0; j < 2 * n; j++) a[c]![j]! /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r]![c]!; for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[c]![j]!; }
  }
  return a.map((row) => row.slice(n));
}

/** The slope of the H ramp the anchors are read from (µm of H per µm of x): a part whose vertex moves with H at ANOTHER x than its own (a nucleus's ellipsoid sits on the plate's height at its centre; a cell's bevel is
 *  inset from the outline point whose height it follows) is built once more with H = rest + 1 + RAMP x, and each vertex's anchor is the x its move says it follows. */
export const SHAPE_RAMP = 0.004;

/** One uniform for a scene's shaped parts: (lumen, pinch, collagen, the pinch's place xs). */
export const shapeUniform = (): { value: Vector4 } => ({ value: new Vector4(REST_SHAPE.lum, REST_SHAPE.pinch, REST_SHAPE.col, 0) });

export const SHAPE_VS_DECL = /* glsl */ `
#ifdef SHAPE
// (the sinusoid's shape on the GPU, micro3d/sinusoid-shape.ts: dH, dD = how this vertex moves with a micrometre more lumen half width and Disse width, dH2 its second order; uShape = lumen, pinch, collagen, xs)
attribute vec3 dH;
attribute vec3 dD;
#ifdef SHAPE2
attribute vec3 dH2;
attribute vec3 dH3;
attribute vec3 dH4;
attribute vec3 dH5;
#endif
#ifdef SHAPE_AX
attribute float ax;   // (the x whose lumen width this vertex follows, when it is not its own)
#endif
uniform vec4 uShape;
#endif
`;
export const SHAPE_VS_APPLY = /* glsl */ `
#ifdef SHAPE
  {
#ifdef SHAPE_AX
    float sx = ax;
#else
    float sx = position.x;
#endif
    float gx = (sx - uShape.w) / 11.0;
    float sdh = ${UM.lum.toFixed(1)} * (uShape.x * (1.0 - uShape.y * exp(-gx * gx)) - 1.0);
    float sdd = ${(UM.disse * 0.25).toFixed(4)} * uShape.z;
    p += dH * sdh + dD * sdd;
#ifdef SHAPE2
    p += dH2 * (sdh * sdh) + dH3 * (sdh * sdh * sdh) + dH4 * (sdh * sdh * sdh * sdh) + dH5 * (sdh * sdh * sdh * sdh * sdh);
#endif
  }
#endif
`;
