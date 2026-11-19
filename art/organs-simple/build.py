"""Simple 3D organs from the 2D app's organ outlines (src/ui/anatomy.js ORGANS).
Each outline is inflated into a smooth pillow: same silhouette from the front, rounded edges, no extra anatomy.
Coordinates: X=(x-700)/300, Y=-(y-556)/300; organs straddle z=0, front faces z<=0.26 (vessels' depth contract).
Usage: python3 build.py organs.json out.glb [render_dir] [organs-data.json]"""
import sys, json, re, math
import numpy as np
from scipy.spatial import Delaunay
from scipy.ndimage import distance_transform_edt
from matplotlib.path import Path as MPath
import bpy

C = lambda r, g, b: (r / 255, g / 255, b / 255)   # Light look's first stop (2D src/ui/stop-tokens.js og-*-1)
ORG = {  # id: (half-thickness, z offset, colour)  -- order front to back by offset
 'liver':   (0.18, 0.08, C(227,184,167)),
 'heart':   (0.16, 0.00, C(233,172,161)),
 'heart-ra':(0.10, 0.10, C(225,153,143)),
 'stomach': (0.15, 0.02, C(237,206,194)),
 'spleen':  (0.14, 0.00, C(210,178,199)),
 'kidney-l':(0.13, 0.03, C(217,164,188)),
 'colon':   (0.08,-0.04, C(244,207,193)),
 'bowel':   (0.05,-0.14, C(244,207,193)),
}
S = 300.0
def to3(x, y): return ((x - 700) / S, -(y - 556) / S)

def flatten(d, step=2.0):
    toks = re.findall(r'[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?', d)
    pts, i, cmd, cur = [], 0, None, (0, 0)
    while i < len(toks):
        t = toks[i]
        if t in 'MLCZ': cmd = t; i += 1
        if cmd == 'Z': continue
        if cmd in 'ML':
            cur = (float(toks[i]), float(toks[i+1])); pts.append(cur); i += 2
        elif cmd == 'C':
            p = [cur] + [(float(toks[i+2*k]), float(toks[i+2*k+1])) for k in range(3)]; i += 6
            L = sum(math.dist(p[k], p[k+1]) for k in range(3)); n = max(2, int(L / step))
            for s in np.linspace(0, 1, n + 1)[1:]:
                u = 1 - s
                pts.append(tuple(u**3*np.array(p[0]) + 3*u*u*s*np.array(p[1]) + 3*u*s*s*np.array(p[2]) + s**3*np.array(p[3])))
            cur = p[3]
    # resample evenly
    P = np.array(pts); seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    n = max(16, int(seg[-1] / step)); s = np.linspace(0, seg[-1], n, endpoint=False)
    return np.c_[np.interp(s, seg, P[:, 0]), np.interp(s, seg, P[:, 1])]

def inflate(name, d, H, z0, relief=None):
    B = flatten(d, 2.5)
    poly = MPath(np.r_[B, B[:1]])
    lo, hi = B.min(0) - 4, B.max(0) + 4; g = 1.0
    xs, ys = np.arange(lo[0], hi[0], g), np.arange(lo[1], hi[1], g)
    X, Y = np.meshgrid(xs, ys); inside = poly.contains_points(np.c_[X.ravel(), Y.ravel()]).reshape(X.shape)
    dist = distance_transform_edt(inside) * g  # px to edge
    R = min(dist.max(), H * S)  # rounding radius in px
    def zprof(dd):
        t = np.clip(dd / R, 0, 1); return np.sqrt(1 - (1 - t) ** 2)
    # interior sample points on a coarser grid, kept a little off the edge
    cg = 3.0 if relief is not None else 4.0
    ix = np.arange(lo[0], hi[0], cg); iy = np.arange(lo[1], hi[1], cg)
    IX, IY = np.meshgrid(ix, iy); I = np.c_[IX.ravel(), IY.ravel()]
    gi = np.clip(((I[:, 1] - lo[1]) / g).astype(int), 0, dist.shape[0]-1); gj = np.clip(((I[:, 0] - lo[0]) / g).astype(int), 0, dist.shape[1]-1)
    di = dist[gi, gj]; keep = di > 1.5; I, di = I[keep], di[keep]
    P = np.r_[B, I]; D = np.r_[np.zeros(len(B)), di]
    tri = Delaunay(P).simplices
    c = P[tri].mean(1); tri = tri[poly.contains_points(c)]
    zf = zprof(D) * H; nb = len(B)
    if relief is not None: zf = zf + relief(P) * zprof(D)
    verts, faces = [], []
    for (x, y), z in zip(P, zf):
        X3, Y3 = to3(x, y); verts.append((X3, Y3, z0 + z))
    off = len(verts)
    for k, ((x, y), z) in enumerate(zip(P, zf)):
        X3, Y3 = to3(x, y); verts.append((X3, Y3, z0 - z * 0.8))
    # boundary verts shared: back copies of boundary map to front indices
    remap = lambda i: i if i < nb else i + off
    for a, b, cc in tri:
        faces.append((a, cc, b))  # front (svg y flipped -> reverse winding)
        faces.append((remap(a), remap(b), remap(cc)))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate(); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-6); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    ob.select_set(False)
    return ob, max(v[2] for v in verts)

def loop_relief(rims, sq=1.2):
    # the 2D loops (BOWEL_ART ob-rim strokes) raised from the bowel's surface: each loop a half-round of the 2D stroke width,
    # one surface (nearest loop wins), so loops meet in soft grooves. Returns height in scene units at 2D points.
    from scipy.ndimage import distance_transform_edt as edt
    pts = np.concatenate([poly_pts(d) for d, w in rims]); r = np.mean([w for d, w in rims]) / 2
    lo = pts.min(0) - 40; hi = pts.max(0) + 40; g = 0.5
    shape = (int((hi[1] - lo[1]) / g) + 1, int((hi[0] - lo[0]) / g) + 1); line = np.ones(shape, bool)
    for d, w in rims:
        P = poly_pts(d)
        for a, b in zip(P[:-1], P[1:]):
            for t in np.linspace(0, 1, int(np.linalg.norm(b - a) / g * 2) + 2):
                q = a + (b - a) * t; line[int((q[1] - lo[1]) / g), int((q[0] - lo[0]) / g)] = False
    dist = edt(line) * g; h = np.sqrt(np.clip(r * r - dist ** 2, 0, None)) / S * sq
    def f(P):
        i = np.clip(((P[:, 1] - lo[1]) / g).astype(int), 0, shape[0] - 1); j = np.clip(((P[:, 0] - lo[0]) / g).astype(int), 0, shape[1] - 1)
        return h[i, j]
    return f

def poly_pts(d):
    n = [float(v) for v in re.findall(r'-?\d*\.?\d+', d)]; return np.array(n).reshape(-1, 2)

def tube(name, segs, z0, col, sq=0.8, nr=14):
    # tubes along 2D stroke centre lines (2D stroke width = diameter); round cross-section flattened in z; capped ends
    verts, faces = [], []
    # the 2D art draws each loop as short overlapping strokes: chain strokes whose ends meet into one tube
    chains = []
    for d, w in segs:
        P = poly_pts(d)
        if chains and np.linalg.norm(chains[-1][0][-1] - P[0]) < 8:
            C0 = chains[-1][0]; t = C0[-1] - C0[-3]; t /= np.linalg.norm(t) + 1e-9
            k = 0
            while k < len(P) - 1 and np.dot(P[k] - C0[-1], t) < 1.0: k += 1   # skip the overlap that steps back
            chains[-1][0] = np.r_[C0, P[k:]]
        else: chains.append([P, w])
    for P, w in chains:
        P = P.copy()
        if len(P) > 6:   # light smoothing of the joins
            K = np.ones(9) / 9; Ps = np.c_[np.convolve(np.pad(P[:, 0], 4, mode="edge"), K, "valid"), np.convolve(np.pad(P[:, 1], 4, mode="edge"), K, "valid")]; P = Ps
        keep = [0]
        for i in range(1, len(P)):
            if np.linalg.norm(P[i] - P[keep[-1]]) > 1.5: keep.append(i)
        P = P[keep]
        if len(P) < 2: continue
        r = w / 2 / S; Q = np.array([to3(*p) for p in P])
        T = np.gradient(Q, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-9; N = np.c_[-T[:, 1], T[:, 0]]
        base = len(verts)
        for q, nn in zip(Q, N):
            for k in range(nr):
                a = 2 * math.pi * k / nr; verts.append((q[0] + nn[0] * r * math.cos(a), q[1] + nn[1] * r * math.cos(a), z0 + r * sq * math.sin(a)))
        m = len(Q)
        for i in range(m - 1):
            for k in range(nr):
                a, b = base + i * nr + k, base + i * nr + (k + 1) % nr
                faces.append((a, b, b + nr, a + nr))
        # end caps: a dome of rings shrinking to a pole, outward along the tangent (consistent winding, no normal recompute)
        for end, sgn in ((0, -1), (m - 1, 1)):
            q, tt, nn = Q[end], T[end] * sgn, N[end]; prev = base + end * nr
            for j in (1, 2, 3):
                ph = j * math.pi / 8; c0 = len(verts)
                for k in range(nr):
                    a = 2 * math.pi * k / nr; rr = r * math.cos(ph); ax = r * math.sin(ph)
                    verts.append((q[0] + nn[0] * rr * math.cos(a) + tt[0] * ax, q[1] + nn[1] * rr * math.cos(a) + tt[1] * ax, z0 + rr * sq * math.sin(a)))
                for k in range(nr):
                    a0, b0 = prev + k, prev + (k + 1) % nr; a1, b1 = c0 + k, c0 + (k + 1) % nr
                    faces.append((a0, b0, b1, a1) if sgn > 0 else (a0, a1, b1, b0))
                prev = c0
            pole = len(verts); verts.append((q[0] + tt[0] * r, q[1] + tt[1] * r, z0))
            for k in range(nr):
                a0, b0 = prev + k, prev + (k + 1) % nr
                faces.append((a0, b0, pole) if sgn > 0 else (b0, a0, pole))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate(); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT'); ob.select_set(False)
    mat(ob, name, col)
    return ob, max(v.co.z for v in me.vertices)

def mat(ob, name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (*[c ** 2.2 for c in col], 1); bs.inputs['Roughness'].default_value = 0.6
    ob.data.materials.append(m)

def main():
    src, out = sys.argv[1], sys.argv[2]; rdir = sys.argv[3] if len(sys.argv) > 3 else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    data = json.load(open(src)); stats = {}
    loops = json.load(open(src.replace('outlines-2d.json', 'loops-2d.json')))
    for name, (H, z0, col) in ORG.items():
        ob, zmax = inflate(name.replace('-', '_'), data[name], H, z0, loop_relief(loops['rims']) if name == 'bowel' else None)
        assert zmax <= 0.26 + 1e-6, (name, zmax)
        mat(ob, name, col); stats[name] = {'tris': len(ob.data.polygons), 'zmax': round(zmax, 3)}
    # small-bowel loops are relief on the bowel (loop_relief); duodenum = 2D DUO_D as a tube, stroke 26 (ringW)
    for name, segs, z0, col in (('duodenum', [[loops['duo'], 32]], -0.10, C(237, 206, 194)),):
        ob, zmax = tube(name, segs, z0, col); assert zmax <= 0.26; stats[name] = {'tris': len(ob.data.polygons), 'zmax': round(zmax, 3)}
    print(json.dumps(stats))
    if len(sys.argv) > 4: dump_ts(sys.argv[4])
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=False, export_apply=True, export_materials='EXPORT')
    if rdir: render(rdir)

def dump_ts(path):
    # positions (absolute, shared frame) + indices per organ, keyed by the 2D organ ids
    out = {}
    for ob in bpy.data.objects:
        if ob.type != 'MESH': continue
        me = ob.data; me.calc_loop_triangles()
        out[ob.name.replace('_', '-')] = {'p': [round(c, 4) for v in me.vertices for c in v.co], 'i': [i for t in me.loop_triangles for i in t.vertices]}
    json.dump(out, open(path, 'w'), separators=(',', ':'))

def render(rdir):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = 900, 1000
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.82, 0.77, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.6
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.0; sun.rotation_euler = (math.radians(-30), math.radians(-20), 0); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 3.6
    for tag, rot in (('front', 0), ('turn30', 30)):
        a = math.radians(rot); cx, cy = 0.15, 0.1
        cam.location = (cx + 10 * math.sin(a), cy, 10 * math.cos(a)); cam.rotation_euler = (0, a, 0)
        sc.render.filepath = f'{rdir}/organs-{tag}.png'; bpy.ops.render.render(write_still=True)
main()
