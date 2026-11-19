"""Stage 1 anatomy: landmarks, vessel centrelines and organ shapes (signed distance fields).

Pure numpy, no Blender. Everything here is in the AUTHORING frame "V", metres, real adult size:
  x = patient's LEFT, y = ANTERIOR, z = SUPERIOR (cranial)
  origin: x = midline, y = anterior surface of the vertebral bodies, z = centre of L1.
This frame is left-handed; build_stage1.py maps it to Blender (x, -y, z) and the glTF export maps that to
(x, z, y) with the origin moved to the portal confluence (CONF).

Vertebral levels (approximate, used to place things): T8 +0.15, T9 +0.12, T10 +0.09, T11 +0.06, T12 +0.03,
L1 0.00, L2 -0.03, L3 -0.065, L4 -0.10, L5 -0.13.
"""
import numpy as np

# ----------------------------------------------------------------------------------------------------------
# small vector helpers
# ----------------------------------------------------------------------------------------------------------

def v(*a):
    return np.array(a, dtype=np.float64)


def unit(a):
    a = np.asarray(a, dtype=np.float64)
    return a / np.linalg.norm(a)


def frame(axis, hint):
    """Orthonormal frame (a, b, c): a along axis, b = hint made orthogonal to a, c = a x b."""
    a = unit(axis)
    b = np.asarray(hint, dtype=np.float64)
    b = unit(b - a * np.dot(a, b))
    c = np.cross(a, b)
    return a, b, c


def catmull(points, radii=None, step=0.004):
    """Centripetal-free uniform Catmull-Rom through points, resampled at ~step metres. Radii interpolate along."""
    P = np.asarray(points, dtype=np.float64)
    R = None if radii is None else np.asarray(radii, dtype=np.float64)
    if len(P) < 3:
        n = max(2, int(np.ceil(np.linalg.norm(P[-1] - P[0]) / step)) + 1)
        t = np.linspace(0, 1, n)[:, None]
        out = P[0] * (1 - t) + P[-1] * t
        rr = None if R is None else (R[0] * (1 - t[:, 0]) + R[-1] * t[:, 0])
        return out, rr
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    rext = None if R is None else np.concatenate([[R[0]], R, [R[-1]]])
    pts, rs = [], []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        seg = np.linalg.norm(p2 - p1)
        n = max(2, int(np.ceil(seg / step)))
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            pts.append(q)
            if rext is not None:
                rs.append(rext[i] * (1 - t) + rext[i + 1] * t)
    pts.append(ext[-2])
    if rext is not None:
        rs.append(rext[-2])
    return np.array(pts), (None if rext is None else np.array(rs))


# ----------------------------------------------------------------------------------------------------------
# signed distance primitives (vectorised over points P of shape (N, 3))
# ----------------------------------------------------------------------------------------------------------
FAR = 0.03  # value given to points far from a primitive (only the zero level and a few mm around it matter)


def sd_ellipsoid(P, c, radii, axes=None):
    q = P - c
    if axes is not None:
        q = q @ np.array(axes).T  # rows of axes are the local unit axes
    r = np.asarray(radii)
    k0 = np.linalg.norm(q / r, axis=1)
    k1 = np.linalg.norm(q / (r * r), axis=1)
    return np.where(k1 > 1e-12, k0 * (k0 - 1.0) / np.maximum(k1, 1e-12), -r.min())


def sd_sphere(P, c, r):
    return np.linalg.norm(P - c, axis=1) - r


def sd_round_cone(P, a, b, r1, r2):
    ba = b - a
    l2 = np.dot(ba, ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    x = pa * l2 - np.outer(y, ba)
    x2 = np.einsum('ij,ij->i', x, x)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d_b = np.sqrt(x2 + z2) * il2 - r2
    d_a = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d_b, np.where(np.sign(y) * a2 * y2 < k, d_a, d_mid))


def sd_chain(P, pts, radii, squash=None, margin=0.02):
    """Union of round cones along a densified polyline. squash=(axis, s) flattens the cross-section along a
    world axis by factor s (e.g. (1, 0.7) makes the tube 0.7x as deep front to back)."""
    pts = np.asarray(pts, dtype=np.float64)
    radii = np.asarray(radii, dtype=np.float64)
    Q = P
    if squash is not None:
        ax, s = squash
        Q = P.copy()
        Q[:, ax] /= s
        pts = pts.copy()
        pts[:, ax] /= s
    d = np.full(len(P), FAR)
    lo_all = Q.min(axis=0)
    hi_all = Q.max(axis=0)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        r = max(radii[i], radii[i + 1]) + margin
        lo = np.minimum(a, b) - r
        hi = np.maximum(a, b) + r
        if np.any(hi < lo_all) or np.any(lo > hi_all):
            continue
        m = np.all((Q >= lo) & (Q <= hi), axis=1)
        if not m.any():
            continue
        if np.linalg.norm(b - a) < 1e-9:
            continue
        di = sd_round_cone(Q[m], a, b, radii[i], radii[i + 1])
        d[m] = np.minimum(d[m], di)
    return d


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def ssub(a, b, k):
    """a minus b, smooth."""
    return smax(a, -b, k)


# ----------------------------------------------------------------------------------------------------------
# landmarks (nodes of the engine topology, V frame)
# ----------------------------------------------------------------------------------------------------------
N = {}
N['CONF'] = v(-0.012, 0.045, -0.005)   # portal confluence, behind the pancreatic neck, L1-L2
N['PVH'] = v(-0.046, 0.049, 0.058)     # portal bifurcation at the hilum (porta hepatis), ~7 cm up and right
N['RPV'] = v(-0.086, 0.042, 0.071)     # right portal vein, where it divides into sectoral branches
N['LPV'] = v(-0.002, 0.088, 0.077)     # left portal vein, umbilical portion at the Rex recess
N['SMV'] = v(-0.004, 0.063, -0.095)    # SMV in the root of the mesentery, in front of D3
N['SV'] = v(0.022, 0.041, 0.008)       # splenic vein where the IMV joins (behind the pancreatic body)
N['SVD'] = v(0.060, 0.026, 0.030)      # splenic vein midway (above the left renal vein: splenorenal shunt site)
N['LGV'] = v(0.030, 0.066, 0.058)      # left gastric vein at the lesser curve, below the cardia
N['IVCI'] = v(-0.024, 0.016, -0.018)   # IVC at the renal veins (L1-L2)
N['IVCS'] = v(-0.020, 0.036, 0.133)    # IVC just below the diaphragm, where the hepatic veins enter
N['RA'] = v(-0.028, 0.050, 0.170)      # right atrium (inside the chamber)
N['SVC'] = v(-0.031, 0.044, 0.292)     # SVC formed by the brachiocephalic veins
N['ILI'] = v(-0.016, 0.007, -0.128)    # iliac confluence (L5, right of midline)
N['AO_CELIAC'] = v(0.012, 0.012, 0.024)  # celiac level on the aorta (T12-L1); the A_HEP start (node AO)
N['HA'] = v(-0.043, 0.062, 0.060)      # proper hepatic artery bifurcation at the hilum

# Organ frames that vessels attach to are defined below; hila are computed from them.

# ----------------------------------------------------------------------------------------------------------
# organs: base shapes
# ----------------------------------------------------------------------------------------------------------

# Kidneys: bean shapes, upper poles medial and posterior, hila facing anteromedially. Left higher than right.
KID = {}
for side, sx, cz in (('left', 1.0, -0.016), ('right', -1.0, -0.032)):
    c = v(0.079 * sx, -0.024, cz)
    a, w, t = frame(v(-0.16 * sx, -0.22, 1.0), v(-0.86 * sx, 0.5, 0.0))   # a: long axis up; w: toward the hilum
    KID[side] = dict(c=c, a=a, w=w, t=t, L=0.055, W=0.027, T=0.019)
    KID[side]['hilum'] = c + w * 0.020


def kidney_sdf(P, side):
    k = KID[side]
    d = sd_ellipsoid(P, k['c'], (k['L'], k['W'], k['T']), (k['a'], k['w'], k['t']))
    d = ssub(d, sd_sphere(P, k['c'] + k['w'] * 0.036, 0.014), 0.006)          # the hilar notch
    return d


# Spleen: long axis along the 10th rib, convex diaphragmatic surface, concave visceral surface facing anteromedially.
SPL_UP = v(0.092, -0.051, 0.112)
SPL_LO = v(0.128, 0.017, 0.032)
SPL_C = 0.5 * (SPL_UP + SPL_LO)
SPL_A, SPL_T, SPL_W = frame(SPL_LO - SPL_UP, v(-0.78, 0.62, 0.05))   # T: toward the visceral (hilar) side
SPL_R = (0.060, 0.022, 0.037)                                          # semi-axes along A, T, W


def spleen_sdf(P):
    d = sd_ellipsoid(P, SPL_C, SPL_R, (SPL_A, SPL_T, SPL_W))
    d = ssub(d, sd_sphere(P, SPL_C + SPL_T * (0.022 + 0.070 - 0.007), 0.070), 0.008)   # visceral concavity
    # two small notches on the superior (anterior) border, the textbook landmark
    for f in (-0.25, 0.15):
        p = SPL_C + SPL_A * (f * 0.06 * 2) + SPL_W * 0.036 + SPL_T * 0.004
        d = ssub(d, sd_sphere(P, p, 0.0055), 0.003)
    return d


N['SPL'] = SPL_C + SPL_T * 0.010          # splenic hilum (just inside the visceral surface)
N['LRV'] = KID['left']['hilum']
N['RRV'] = KID['right']['hilum']

# Esophagus (lower thoracic and abdominal parts) to the cardia
ESO = [v(0.004, 0.006, 0.215), v(0.006, 0.010, 0.170), v(0.011, 0.018, 0.130), v(0.019, 0.028, 0.100),
       v(0.028, 0.039, 0.081), v(0.036, 0.050, 0.068)]
ESO_R = [0.0085, 0.0085, 0.0088, 0.009, 0.0095, 0.011]

# Stomach: J-shaped tube from the cardia, with the fundus as its own ball under the left dome. Flattened front to back.
STO = [v(0.036, 0.050, 0.068), v(0.058, 0.047, 0.080), v(0.078, 0.055, 0.058), v(0.086, 0.070, 0.020),
       v(0.076, 0.088, -0.010), v(0.052, 0.096, -0.029), v(0.022, 0.099, -0.029), v(-0.002, 0.097, -0.018),
       v(-0.016, 0.092, -0.010), v(-0.024, 0.088, -0.004)]
STO_R = [0.020, 0.031, 0.037, 0.038, 0.036, 0.032, 0.028, 0.023, 0.018, 0.012]
FUNDUS_C, FUNDUS_R = v(0.062, 0.039, 0.098), 0.034
STO_SQ = 0.74


def stomach_sdf(P):
    pts, rr = catmull(STO, STO_R, 0.004)
    d = sd_chain(P, pts, rr, squash=(1, STO_SQ))
    q = P.copy(); q[:, 1] = FUNDUS_C[1] + (q[:, 1] - FUNDUS_C[1]) / 0.86
    d = smin(d, sd_sphere(q, FUNDUS_C, FUNDUS_R), 0.018)
    return d


def esophagus_sdf(P):
    pts, rr = catmull(ESO, ESO_R, 0.004)
    return sd_chain(P, pts, rr)


# Duodenum: the C around the pancreatic head (D1 bulb, D2 descending, D3 horizontal in front of IVC and aorta, D4 up to the DJ flexure)
DUO = [v(-0.024, 0.088, -0.004), v(-0.040, 0.077, 0.002), v(-0.056, 0.063, 0.006), v(-0.068, 0.050, 0.000),
       v(-0.073, 0.045, -0.022), v(-0.073, 0.042, -0.046), v(-0.066, 0.040, -0.068), v(-0.046, 0.041, -0.080),
       v(-0.016, 0.043, -0.084), v(0.012, 0.043, -0.079), v(0.028, 0.042, -0.064), v(0.034, 0.046, -0.044)]
DUO_R = [0.012, 0.0145, 0.014, 0.013, 0.0125, 0.0125, 0.0125, 0.012, 0.012, 0.012, 0.012, 0.012]


def duodenum_sdf(P):
    pts, rr = catmull(DUO, DUO_R, 0.004)
    return sd_chain(P, pts, rr)


# Pancreas: head in the duodenal C, uncinate process hooked behind the SMV, neck in front of the confluence,
# body over the aorta and the left kidney, tail to the splenic hilum. Flattened front to back.
PAN = [v(-0.046, 0.052, -0.020), v(-0.030, 0.060, -0.006), v(-0.012, 0.067, 0.003), v(0.012, 0.061, 0.012),
       v(0.040, 0.050, 0.024), v(0.066, 0.036, 0.037), v(0.088, 0.020, 0.050), v(0.100, 0.010, 0.059)]
PAN_R = [0.017, 0.013, 0.0115, 0.013, 0.0135, 0.013, 0.011, 0.008]
PAN_HEAD = (v(-0.045, 0.051, -0.034), (0.017, 0.0125, 0.024))
PAN_UNC = [v(-0.044, 0.043, -0.050), v(-0.026, 0.038, -0.051), v(-0.010, 0.036, -0.047)]
PAN_UNC_R = [0.011, 0.009, 0.0065]


def pancreas_sdf(P):
    pts, rr = catmull(PAN, PAN_R, 0.004)
    d = sd_chain(P, pts, rr, squash=(1, 0.68))
    d = smin(d, sd_ellipsoid(P, PAN_HEAD[0], PAN_HEAD[1]), 0.010)
    pts, rr = catmull(PAN_UNC, PAN_UNC_R, 0.004)
    d = smin(d, sd_chain(P, pts, rr, squash=(1, 0.8)), 0.008)
    return d


# Colon frame: caecum, ascending, hepatic flexure, transverse (sagging, anterior), splenic flexure (higher, more
# posterior, below the spleen), descending, sigmoid, rectum. Haustra as a gentle radius ripple.
COL = [v(-0.072, 0.060, -0.182), v(-0.080, 0.058, -0.160), v(-0.093, 0.050, -0.130), v(-0.102, 0.041, -0.090),
       v(-0.106, 0.038, -0.050), v(-0.106, 0.050, -0.016), v(-0.084, 0.080, -0.040), v(-0.044, 0.098, -0.080),
       v(0.004, 0.106, -0.098), v(0.050, 0.100, -0.092), v(0.088, 0.074, -0.062), v(0.110, 0.044, -0.024),
       v(0.118, 0.026, 0.010), v(0.121, 0.016, -0.030), v(0.119, 0.018, -0.080), v(0.110, 0.028, -0.128),
       v(0.088, 0.045, -0.162), v(0.058, 0.064, -0.182), v(0.024, 0.068, -0.176), v(0.000, 0.056, -0.194),
       v(-0.002, 0.034, -0.214), v(0.000, 0.012, -0.236), v(0.000, 0.000, -0.268), v(0.000, 0.006, -0.300)]
COL_R = [0.027, 0.026, 0.024, 0.022, 0.021, 0.020, 0.019, 0.018, 0.018, 0.018, 0.018, 0.018,
         0.018, 0.017, 0.016, 0.016, 0.015, 0.014, 0.014, 0.014, 0.015, 0.018, 0.018, 0.015]
COL_HAUSTRA_END = 17   # haustra ripple stops at the sigmoid


def colon_sdf(P):
    pts, rr = catmull(COL, COL_R, 0.003)
    # ripple along arc length, fading out after the descending colon
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    total_h = seg[min(len(seg) - 1, int(len(seg) * COL_HAUSTRA_END / (len(COL) - 1)))]
    amp = np.clip((total_h - seg) / 0.03, 0, 1) * 0.055
    rr = rr * (1 + amp * np.cos(2 * np.pi * seg / 0.034))
    return sd_chain(P, pts, rr)


# Small bowel: a stylised mass of loops in the colon frame. One continuous tube from the DJ flexure (upper left)
# meandering down to the terminal ileum (lower right), with depth and height waves so the loops overlap.
def small_bowel_path():
    """Back layer: jejunal loops in rows from the DJ flexure down; front layer: ileal loops in columns from the left down to
    the terminal ileum at the caecum. Gentle waves in depth so the loops overlap like a packed mass."""
    pts = [v(0.034, 0.046, -0.044), v(0.056, 0.048, -0.056)]
    rows = [(-0.068, 0.070, -0.046), (-0.094, -0.046, 0.072), (-0.120, 0.072, -0.044), (-0.146, -0.042, 0.064)]
    for i, (z, x0, x1) in enumerate(rows):
        n = 10
        for k in range(n + 1):
            t = k / n
            pts.append(v(x0 + (x1 - x0) * t, 0.046 + 0.009 * np.sin(2 * np.pi * 1.5 * t + i), z + 0.006 * np.sin(2 * np.pi * 2.0 * t + i * 0.7)))
    pts.append(v(0.068, 0.062, -0.164))
    cols = [0.066, 0.043, 0.020, -0.003, -0.026, -0.048]
    for j, x in enumerate(cols):
        top = -0.084 if j in (0, 5) else -0.094
        bot = -0.154 if x > 0.03 else -0.174
        z0, z1 = (bot, top) if j % 2 == 0 else (top, bot)
        n = 8
        for k in range(n + 1):
            t = k / n
            pts.append(v(x + 0.005 * np.sin(2 * np.pi * 1.5 * t + j), 0.080 + 0.008 * np.sin(2 * np.pi * 1.2 * t + j * 1.7), z0 + (z1 - z0) * t))
    pts.append(v(-0.054, 0.072, -0.176))
    pts.append(v(-0.058, 0.064, -0.165))   # terminal ileum into the caecum's medial wall
    return pts


SB_R = 0.0118


def small_bowel_sdf(P):
    pts, _ = catmull(small_bowel_path(), None, 0.003)
    return sd_chain(P, pts, np.full(len(pts), SB_R))


# Heart: ventricular mass as a blunt cone (base up, back and to the right; apex forward, down and to the left),
# left atrium behind, pulmonary trunk stub. The right atrium is its own mesh.
HEART_BASE, HEART_APEX = v(0.019, 0.058, 0.214), v(0.074, 0.098, 0.151)
LA_C = v(0.014, 0.036, 0.212)
RA_C, RA_R = v(-0.034, 0.058, 0.190), (0.021, 0.023, 0.027)


def heart_sdf(P):
    d = sd_round_cone(P, HEART_BASE, HEART_APEX, 0.037, 0.013)
    ax, b, c = frame(HEART_APEX - HEART_BASE, v(0, 0, 1))
    d = smin(d, sd_ellipsoid(P, 0.55 * HEART_BASE + 0.45 * HEART_APEX, (0.050, 0.038, 0.041), (ax, b, c)), 0.02)
    d = smin(d, sd_ellipsoid(P, LA_C, (0.024, 0.016, 0.018)), 0.012)
    d = smin(d, sd_ellipsoid(P, v(-0.004, 0.081, 0.182), (0.032, 0.018, 0.026)), 0.030)   # right ventricle, the front of the heart
    d = smin(d, sd_round_cone(P, v(0.016, 0.086, 0.214), v(0.024, 0.074, 0.252), 0.0125, 0.0115), 0.006)
    return d


def right_atrium_sdf(P):
    d = sd_ellipsoid(P, RA_C, RA_R)
    d = smin(d, sd_round_cone(P, v(-0.026, 0.072, 0.204), v(-0.010, 0.088, 0.216), 0.011, 0.0065), 0.008)  # auricle
    return d


# Aorta (landmark): ascending from the heart, arch, descending thoracic behind the heart, abdominal on the
# vertebral bodies to the bifurcation at L4, with short common iliac stubs.
AO = [v(0.006, 0.064, 0.214), v(0.002, 0.062, 0.250), v(0.001, 0.051, 0.280), v(0.008, 0.030, 0.292),
      v(0.020, 0.010, 0.284), v(0.025, -0.004, 0.258), v(0.025, -0.008, 0.215), v(0.021, -0.006, 0.160),
      v(0.017, 0.000, 0.105), v(0.013, 0.008, 0.055), N['AO_CELIAC'], v(0.011, 0.013, -0.020),
      v(0.009, 0.014, -0.060), v(0.006, 0.014, -0.096)]
AO_R = [0.0140, 0.0140, 0.0135, 0.0130, 0.0125, 0.0120, 0.0118, 0.0115, 0.0112, 0.0110, 0.0108, 0.0102, 0.0098, 0.0092]
AO_ILIAC = [[v(0.006, 0.014, -0.096), v(-0.008, 0.024, -0.116), v(-0.022, 0.030, -0.140)],
            [v(0.006, 0.014, -0.096), v(0.022, 0.014, -0.118), v(0.040, 0.016, -0.142)]]


def aorta_sdf(P):
    pts, rr = catmull(AO, AO_R, 0.004)
    d = sd_chain(P, pts, rr)
    for br in AO_ILIAC:
        pts, rr = catmull(br, [0.0070, 0.0066, 0.0064], 0.004)
        d = smin(d, sd_chain(P, pts, rr), 0.004)
    return d


# Gallbladder: fundus just past the inferior border at the right costal margin, neck toward the porta hepatis.
GB = [v(-0.069, 0.116, 0.016), v(-0.063, 0.102, 0.029), v(-0.057, 0.088, 0.041), v(-0.051, 0.077, 0.050),
      v(-0.047, 0.070, 0.054)]
GB_R = [0.0150, 0.0145, 0.0120, 0.0080, 0.0045]


def gallbladder_sdf(P):
    pts, rr = catmull(GB, GB_R, 0.003)
    return sd_chain(P, pts, rr)


def stomach_esophagus_sdf(P):
    """The stomach and the lower esophagus as one shape (the esophagus runs up through the diaphragm into the chest)."""
    return smin(stomach_sdf(P), esophagus_sdf(P), 0.006)


def esophagus_part(P):
    """1 on the esophageal part of the stomach mesh, 0 on the stomach (for varices and highlights)."""
    return (esophagus_sdf(P) < stomach_sdf(P) - 0.0005).astype(np.float32)


# Appendix: from the caecum's posteromedial wall below the ileocaecal junction, hanging over the pelvic brim.
APP = [v(-0.064, 0.050, -0.196), v(-0.054, 0.046, -0.212), v(-0.042, 0.048, -0.222), v(-0.031, 0.054, -0.226),
       v(-0.024, 0.060, -0.221)]
APP_R = [0.0042, 0.0038, 0.0036, 0.0034, 0.0031]


def appendix_sdf(P):
    pts, rr = catmull(APP, APP_R, 0.002)
    return sd_chain(P, pts, rr)


# Colon segments by control point index: caecum, ascending, transverse, descending, sigmoid, rectum.
COL_SEGMENTS = [('caecum', 0, 1.2), ('ascending', 1.2, 5.0), ('transverse', 5.0, 12.0), ('descending', 12.0, 16.0),
                ('sigmoid', 16.0, 21.0), ('rectum', 21.0, 23.0)]


def colon_segment(P):
    """Index of the colon segment (0 caecum ... 5 rectum) nearest to each point."""
    pts, _ = catmull(COL, None, 0.003)
    # parameter of each dense point in control-point units
    n_ctrl = len(COL) - 1
    u = np.linspace(0, n_ctrl, len(pts))
    from scipy.spatial import cKDTree
    _, idx = cKDTree(pts).query(P)
    uu = u[idx]
    seg = np.zeros(len(P), dtype=np.float32)
    for i, (_, a0, a1) in enumerate(COL_SEGMENTS):
        seg[(uu >= a0) & (uu < a1 + 1e-9)] = i
    return seg


# Umbilicus: on the anterior abdominal wall in the midline, at L3-L4.
UMBILICUS = v(0.0, 0.136, -0.082)
# Falciform ligament: its line on the liver from the umbilical notch up over the anterior surface (x, z pairs; projected onto
# the liver's surface at build time).
FALCIFORM = [(-0.001, 0.054), (-0.001, 0.064), (-0.002, 0.080), (-0.003, 0.096), (-0.004, 0.110), (-0.005, 0.122), (-0.005, 0.130)]


# ----------------------------------------------------------------------------------------------------------
# vessels (centrelines with radii). One entry per engine edge ID; ends sit exactly on the shared node points.
# radius = engine nominal diameter / 2 (topology.js `d`, or `vd` for the lobar hepatic arteries), tapered at
# the peripheral ends of the intrahepatic branches.
# ----------------------------------------------------------------------------------------------------------

def _taper(n, r_main, r_end, frac=0.5, at='start'):
    """Radius list of n points: r_main, easing to r_end over the last `frac` of the vessel at `at`."""
    out = []
    for i in range(n):
        t = i / (n - 1)
        u = (1 - t) if at == 'start' else t          # u = 1 at the tapered end
        k = np.clip((u - (1 - frac)) / frac, 0, 1)
        k = k * k * (3 - 2 * k)
        out.append(r_main * (1 - k) + r_end * k)
    return out


def _vessel(eid, frm, to, pts, radii, group, label):
    return dict(id=eid, frm=frm, to=to, points=[np.asarray(p, dtype=np.float64) for p in pts], radii=list(map(float, radii)),
                group=group, label=label)


def vessels():
    V = []
    # portal inflow
    p = [N['SMV'], v(-0.006, 0.059, -0.075), v(-0.008, 0.053, -0.052), v(-0.010, 0.049, -0.030), v(-0.011, 0.046, -0.016), N['CONF']]
    V.append(_vessel('SMV_CONF', 'SMV', 'CONF', p, [0.005] * len(p), 'portal', 'Superior mesenteric vein'))
    p = [N['SPL'], v(0.098, 0.004, 0.058), v(0.086, 0.012, 0.047), v(0.073, 0.019, 0.037), N['SVD']]
    V.append(_vessel('V_SPL', 'SPL', 'SVD', p, [0.004] * len(p), 'portal', 'Splenic vein (distal)'))
    p = [N['SVD'], v(0.047, 0.032, 0.022), v(0.034, 0.037, 0.014), N['SV']]
    V.append(_vessel('SV_MID', 'SVD', 'SV', p, [0.004] * len(p), 'portal', 'Splenic vein (mid)'))
    p = [N['SV'], v(0.010, 0.044, 0.004), v(-0.002, 0.046, -0.001), N['CONF']]
    V.append(_vessel('SV_CONF', 'SV', 'CONF', p, [0.004] * len(p), 'portal', 'Splenic vein (proximal)'))
    # left gastric (coronary) vein: from the lesser curve below the cardia, down and to the right behind the lesser
    # sac (over the pancreatic body) to the portal confluence
    p = [N['LGV'], v(0.024, 0.060, 0.048), v(0.014, 0.053, 0.034), v(0.004, 0.050, 0.020), v(-0.005, 0.047, 0.008), N['CONF']]
    V.append(_vessel('LGV_CONF', 'LGV', 'CONF', p, [0.002] * len(p), 'portal', 'Left gastric (coronary) vein'))
    # portal vein, up and to the right in the hepatoduodenal ligament, in front of the IVC
    p = [N['CONF'], v(-0.019, 0.046, 0.012), v(-0.028, 0.047, 0.030), v(-0.037, 0.048, 0.045), N['PVH']]
    V.append(_vessel('PV_TRUNK', 'CONF', 'PVH', p, [0.006] * len(p), 'portal', 'Portal vein'))
    p = [N['PVH'], v(-0.058, 0.047, 0.063), v(-0.071, 0.044, 0.067), N['RPV']]
    V.append(_vessel('PVH_R', 'PVH', 'RPV', p, _taper(len(p), 0.0045, 0.0036, 0.5, 'end'), 'portal', 'Right portal vein'))
    # left portal vein: transverse part along the hilum in front of the caudate, then the umbilical part turning forward
    p = [N['PVH'], v(-0.034, 0.055, 0.064), v(-0.020, 0.060, 0.070), v(-0.009, 0.066, 0.075), v(-0.004, 0.076, 0.078), N['LPV']]
    V.append(_vessel('PVH_L', 'PVH', 'LPV', p, _taper(len(p), 0.004, 0.0034, 0.4, 'end'), 'portal', 'Left portal vein'))
    # hepatic veins: from the periphery of the liver up and back to the IVC just below the diaphragm
    p = [v(-0.126, 0.040, 0.030), v(-0.110, 0.038, 0.058), v(-0.087, 0.036, 0.087), v(-0.060, 0.035, 0.114), v(-0.037, 0.035, 0.128), N['IVCS']]
    V.append(_vessel('RHV_IVC', 'RHV', 'IVCS', p, _taper(len(p), 0.0045, 0.0022, 0.6, 'start'), 'systemic', 'Right hepatic vein'))
    p = [v(-0.052, 0.108, 0.054), v(-0.046, 0.090, 0.077), v(-0.039, 0.070, 0.101), v(-0.030, 0.052, 0.122), N['IVCS']]
    V.append(_vessel('MHV_IVC', 'MHV', 'IVCS', p, _taper(len(p), 0.004, 0.002, 0.6, 'start'), 'systemic', 'Middle hepatic vein'))
    p = [v(0.052, 0.080, 0.110), v(0.030, 0.068, 0.120), v(0.008, 0.055, 0.128), v(-0.008, 0.044, 0.133), N['IVCS']]
    V.append(_vessel('LHV_IVC', 'LHV', 'IVCS', p, _taper(len(p), 0.004, 0.002, 0.6, 'start'), 'systemic', 'Left hepatic vein'))
    # IVC
    p = [N['IVCI'], v(-0.025, 0.018, 0.015), v(-0.025, 0.021, 0.050), v(-0.023, 0.026, 0.085), v(-0.021, 0.031, 0.112), N['IVCS']]
    V.append(_vessel('IVC_IS', 'IVCI', 'IVCS', p, [0.010] * len(p), 'systemic', 'IVC (infrahepatic and retrohepatic)'))
    p = [N['IVCS'], v(-0.021, 0.040, 0.146), v(-0.024, 0.045, 0.159), N['RA']]
    V.append(_vessel('IVCS_RA', 'IVCS', 'RA', p, [0.011] * len(p), 'systemic', 'IVC (suprahepatic, to the right atrium)'))
    p = [N['ILI'], v(-0.020, 0.010, -0.100), v(-0.023, 0.014, -0.065), v(-0.024, 0.015, -0.040), N['IVCI']]
    V.append(_vessel('ILI_IVC', 'ILI', 'IVCI', p, [0.008] * len(p), 'systemic', 'IVC (infrarenal, from the iliac confluence)'))
    # renal veins: the left is long and crosses in front of the aorta; the right is short
    h = N['LRV']
    p = [h, h + v(-0.010, 0.010, 0.000), v(0.030, 0.026, -0.019), v(0.012, 0.031, -0.019), v(-0.006, 0.027, -0.018), N['IVCI']]
    V.append(_vessel('LRV_IVC', 'LRV', 'IVCI', p, [0.004] * len(p), 'systemic', 'Left renal vein'))
    h = N['RRV']
    p = [h, h + v(0.010, 0.010, 0.004), N['IVCI']]
    V.append(_vessel('RRV_IVC', 'RRV', 'IVCI', p, [0.004] * len(p), 'systemic', 'Right renal vein'))
    # SVC into the right atrium (cheap context for the jugular route later)
    p = [N['SVC'], v(-0.032, 0.046, 0.262), v(-0.033, 0.049, 0.228), v(-0.031, 0.050, 0.198), N['RA']]
    V.append(_vessel('SVC_RA', 'SVC', 'RA', p, [0.009] * len(p), 'systemic', 'Superior vena cava'))
    # hepatic arteries: celiac trunk and common hepatic artery to the right along the upper border of the pancreas,
    # proper hepatic artery up in the hepatoduodenal ligament (in front of and left of the portal vein) to the hilum
    p = [N['AO_CELIAC'], v(0.012, 0.030, 0.026), v(0.002, 0.044, 0.026), v(-0.016, 0.054, 0.022), v(-0.027, 0.058, 0.026),
         v(-0.034, 0.061, 0.040), v(-0.040, 0.062, 0.052), N['HA']]
    V.append(_vessel('A_HEP', 'AO', 'HA', p, [0.0025] * len(p), 'artery', 'Common hepatic artery'))
    p = [N['HA'], v(-0.054, 0.056, 0.066), v(-0.068, 0.051, 0.072), v(-0.084, 0.047, 0.078)]
    V.append(_vessel('A_HR', 'HA', 'SIN_R', p, _taper(len(p), 0.0021, 0.0016, 0.5, 'end'), 'artery', 'Right hepatic artery'))
    p = [N['HA'], v(-0.033, 0.066, 0.068), v(-0.018, 0.071, 0.074), v(-0.006, 0.080, 0.076)]
    V.append(_vessel('A_HL', 'HA', 'SIN_L', p, _taper(len(p), 0.00185, 0.0014, 0.5, 'end'), 'artery', 'Left hepatic artery'))
    return V


def vessel_tube(vs, step=0.003):
    pts, rr = catmull(vs['points'], vs['radii'], step)
    return pts, rr


def vessels_sdf(P, ids, dilate=0.0, V=None):
    V = V or vessels()
    d = np.full(len(P), FAR)
    for vs in V:
        if vs['id'] in ids:
            pts, rr = vessel_tube(vs)
            d = np.minimum(d, sd_chain(P, pts, rr + dilate))
    return d


# ----------------------------------------------------------------------------------------------------------
# the liver
# ----------------------------------------------------------------------------------------------------------
# Frontal outline (x, z): rounded right lobe under the right dome, tapering left lobe to its tip at the left MCL.
LIV_FRONT = [(-0.131, -0.008), (-0.141, 0.024), (-0.139, 0.074), (-0.127, 0.114), (-0.100, 0.147), (-0.066, 0.163),
             (-0.031, 0.158), (0.000, 0.148), (0.030, 0.145), (0.056, 0.139), (0.076, 0.128), (0.089, 0.116),
             (0.083, 0.106), (0.058, 0.093), (0.028, 0.074), (0.002, 0.059), (-0.034, 0.041), (-0.066, 0.023),
             (-0.094, 0.010), (-0.118, 0.000)]
# Transverse footprint (x, y): right lobe deep (back to the posterior ribs), wrapping the IVC; left lobe thin and anterior.
LIV_TOP = [(-0.139, 0.040), (-0.130, -0.010), (-0.104, -0.031), (-0.072, -0.036), (-0.046, -0.024), (-0.034, 0.000),
           (-0.016, 0.012), (0.006, 0.022), (0.022, 0.044), (0.048, 0.054), (0.074, 0.066), (0.090, 0.086),
           (0.083, 0.105), (0.056, 0.118), (0.020, 0.126), (-0.030, 0.128), (-0.080, 0.122), (-0.115, 0.105),
           (-0.134, 0.075)]
# Side outline (y, z): dome on top, thick posterior right lobe, sharp anterior inferior edge.
LIV_SIDE = [(0.030, 0.166), (-0.010, 0.156), (-0.038, 0.126), (-0.043, 0.085), (-0.040, 0.040), (-0.032, 0.012),
            (0.010, -0.002), (0.060, -0.010), (0.106, -0.014), (0.127, -0.006), (0.131, 0.020), (0.129, 0.070),
            (0.113, 0.118), (0.080, 0.151)]

CAUDATE = (v(0.000, 0.030, 0.092), (0.016, 0.014, 0.032))
CAUDATE_PAPILLARY = (v(-0.004, 0.040, 0.066), 0.010)
FALCIFORM_X = -0.002     # anatomical right/left lobe division (falciform ligament, umbilical fissure)
TERES = [v(0.002, 0.140, 0.034), v(0.000, 0.118, 0.052), v(-0.002, 0.094, 0.070)]   # ligamentum teres into the umbilical fissure


def _closed_spline(poly, n=400):
    P = np.asarray(poly, dtype=np.float64)
    m = len(P)
    out = []
    per = max(2, n // m)
    for i in range(m):
        p0, p1, p2, p3 = P[(i - 1) % m], P[i], P[(i + 1) % m], P[(i + 2) % m]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)


def poly_sdf_2d(poly, U, W):
    """Signed distance (negative inside) from 2D points (U, W arrays) to a closed smooth outline."""
    from skimage.measure import points_in_poly
    C = _closed_spline(poly)
    pts = np.stack([U.ravel(), W.ravel()], axis=1)
    inside = points_in_poly(pts, C)
    # distance to the polyline
    A = C
    B = np.roll(C, -1, axis=0)
    d = np.full(len(pts), np.inf)
    for a, b in zip(A, B):
        ab = b - a
        t = np.clip(((pts - a) @ ab) / max(np.dot(ab, ab), 1e-12), 0, 1)
        q = a + t[:, None] * ab
        d = np.minimum(d, np.linalg.norm(pts - q, axis=1))
    return np.where(inside, -d, d).reshape(U.shape)


def _inferior_border_z(x):
    """Height of the inferior border of the liver at x (from the lower run of the frontal outline)."""
    lower = [(-0.141, 0.006), (-0.131, -0.008), (-0.118, 0.000), (-0.094, 0.010), (-0.066, 0.023), (-0.034, 0.041),
             (0.002, 0.059), (0.028, 0.074), (0.058, 0.093), (0.083, 0.106), (0.089, 0.116)]
    xs, zs = zip(*lower)
    return np.interp(x, xs, zs)


def liver_base_on_grid(X, Y, Z):
    """Liver volume before neighbour impressions, evaluated on a regular grid (X, Y, Z are 1D axes)."""
    GX, GZ = np.meshgrid(X, Z, indexing='ij')
    f_xz = poly_sdf_2d(LIV_FRONT, GX, GZ)                    # (nx, nz)
    GX2, GY2 = np.meshgrid(X, Y, indexing='ij')
    f_xy = poly_sdf_2d(LIV_TOP, GX2, GY2)                    # (nx, ny)
    GY3, GZ3 = np.meshgrid(Y, Z, indexing='ij')
    f_yz = poly_sdf_2d(LIV_SIDE, GY3, GZ3)                   # (ny, nz)
    d = smax(f_xz[:, None, :], f_xy[:, :, None], 0.010)
    d = smax(d, f_yz[None, :, :], 0.010)
    # visceral surface: rises from the sharp anterior inferior edge toward the back; steeper on the left, so the left
    # lobe thins to an edge in front of the stomach and the right lobe stays deep over the kidney.
    x3 = X[:, None, None]
    y3 = Y[None, :, None]
    z3 = Z[None, None, :]
    zb = _inferior_border_z(x3) - 0.004
    s = np.interp(x3, [-0.15, -0.07, -0.02, 0.03, 0.10], [0.10, 0.20, 0.34, 0.52, 0.56])
    vis = (zb + s * (0.130 - y3)) - z3      # >0 below the visceral surface
    vis = vis / np.sqrt(1 + s * s)
    d = smax(d, vis, 0.012)
    return d


def liver_sdf_on_grid(X, Y, Z, neighbours):
    """Final liver: base, caudate lobe, then impressions/notches. neighbours: dict name -> fn(P) (final shapes)."""
    d = liver_base_on_grid(X, Y, Z)
    G = np.stack(np.meshgrid(X, Y, Z, indexing='ij'), axis=-1).reshape(-1, 3)
    shp = d.shape
    d = d.ravel()
    caud = smin(sd_ellipsoid(G, *CAUDATE), sd_sphere(G, *CAUDATE_PAPILLARY), 0.008)
    d = smin(d, caud, 0.012)
    # IVC: a groove open to the back (the vessel lies in it; the bare area)
    V = {vs['id']: vs for vs in vessels()}
    ivc_pts, ivc_r = catmull(V['IVC_IS']['points'] + V['IVCS_RA']['points'][1:], V['IVC_IS']['radii'] + V['IVCS_RA']['radii'][1:], 0.003)
    Q = G.copy()
    yiv = np.interp(G[:, 2], ivc_pts[:, 2], ivc_pts[:, 1])
    Q[:, 1] = np.where(G[:, 1] < yiv, yiv, G[:, 1])   # everything behind the IVC collapses onto it: a slot open to the back
    d = ssub(d, sd_chain(Q, ivc_pts, ivc_r + 0.0015), 0.004)
    # porta hepatis: the portal vein trunk and the hepatic artery enter here
    d = ssub(d, vessels_sdf(G, {'PV_TRUNK'}, 0.0035), 0.005)
    d = ssub(d, vessels_sdf(G, {'A_HEP'}, 0.0025), 0.004)
    # umbilical fissure and notch (ligamentum teres)
    pts, rr = catmull(TERES, [0.0060, 0.0055, 0.0045], 0.003)
    d = ssub(d, sd_chain(G, pts, rr), 0.004)
    # impressions of the neighbours (each dilated a little: peritoneum, diaphragm)
    for name, dil, k in (('gallbladder', 0.0012, 0.004), ('stomach', 0.003, 0.008), ('esophagus', 0.004, 0.006),
                         ('heart', 0.010, 0.012), ('right_atrium', 0.010, 0.012), ('kidney_right', 0.004, 0.008),
                         ('colon', 0.003, 0.008), ('duodenum', 0.003, 0.006), ('aorta', 0.006, 0.006)):
        d = ssub(d, neighbours[name](G) - dil, k)
    return d.reshape(shp)


def liver_lobe(P):
    """Anatomical lobe of each surface point: 0 right (with the quadrate), 1 left, 2 caudate."""
    caud = smin(sd_ellipsoid(P, *CAUDATE), sd_sphere(P, *CAUDATE_PAPILLARY), 0.008)
    lobe = np.where(P[:, 0] > FALCIFORM_X, 1, 0)
    lobe = np.where((caud < 0.003) & (P[:, 1] < 0.050), 2, lobe)
    return lobe


# ----------------------------------------------------------------------------------------------------------
# organ table: name -> (base sdf fn, neighbours subtracted as (name, dilation, smoothing), grid step, blur sigma (m),
#                      target quad count, hint colour (Light look))
# ----------------------------------------------------------------------------------------------------------
BASE = {
    'spleen': spleen_sdf,
    'stomach': stomach_esophagus_sdf,
    'esophagus': esophagus_sdf,
    'appendix': appendix_sdf,
    'duodenum': duodenum_sdf,
    'pancreas': pancreas_sdf,
    'small_bowel': small_bowel_sdf,
    'colon': colon_sdf,
    'kidney_left': lambda P: kidney_sdf(P, 'left'),
    'kidney_right': lambda P: kidney_sdf(P, 'right'),
    'heart': heart_sdf,
    'right_atrium': right_atrium_sdf,
    'aorta': aorta_sdf,
    'gallbladder': gallbladder_sdf,
}

PORTAL_EXTRA = {'PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'SV_MID', 'V_SPL'}

ORGANS = {
    #   name          subtract                                                                  step    blur   quads  colour
    'liver':       dict(sub=None, step=0.0018, blur=0.0030, quads=12000, color='#905B49'),
    'gallbladder': dict(sub=[], step=0.0012, blur=0.0012, quads=700, color='#8E8A56'),
    'spleen':      dict(sub=[('stomach', 0.003, 0.006), ('kidney_left', 0.003, 0.006), ('colon', 0.003, 0.006)],
                        step=0.0015, blur=0.0020, quads=2000, color='#7A5F78'),
    'stomach':     dict(sub=[('pancreas', 0.003, 0.008), ('aorta', 0.004, 0.004)], step=0.0014, blur=0.0020, quads=5000, color='#A67A6C'),
    'appendix':    dict(sub=[('colon', 0.0005, 0.002)], step=0.0007, blur=0.0006, quads=500, color='#B08A74'),
    'duodenum':    dict(sub=[], step=0.0013, blur=0.0013, quads=1800, color='#AF826E'),
    'pancreas':    dict(sub=[('duodenum', 0.0012, 0.004), ('vessels', 0.0012, 0.003), ('aorta', 0.003, 0.004),
                             ('kidney_left', 0.003, 0.006), ('spleen', 0.003, 0.004)],
                        step=0.0013, blur=0.0016, quads=2800, color='#C9A27A'),
    'small_bowel': dict(sub=[('colon', 0.0025, 0.004), ('vessels_smv', 0.004, 0.004), ('duodenum', 0.002, 0.004)],
                        step=0.0013, blur=0.0018, quads=12000, color='#AF826E'),
    'colon':       dict(sub=[], step=0.0016, blur=0.0016, quads=6500, color='#B08A74'),
    'kidney_left': dict(sub=[], step=0.0015, blur=0.0015, quads=1500, color='#9C6A5E'),
    'kidney_right': dict(sub=[], step=0.0015, blur=0.0015, quads=1500, color='#9C6A5E'),
    'heart':       dict(sub=[('aorta', 0.0005, 0.003)], step=0.0016, blur=0.0020, quads=3000, color='#9D575C'),
    'right_atrium': dict(sub=[], step=0.0012, blur=0.0012, quads=1000, color='#9D575C'),
    'aorta':       dict(sub=[], step=0.0012, blur=0.0008, quads=2200, color='#B5473A'),
}


def final_sdf_fn(name, cache=None):
    """Point-wise final shape for organs other than the liver (base minus dilated neighbours)."""
    spec = ORGANS[name]
    base = BASE[name]

    def f(P):
        d = base(P)
        for nb, dil, k in spec['sub']:
            if nb == 'vessels':
                o = vessels_sdf(P, PORTAL_EXTRA | {'IVC_IS', 'ILI_IVC', 'LRV_IVC'}, dil)
                d = ssub(d, o, k)
                continue
            if nb == 'vessels_smv':
                o = vessels_sdf(P, {'SMV_CONF'}, dil)
                d = ssub(d, o, k)
                continue
            d = ssub(d, BASE[nb](P) - dil, k)
        return d
    return f


# Body plate: flat torso silhouette (x, z) behind everything, in the coronal plane at y = PLATE_Y.
PLATE_Y = -0.125
PLATE = [(-0.150, -0.330), (-0.172, -0.250), (-0.170, -0.170), (-0.156, -0.090), (-0.150, -0.010), (-0.160, 0.080),
         (-0.172, 0.170), (-0.180, 0.260), (-0.176, 0.320), (-0.150, 0.352), (-0.090, 0.368), (-0.050, 0.372),
         (0.050, 0.372), (0.090, 0.368), (0.150, 0.352), (0.176, 0.320), (0.180, 0.260), (0.172, 0.170),
         (0.160, 0.080), (0.150, -0.010), (0.156, -0.090), (0.170, -0.170), (0.172, -0.250), (0.150, -0.330),
         (0.060, -0.352), (0.000, -0.334), (-0.060, -0.352)]

# Cameras (V frame): target, distance, yaw (deg, + = toward the patient's left), pitch (deg, + = from above).
# Vertical field of view 30 deg, as in the mocks.
CAMERAS = {
    'body':   dict(target=v(0.000, 0.040, 0.010), dist=1.25, yaw=0.0, pitch=0.0, note='Whole body plate, frontal'),
    'portal': dict(target=v(0.020, 0.045, 0.020), dist=0.50, yaw=0.0, pitch=8.0, note='Portal confluence, trunk, splenic vein, spleen'),
    'liver':  dict(target=v(-0.030, 0.060, 0.075), dist=0.62, yaw=-8.0, pitch=6.0, note='Liver with portal and hepatic veins'),
}
CAM_FOV_Y = 30.0
