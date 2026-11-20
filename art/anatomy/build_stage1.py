"""Build the stage 1 anatomy: organ meshes, vessel curves and cameras, saved as a .blend and exported as .glb.

Run with Python 3.13 and the `bpy` 5.3 module (see requirements.txt), from this folder:
    python build_stage1.py
Writes  art/anatomy/body-stage1.blend
        public/anatomy/body-stage1.glb
        public/anatomy/vessels.json
Nothing is random: the same sources give the same files (apart from Blender's own file headers).
"""
import json
import os
import struct
import sys
import time

import numpy as np
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import anatomy as A  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_BLEND = os.path.join(HERE, 'body-stage1.blend')
OUT_GLB = os.path.join(REPO, 'public', 'anatomy', 'body-stage1.glb')
OUT_JSON = os.path.join(REPO, 'public', 'anatomy', 'vessels.json')

ORIGIN = A.N['CONF'].copy()          # scene origin: the portal confluence


def to_blender(P):
    """V frame (x left, y anterior, z up) -> Blender (x left, y posterior, z up), origin at CONF."""
    P = np.asarray(P, dtype=np.float64) - ORIGIN
    return np.stack([P[..., 0], -P[..., 1], P[..., 2]], axis=-1)


def to_gltf(P):
    """V frame -> glTF (+X patient's left, +Y up, +Z anterior), origin at CONF."""
    P = np.asarray(P, dtype=np.float64) - ORIGIN
    return np.stack([P[..., 0], P[..., 2], P[..., 1]], axis=-1)


def from_blender(B):
    B = np.asarray(B, dtype=np.float64)
    return np.stack([B[..., 0], -B[..., 1], B[..., 2]], axis=-1) + ORIGIN


def srgb_hex(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


# ------------------------------------------------------------------------------------------------------------
# meshing
# ------------------------------------------------------------------------------------------------------------

def organ_bbox(fn, coarse=0.005):
    X = np.arange(-0.17, 0.17, coarse)
    Y = np.arange(-0.08, 0.16, coarse)
    Z = np.arange(-0.34, 0.34, coarse)
    G = np.stack(np.meshgrid(X, Y, Z, indexing='ij'), axis=-1).reshape(-1, 3)
    d = fn(G)
    inside = G[d < 0.002]
    return inside.min(axis=0) - 0.012, inside.max(axis=0) + 0.012


FIELDS = {}   # kept fields (the liver's), for the diaphragm and the falciform line


def organ_field(name, nbfns):
    spec = A.ORGANS[name]
    h = spec['step']
    if name == 'liver':
        lo, hi = A.v(-0.165, -0.06, -0.035), A.v(0.115, 0.15, 0.185)
    else:
        lo, hi = organ_bbox(nbfns[name])
    X = np.arange(lo[0], hi[0] + h, h)
    Y = np.arange(lo[1], hi[1] + h, h)
    Z = np.arange(lo[2], hi[2] + h, h)
    if name == 'liver':
        d = A.liver_sdf_on_grid(X, Y, Z, nbfns)
        FIELDS['liver'] = (X, Y, Z, d)
    else:
        G = np.stack(np.meshgrid(X, Y, Z, indexing='ij'), axis=-1).reshape(-1, 3)
        d = nbfns[name](G).reshape(len(X), len(Y), len(Z))
    if spec['blur'] > 0:
        d = gaussian_filter(d, spec['blur'] / h, mode='nearest')
    # close the field at the grid border so every surface is closed
    d[0, :, :] = d[-1, :, :] = d[:, 0, :] = d[:, -1, :] = d[:, :, 0] = d[:, :, -1] = 0.03
    verts, faces, _, _ = marching_cubes(d, 0.0, spacing=(h, h, h))
    verts += np.array([X[0], Y[0], Z[0]])
    return verts, faces


def new_object(name, verts_b, faces, collection):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts_b.tolist(), [], faces.tolist())
    me.validate()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def keep_largest_part(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    parts = []
    for v0 in bm.verts:
        if v0.index in seen:
            continue
        stack = [v0]
        part = []
        seen.add(v0.index)
        while stack:
            x = stack.pop()
            part.append(x)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        parts.append(part)
    parts.sort(key=len, reverse=True)
    dropped = sum(len(p) for p in parts[1:])
    for p in parts[1:]:
        bmesh.ops.delete(bm, geom=p, context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    return dropped


def remesh(ob, quads):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    # a voxel remesh first gives QuadriFlow the closed manifold surface it needs (marching cubes can leave pinched
    # vertices); QuadriFlow occasionally gives up on a surface, so retry with a coarser voxel and another seed
    src = ob.data.copy()
    step = A.ORGANS.get(ob.name, {}).get('step', 0.0015)
    for attempt, (vs, seed) in enumerate(((0.8, 7), (1.0, 11), (1.2, 3), (1.5, 5))):
        if attempt:
            old = ob.data
            ob.data = src.copy()
            bpy.data.meshes.remove(old)
        ob.data.remesh_voxel_size = step * vs
        ob.data.use_remesh_fix_poles = True
        bpy.ops.object.voxel_remesh()
        keep_largest_part(ob)
        r = bpy.ops.object.quadriflow_remesh(target_faces=quads, use_mesh_symmetry=False, use_preserve_sharp=False,
                                             use_preserve_boundary=False, smooth_normals=False, seed=seed)
        if 'FINISHED' in r:
            break
        print(f'  quadriflow retry on {ob.name}', flush=True)
    else:
        # QuadriFlow refuses some high-genus surfaces (the packed bowel loops). Fall back to an all-quad voxel remesh
        # sized to the same face budget, then relax it.
        print(f'  {ob.name}: voxel quads instead of QuadriFlow', flush=True)
        old = ob.data
        ob.data = src.copy()
        bpy.data.meshes.remove(old)
        area = sum(p.area for p in ob.data.polygons)
        ob.data.remesh_voxel_size = (area / quads) ** 0.5
        ob.data.use_remesh_fix_poles = True
        bpy.ops.object.voxel_remesh()
        keep_largest_part(ob)
        m = ob.modifiers.new('relax', 'SMOOTH')
        m.factor = 0.5
        m.iterations = 4
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.meshes.remove(src)
    m = ob.modifiers.new('smooth', 'SMOOTH')
    m.factor = 0.5
    m.iterations = 3
    bpy.ops.object.modifier_apply(modifier=m.name)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True


def recentre(ob):
    """Put the object's origin at its bounding-box centre (a sensible pivot), geometry unchanged in the world."""
    co = np.array([v.co[:] for v in ob.data.vertices])
    c = 0.5 * (co.min(axis=0) + co.max(axis=0))
    for v in ob.data.vertices:
        v.co = (v.co[0] - c[0], v.co[1] - c[1], v.co[2] - c[2])
    ob.location = tuple(c)


def material(name, hexcol):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = srgb_hex(hexcol)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 1.0
    m.diffuse_color = srgb_hex(hexcol)
    return m


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ------------------------------------------------------------------------------------------------------------
# diaphragm, falciform line, umbilicus
# ------------------------------------------------------------------------------------------------------------

def _liver_interp():
    from scipy.interpolate import RegularGridInterpolator
    X, Y, Z, d = FIELDS['liver']
    return RegularGridInterpolator((X, Y, Z), d, bounds_error=False, fill_value=0.03)


def diaphragm_field():
    """A 3 mm sheet lying on the domes of the liver, stomach and spleen and under the heart; its back two thirds only
    (cut at a coronal plane), so in the frontal view it reads as the dome line without covering the front of the liver.
    Holes where the IVC, the esophagus and the aorta pass."""
    from scipy.ndimage import binary_dilation, binary_fill_holes, distance_transform_edt, gaussian_filter as gf
    from scipy.interpolate import RegularGridInterpolator
    h = 0.002
    X = np.arange(-0.165, 0.165, h)
    Y = np.arange(-0.075, 0.115, h)
    Z = np.arange(0.0, 0.215, h)
    G = np.stack(np.meshgrid(X, Y, Z, indexing='ij'), axis=-1).reshape(-1, 3)
    below = np.minimum(_liver_interp()(G), np.minimum(A.stomach_sdf(G), A.final_sdf_fn('spleen')(G)))
    below = below.reshape(len(X), len(Y), len(Z)) < 0
    heart = (np.minimum(A.heart_sdf(G), A.right_atrium_sdf(G)) < 0).reshape(below.shape)
    has = below.any(axis=2)
    zi = np.arange(len(Z))
    top = np.where(has, Z[np.max(np.where(below, zi[None, None, :], -1), axis=2).clip(0)], 0.0)
    hb = np.where(heart.any(axis=2), Z[np.min(np.where(heart, zi[None, None, :], 10 ** 6), axis=2).clip(0, len(Z) - 1)], 1.0)
    # fill gaps between the organs (normalised convolution), smooth, keep clear of the heart
    m = has.astype(float)
    sig = 0.008 / h
    D = gf(top * m, sig) / np.maximum(gf(m, sig), 1e-6)
    D = np.where(has, np.maximum(top, D), D)
    D = gf(D, 0.004 / h) + 0.0045
    D = np.minimum(D, gf(hb, 0.002 / h) - 0.003)
    mask = binary_fill_holes(binary_dilation(has, iterations=3))
    mask &= (Y[None, :] <= 0.072) & (Y[None, :] >= -0.060)
    inside = distance_transform_edt(mask) * h
    outside = distance_transform_edt(~mask) * h
    crop = gf(np.where(mask, -inside, outside), 1.5)
    gy, gx = np.gradient(D, h, h)
    slope = np.sqrt(1 + gx ** 2 + gy ** 2)
    Dz = RegularGridInterpolator((X, Y), D, bounds_error=False, fill_value=None)
    Cr = RegularGridInterpolator((X, Y), crop, bounds_error=False, fill_value=0.05)
    Sl = RegularGridInterpolator((X, Y), slope, bounds_error=False, fill_value=1.0)

    def f(P):
        xy = P[:, :2]
        d = np.abs(P[:, 2] - Dz(xy)) / Sl(xy) - 0.0015
        d = A.smax(d, Cr(xy) + 0.002, 0.002)
        vs = A.vessels_sdf(P, {'IVC_IS', 'IVCS_RA'}, 0.0015)
        d = A.ssub(d, vs, 0.0015)
        d = A.ssub(d, A.esophagus_sdf(P) - 0.0015, 0.0015)
        d = A.ssub(d, A.aorta_sdf(P) - 0.0015, 0.0015)
        return d
    return f


def build_diaphragm(root, groups):
    f = diaphragm_field()
    h = 0.0009
    X = np.arange(-0.165, 0.165, h)
    Y = np.arange(-0.07, 0.085, h)
    Z = np.arange(0.02, 0.20, h)
    d = np.empty((len(X), len(Y), len(Z)), dtype=np.float32)
    for i in range(0, len(X), 20):           # in slabs, to keep memory low
        G = np.stack(np.meshgrid(X[i:i + 20], Y, Z, indexing='ij'), axis=-1).reshape(-1, 3)
        d[i:i + 20] = f(G).reshape(-1, len(Y), len(Z))
    d[0], d[-1], d[:, 0], d[:, -1], d[:, :, 0], d[:, :, -1] = 0.03, 0.03, 0.03, 0.03, 0.03, 0.03
    verts, faces, _, _ = marching_cubes(d, 0.0, spacing=(h, h, h))
    verts += np.array([X[0], Y[0], Z[0]])
    ob = new_object('diaphragm', to_blender(verts), faces, root)
    keep_largest_part(ob)
    remesh(ob, 3000)
    return ob


def build_falciform(root):
    """The falciform ligament's line on the liver: a thin rounded ridge on the surface, from the umbilical notch up over the dome."""
    li = _liver_interp()
    pts = []
    for x, z in A.FALCIFORM:
        ys = np.arange(0.16, -0.02, -0.0004)
        P = np.stack([np.full_like(ys, x), ys, np.full_like(ys, z)], axis=1)
        dd = li(P)
        k = np.argmax(dd < 0)
        if dd[k] >= 0:
            continue
        if pts and abs(ys[k] - pts[-1][1]) > 0.02:
            break
        pts.append(A.v(x, ys[k] + 0.0004, z))
    dense, _ = A.catmull(pts, None, 0.003)
    cu = bpy.data.curves.new('falciform_ligament', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0014
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(dense) - 1)
    for i, p in enumerate(to_blender(dense)):
        sp.points[i].co = (*p, 1.0)
    tmp = bpy.data.objects.new('falciform_tmp', cu)
    root.objects.link(tmp)
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.name = 'falciform_ligament'
    ob = bpy.data.objects.new('falciform_ligament', me)
    root.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def build_umbilicus(root):
    """A small ring on the anterior abdominal wall (the abdominal wall itself is not drawn), facing forward."""
    bm = bmesh.new()
    R, r, nu, nv = 0.0075, 0.0028, 32, 12
    vs = []
    for i in range(nu):
        a = 2 * np.pi * i / nu
        row = []
        for j in range(nv):
            b = 2 * np.pi * j / nv
            # ring in the coronal plane (x, z), tube around it; V frame then to Blender
            p = A.UMBILICUS + A.v((R + r * np.cos(b)) * np.cos(a), r * np.sin(b), (R + r * np.cos(b)) * np.sin(a))
            row.append(bm.verts.new(tuple(to_blender(p))))
        vs.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((vs[i][j], vs[(i + 1) % nu][j], vs[(i + 1) % nu][(j + 1) % nv], vs[i][(j + 1) % nv]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('umbilicus')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('umbilicus', me)
    root.objects.link(ob)
    return ob


DIVE = {}


def build_dive_anchor(groups, root):
    """An empty on the right lobe's anterior surface where the camera dives into the lobule (the 2D app reads its lobule
    from the right lobe: RPV -> SIN_R -> CV_R -> RHV). Its extras carry the point and the outward normal."""
    li = _liver_interp()
    x, z = -0.090, 0.075          # segment VIII/V border region of the right lobe, between the right portal and right hepatic veins
    ys = np.arange(0.16, -0.02, -0.0003)
    P = np.stack([np.full_like(ys, x), ys, np.full_like(ys, z)], axis=1)
    k = int(np.argmax(li(P) < 0))
    p = A.v(x, ys[k], z)
    e = 0.001
    g = np.array([(li([p + A.v(*dv)])[0] - li([p - A.v(*dv)])[0]) / (2 * e) for dv in ((e, 0, 0), (0, e, 0), (0, 0, e))])
    nrm = g / np.linalg.norm(g)
    ob = bpy.data.objects.new('lobule_anchor', None)
    root.objects.link(ob)
    ob.location = tuple(to_blender(p))
    ob.parent = groups['cameras']
    pg = to_gltf(p)
    ng = np.array([nrm[0], nrm[2], nrm[1]])
    DIVE.update(point=[round(float(c), 5) for c in pg], normal=[round(float(c), 4) for c in ng], lobe='right',
                engine=dict(pv='RPV', sin='SIN_R', cv='CV_R', hv='RHV', q='SIN_RR', a='A_HR'),
                note='Dive target: the camera flies from `liver` along -normal to this point, then hands over to the lobule view')
    return ob


EXTRA_COLORS = {'diaphragm': '#A9776B', 'falciform_ligament': '#C9B39E', 'umbilicus': '#C4A58C'}


def extras_objects(root, groups, stats):
    for name, fn in (('diaphragm', lambda: build_diaphragm(root, groups)), ('falciform_ligament', lambda: build_falciform(root)),
                     ('umbilicus', lambda: build_umbilicus(root))):
        t = time.time()
        ob = fn()
        recentre(ob)
        ob.data.materials.append(material(name, EXTRA_COLORS[name]))
        ob.parent = groups['organs']
        stats[name] = dict(tris=tri_count(ob), quads=sum(1 for p in ob.data.polygons if len(p.vertices) == 4),
                           polys=len(ob.data.polygons), verts=len(ob.data.vertices), dropped=0)
        print(f'  {name:13s} {stats[name]["tris"]:6d} tris  {time.time() - t:5.1f}s', flush=True)
    build_dive_anchor(groups, root)


# ------------------------------------------------------------------------------------------------------------
# scene
# ------------------------------------------------------------------------------------------------------------

def build():
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    root = scene.collection

    groups = {}
    for g in ('organs', 'vessels', 'cameras'):
        e = bpy.data.objects.new(g, None)
        e.empty_display_size = 0.02
        root.objects.link(e)
        groups[g] = e

    nbfns = {n: A.final_sdf_fn(n) for n in A.ORGANS if n != 'liver'}
    nbfns['esophagus'] = A.esophagus_sdf
    stats = {}
    for name, spec in A.ORGANS.items():
        t = time.time()
        verts, faces = organ_field(name, nbfns)
        ob = new_object(name, to_blender(verts), faces, root)
        dropped = keep_largest_part(ob)
        remesh(ob, spec['quads'])
        dropped += keep_largest_part(ob)
        if name == 'liver':
            co = from_blender(np.array([v.co[:] for v in ob.data.vertices]))
            lobe = A.liver_lobe(co)
            at = ob.data.attributes.new('_LOBE', 'FLOAT', 'POINT')
            at.data.foreach_set('value', lobe.astype(np.float32))
        if name == 'stomach':
            co = from_blender(np.array([v.co[:] for v in ob.data.vertices]))
            at = ob.data.attributes.new('_ESOPHAGUS', 'FLOAT', 'POINT')
            at.data.foreach_set('value', A.esophagus_part(co))
        if name == 'colon':
            co = from_blender(np.array([v.co[:] for v in ob.data.vertices]))
            at = ob.data.attributes.new('_SEGMENT', 'FLOAT', 'POINT')
            at.data.foreach_set('value', A.colon_segment(co))
        recentre(ob)
        ob.data.materials.append(material(name, spec['color']))
        ob.parent = groups['organs']
        stats[name] = dict(tris=tri_count(ob), quads=sum(1 for p in ob.data.polygons if len(p.vertices) == 4),
                           polys=len(ob.data.polygons), verts=len(ob.data.vertices), dropped=dropped)
        print(f'  {name:13s} {stats[name]["tris"]:6d} tris  {time.time() - t:5.1f}s', flush=True)

    extras_objects(root, groups, stats)

    # body plate: flat torso silhouette in the coronal plane, facing forward
    C = A._closed_spline(A.PLATE, 160)
    bm = bmesh.new()
    vs = [bm.verts.new(tuple(to_blender(A.v(x, A.PLATE_Y, z)))) for x, z in C]
    edges = [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges, normal=(0, -1, 0))
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    me = bpy.data.meshes.new('body_plate')
    bm.to_mesh(me)
    bm.free()
    plate = bpy.data.objects.new('body_plate', me)
    root.objects.link(plate)
    plate.data.materials.append(material('body_plate', '#E8DFD0'))
    plate.parent = groups['organs']
    stats['body_plate'] = dict(tris=tri_count(plate), quads=0, polys=len(me.polygons), verts=len(me.vertices), dropped=0)

    # vessels: one poly curve per engine edge ID, radius on every point
    V = A.vessels()
    vjson = []
    for vs in V:
        pts, rr = A.vessel_tube(vs, 0.005)
        cu = bpy.data.curves.new(vs['id'], 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = 1.0          # tube radius = the point radius (for viewing in Blender)
        cu.bevel_resolution = 2
        cu.use_fill_caps = True
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        B = to_blender(pts)
        for i, (p, r) in enumerate(zip(B, rr)):
            sp.points[i].co = (p[0], p[1], p[2], 1.0)
            sp.points[i].radius = float(r)
        ob = bpy.data.objects.new(vs['id'], cu)
        root.objects.link(ob)
        ob.parent = groups['vessels']
        ob['from'] = vs['frm']
        ob['to'] = vs['to']
        ob['group'] = vs['group']
        ob['label'] = vs['label']
        g = to_gltf(pts)
        vjson.append(dict(id=vs['id'], label=vs['label'], group=vs['group'], **{'from': vs['frm'], 'to': vs['to']},
                          points=[[round(float(c), 5) for c in p] for p in g], radii=[round(float(r), 5) for r in rr],
                          control=[[round(float(c), 5) for c in p] for p in to_gltf(np.array(vs['points']))],
                          controlRadii=[round(float(r), 5) for r in vs['radii']]))

    # cameras
    cams = {}
    for cname, c in A.CAMERAS.items():
        yaw, pitch = np.radians(c['yaw']), np.radians(c['pitch'])
        # V frame: camera in front (+y), yaw toward the patient's left (+x), pitch from above (+z)
        off = A.v(np.sin(yaw) * np.cos(pitch), np.cos(yaw) * np.cos(pitch), np.sin(pitch)) * c['dist']
        pos = c['target'] + off
        cd = bpy.data.cameras.new(cname)
        cd.sensor_fit = 'VERTICAL'
        cd.angle_y = np.radians(A.CAM_FOV_Y)
        cd.clip_start = 0.01
        cd.clip_end = 10.0
        co = bpy.data.objects.new('camera_' + cname, cd)
        root.objects.link(co)
        co.location = tuple(to_blender(pos))
        d = to_blender(c['target']) - to_blender(pos)
        import mathutils
        co.rotation_euler = mathutils.Vector(tuple(d)).to_track_quat('-Z', 'Y').to_euler()
        co.parent = groups['cameras']
        co['shot'] = cname
        co['target'] = [float(x) for x in to_gltf(c['target'])]
        cams[cname] = dict(position=[round(float(x), 5) for x in to_gltf(pos)], target=[round(float(x), 5) for x in to_gltf(c['target'])],
                           fovY=A.CAM_FOV_Y, note=c['note'])
    scene.camera = bpy.data.objects['camera_body']

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    print(f'saved {OUT_BLEND}')

    # export: curves are not glTF; replace each with an empty of the same name (points go into node extras below)
    for vs in V:
        ob = bpy.data.objects[vs['id']]
        cu = ob.data
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        e = bpy.data.objects.new(vs['id'], None)
        root.objects.link(e)
        e.parent = groups['vessels']
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_yup=True, export_apply=True,
                              export_extras=False, export_cameras=True, export_lights=False, export_attributes=True,
                              export_normals=True, export_texcoords=False, export_materials='EXPORT',
                              export_animations=False, export_skins=False, export_morph=False)
    node_pos = {k: [round(float(c), 5) for c in to_gltf(p)] for k, p in A.N.items()}
    node_pos['AO'] = node_pos.pop('AO_CELIAC')
    meta = dict(units='metres', axes='+X patient left, +Y superior, +Z anterior (frontal view looks along -Z)',
                origin='portal confluence (engine node CONF)', stage=1, version=1)
    patch_glb(OUT_GLB, vjson, cams, node_pos, meta)
    with open(OUT_JSON, 'w') as f:
        json.dump(dict(meta, nodes=node_pos, vessels=vjson, cameras=cams, lobuleAnchor=DIVE), f, indent=1)
    total = sum(s['tris'] for s in stats.values())
    print(json.dumps(dict(stats=stats, total_tris=total), indent=1))
    print(f'done in {time.time() - t0:.0f}s')
    with open(os.path.join(HERE, 'stage1-stats.json'), 'w') as f:
        json.dump(dict(stats=stats, total_tris=total), f, indent=1)


def patch_glb(path, vjson, cams, node_pos, meta):
    """Write vessel centrelines, camera targets and scene facts into the glTF JSON as extras."""
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    jlen, jtype = struct.unpack_from('<II', data, 12)
    js = json.loads(data[20:20 + jlen].decode('utf-8'))
    rest = data[20 + jlen:]
    byname = {n.get('name'): n for n in js['nodes']}
    for vs in vjson:
        n = byname[vs['id']]
        n['extras'] = dict(vessel=True, label=vs['label'], group=vs['group'], **{'from': vs['from'], 'to': vs['to']},
                           points=vs['points'], radii=vs['radii'])
    for cname, c in cams.items():
        byname['camera_' + cname]['extras'] = dict(shot=cname, target=c['target'], note=c['note'])
    byname['lobule_anchor']['extras'] = dict(DIVE)
    js['scenes'][0]['extras'] = dict(meta, nodes=node_pos)
    js['asset']['extras'] = dict(title='Portal circulation anatomy, stage 1 (style frame)')
    out = json.dumps(js, separators=(',', ':')).encode('utf-8')
    out += b' ' * ((4 - len(out) % 4) % 4)
    total = 12 + 8 + len(out) + len(rest)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', magic, ver, total))
        f.write(struct.pack('<II', len(out), jtype))
        f.write(out)
        f.write(rest)


if __name__ == '__main__':
    build()
