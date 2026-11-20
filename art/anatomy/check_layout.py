"""Fast layout check on a coarse grid: organ overlaps, and where each vessel runs inside an organ.
Run: python check_layout.py   (numpy, scipy, scikit-image; no Blender)."""
import itertools
import numpy as np
import anatomy as A

H = 0.004
X = np.arange(-0.16, 0.16, H)
Y = np.arange(-0.07, 0.15, H)
Z = np.arange(-0.33, 0.33, H)
G = np.stack(np.meshgrid(X, Y, Z, indexing='ij'), axis=-1).reshape(-1, 3)

names = [n for n in A.ORGANS if n != 'liver']
D = {n: A.final_sdf_fn(n)(G) for n in names}
nb = {n: A.final_sdf_fn(n) for n in names}
nb['esophagus'] = A.esophagus_sdf
D['liver'] = A.liver_sdf_on_grid(X, Y, Z, nb).ravel()

vox = H ** 3 * 1e6  # cm3
print('volumes (cm3):', {n: round(float((d < 0).sum() * vox)) for n, d in D.items()})
print('overlaps > 0.3 cm3:')
for a, b in itertools.combinations(D, 2):
    ov = ((D[a] < -0.001) & (D[b] < -0.001)).sum() * vox
    if ov > 0.3:
        print(f'  {a:12s} {b:12s} {ov:6.1f} cm3')

# vessels: sample the densified centreline, report organs each runs through (centre inside, or wall inside by > 1 mm)
from scipy.interpolate import RegularGridInterpolator
interp = {n: RegularGridInterpolator((X, Y, Z), d.reshape(len(X), len(Y), len(Z)), bounds_error=False, fill_value=0.03) for n, d in D.items()}
for vs in A.vessels():
    pts, rr = A.vessel_tube(vs, 0.002)
    hits = []
    for n, f in interp.items():
        dd = f(pts) - rr
        bad = dd < -0.001
        if bad.any():
            hits.append(f'{n}:{bad.mean() * 100:.0f}%')
    print(f'{vs["id"]:9s} {" ".join(hits)}')
