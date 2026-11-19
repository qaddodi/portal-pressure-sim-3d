"""Review stills of stage 1, rendered offline with Blender Cycles on the CPU (no browser, no GPU).

The look approximates the app's shader (look-and-feel.md section 2, the mocks' toon shader): one fixed light from the upper
left front, 3 flat bands on organs and 2 on vessels (round(d * bands) / bands between the shadow tone and the base colour),
a thin rim on the lit side, a hard specular dot on vessels, and an ink hull pushed out by a width in screen pixels.
Light look colours. Some views make the organs in front of the portal system see-through ("ghost") so the veins read.

Run:  python render_stage1.py [outdir] [view ...]
"""
import math
import os
import sys

import bpy
import bmesh
import mathutils

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, 'body-stage1.blend')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/rebuild-3d/artist-stage1'
ONLY = set(sys.argv[2:])

W, H = 1600, 1000
LIGHT = mathutils.Vector((-0.45, -0.55, 0.75)).normalized()     # three.js (-0.45, 0.75, 0.55) in Blender axes
INK = '#3B2C22'
BG = '#F1EBE0'
SHADE = 0.62
COL = {'liver': '#905B49', 'spleen': '#7A5F78', 'stomach': '#A67A6C', 'esophagus': '#A67A6C', 'duodenum': '#AF826E',
       'small_bowel': '#AF826E', 'colon': '#B08A74', 'pancreas': '#C49C76', 'gallbladder': '#8E8A56', 'kidney_left': '#9C6A5E',
       'kidney_right': '#9C6A5E', 'heart': '#9D575C', 'right_atrium': '#A8636A', 'aorta': '#B5473A', 'body_plate': '#E8DFD0', 'appendix': '#B08A74',
       'diaphragm': '#A9776B', 'falciform_ligament': '#C9B39E', 'umbilicus': '#C4A58C',
       'portal': '#B8326F', 'systemic': '#3F7FCB', 'artery': '#C0533F'}
INK_PX = {'falciform_ligament': 0.9, 'umbilicus': 1.1, 'appendix': 1.2, 'liver': 1.8, 'spleen': 1.8, 'stomach': 1.5, 'small_bowel': 1.5, 'colon': 1.5, 'heart': 1.5, 'right_atrium': 1.5}
VESSEL_PX = 1.2
DEFAULT_PX = 1.5


def hex3(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def toon_material(name, base, bands, spec, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    n = nt.nodes.new
    L = nt.links.new
    geo = n('ShaderNodeNewGeometry')
    lv = n('ShaderNodeCombineXYZ'); lv.inputs[0].default_value, lv.inputs[1].default_value, lv.inputs[2].default_value = LIGHT
    dot = n('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    L(geo.outputs['Normal'], dot.inputs[0]); L(lv.outputs[0], dot.inputs[1])
    d = n('ShaderNodeMath'); d.operation = 'MULTIPLY_ADD'; d.inputs[1].default_value = 0.5; d.inputs[2].default_value = 0.5
    L(dot.outputs['Value'], d.inputs[0])
    q = n('ShaderNodeMath'); q.operation = 'MULTIPLY'; q.inputs[1].default_value = bands; L(d.outputs[0], q.inputs[0])
    r = n('ShaderNodeMath'); r.operation = 'ROUND'; L(q.outputs[0], r.inputs[0])
    b = n('ShaderNodeMath'); b.operation = 'DIVIDE'; b.inputs[1].default_value = bands; b.use_clamp = True; L(r.outputs[0], b.inputs[0])
    c = hex3(base)
    ink = hex3(INK)
    sh = [c[i] * SHADE * 0.92 + ink[i] * 0.08 for i in range(3)]
    mix = n('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*sh, 1); mix.inputs['B'].default_value = (*c, 1)
    L(b.outputs[0], mix.inputs['Factor'])
    # rim: thin, lit side only
    ndv = n('ShaderNodeVectorMath'); ndv.operation = 'DOT_PRODUCT'
    L(geo.outputs['Normal'], ndv.inputs[0]); L(geo.outputs['Incoming'], ndv.inputs[1])
    one = n('ShaderNodeMath'); one.operation = 'SUBTRACT'; one.inputs[0].default_value = 1.0; L(ndv.outputs['Value'], one.inputs[1])
    rim = n('ShaderNodeMath'); rim.operation = 'GREATER_THAN'; rim.inputs[1].default_value = 0.70; L(one.outputs[0], rim.inputs[0])
    lit = n('ShaderNodeMath'); lit.operation = 'GREATER_THAN'; lit.inputs[1].default_value = 0.5; L(d.outputs[0], lit.inputs[0])
    rl = n('ShaderNodeMath'); rl.operation = 'MULTIPLY'; L(rim.outputs[0], rl.inputs[0]); L(lit.outputs[0], rl.inputs[1])
    rimv = n('ShaderNodeMath'); rimv.operation = 'MULTIPLY'; rimv.inputs[1].default_value = 0.10; L(rl.outputs[0], rimv.inputs[0])
    add = rimv
    if spec:
        negl = n('ShaderNodeCombineXYZ'); negl.inputs[0].default_value, negl.inputs[1].default_value, negl.inputs[2].default_value = -LIGHT
        refl = n('ShaderNodeVectorMath'); refl.operation = 'REFLECT'; L(negl.outputs[0], refl.inputs[0]); L(geo.outputs['Normal'], refl.inputs[1])
        rv = n('ShaderNodeVectorMath'); rv.operation = 'DOT_PRODUCT'; L(refl.outputs[0], rv.inputs[0]); L(geo.outputs['Incoming'], rv.inputs[1])
        sp = n('ShaderNodeMath'); sp.operation = 'GREATER_THAN'; sp.inputs[1].default_value = 0.967; L(rv.outputs['Value'], sp.inputs[0])
        spv = n('ShaderNodeMath'); spv.operation = 'MULTIPLY_ADD'; spv.inputs[1].default_value = 0.32; L(sp.outputs[0], spv.inputs[0]); L(rimv.outputs[0], spv.inputs[2])
        add = spv
    tot = n('ShaderNodeVectorMath'); tot.operation = 'ADD'; L(mix.outputs['Result'], tot.inputs[0]); L(add.outputs[0], tot.inputs[1])
    gam = n('ShaderNodeGamma'); gam.inputs['Gamma'].default_value = 2.2; L(tot.outputs['Vector'], gam.inputs['Color'])
    em = n('ShaderNodeEmission'); L(gam.outputs[0], em.inputs['Color'])
    out = n('ShaderNodeOutputMaterial')
    if alpha < 1.0:
        tr = n('ShaderNodeBsdfTransparent')
        ms = n('ShaderNodeMixShader'); ms.inputs['Fac'].default_value = alpha
        L(tr.outputs[0], ms.inputs[1]); L(em.outputs[0], ms.inputs[2]); L(ms.outputs[0], out.inputs['Surface'])
    else:
        L(em.outputs[0], out.inputs['Surface'])
    return m


def flat_material(name, hexcol):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    rgb = nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*hex3(hexcol), 1)
    gam = nt.nodes.new('ShaderNodeGamma'); gam.inputs['Gamma'].default_value = 2.2
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(rgb.outputs[0], gam.inputs[0]); nt.links.new(gam.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
    return m


def ink_material(name, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    n = nt.nodes.new
    geo = n('ShaderNodeNewGeometry')
    rgb = n('ShaderNodeRGB'); rgb.outputs[0].default_value = (*hex3(INK), 1)
    gam = n('ShaderNodeGamma'); gam.inputs['Gamma'].default_value = 2.2
    em = n('ShaderNodeEmission')
    tr = n('ShaderNodeBsdfTransparent')
    ms = n('ShaderNodeMixShader')
    out = n('ShaderNodeOutputMaterial')
    L = nt.links.new
    L(rgb.outputs[0], gam.inputs[0]); L(gam.outputs[0], em.inputs[0])
    if alpha < 1.0:
        fa = n('ShaderNodeMath'); fa.operation = 'MAXIMUM'; fa.inputs[1].default_value = 1 - alpha
        L(geo.outputs['Backfacing'], fa.inputs[0]); L(fa.outputs[0], ms.inputs['Fac'])
    else:
        L(geo.outputs['Backfacing'], ms.inputs['Fac'])
    L(em.outputs[0], ms.inputs[1]); L(tr.outputs[0], ms.inputs[2]); L(ms.outputs[0], out.inputs[0])
    return m


def world_mesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    me.transform(ob.matrix_world)
    return me


def hull(me_src, t, name):
    bm = bmesh.new()
    bm.from_mesh(me_src)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * t
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def setup():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 20
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.cycles.transparent_max_bounces = 64
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    world = bpy.data.worlds.new('bg')
    world.use_nodes = True
    bgn = world.node_tree.nodes['Background']
    bgn.inputs['Color'].default_value = (*[x ** 2.2 for x in hex3(BG)], 1)
    sc.world = world
    # solid meshes (world space) for every organ and every vessel tube
    solids = {}
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH':
            solids[ob.name] = dict(me=world_mesh(ob), kind='organ')
        elif ob.type == 'CURVE':
            solids[ob.name] = dict(me=world_mesh(ob), kind='vessel', group=ob['group'])
    cams = {o['shot']: o for o in bpy.data.objects if o.type == 'CAMERA'}
    for ob in list(bpy.data.objects):
        if ob.type in ('MESH', 'CURVE'):
            bpy.data.objects.remove(ob)
    return sc, solids, cams


def place(sc, solids, cam, dist, ghost):
    # clear previous view
    for ob in list(bpy.data.objects):
        if ob.get('_view'):
            bpy.data.objects.remove(ob)
    mpp = 2 * dist * math.tan(cam.data.angle_y / 2) / H      # metres per pixel at the subject
    for name, s in solids.items():
        a = ghost.get(name, ghost.get(s.get('group', ''), 1.0)) if ghost else 1.0
        if name == 'body_plate':
            mat = flat_material('m_' + name, COL['body_plate'])
            ob = bpy.data.objects.new('v_' + name, s['me']); ob.data.materials.clear(); ob.data.materials.append(mat)
            ob['_view'] = 1; sc.collection.objects.link(ob)
            continue
        if s['kind'] == 'vessel':
            mat = toon_material('m_' + name, COL[s['group']], 2, True, a)
            px = VESSEL_PX
        else:
            mat = toon_material('m_' + name, COL.get(name, '#A08070'), 3, False, a)
            px = INK_PX.get(name, DEFAULT_PX)
        ob = bpy.data.objects.new('v_' + name, s['me'])
        ob.data.materials.clear(); ob.data.materials.append(mat)
        ob['_view'] = 1; sc.collection.objects.link(ob)
        hm = hull(s['me'], px * mpp, 'h_' + name)
        hm.materials.append(ink_material('i_' + name, min(1.0, a * 1.3)))
        ho = bpy.data.objects.new('h_' + name, hm)
        ho['_view'] = 1; sc.collection.objects.link(ho)


def orbit_camera(sc, base, yaw_deg, pitch_deg=None, dist=None, target=None):
    tgt = mathutils.Vector(target or (base['target'][0], -base['target'][2], base['target'][1]))
    off = base.location - tgt
    r = dist or off.length
    yaw0 = math.atan2(off.x, -off.y)
    pitch0 = math.asin(off.z / off.length)
    yaw = yaw0 + math.radians(yaw_deg)
    pitch = pitch0 if pitch_deg is None else math.radians(pitch_deg)
    pos = tgt + mathutils.Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch))) * r
    for ob in list(bpy.data.objects):
        if ob.get('_cam'):
            bpy.data.objects.remove(ob)
    cd = base.data.copy()
    co = bpy.data.objects.new('cam_tmp', cd)
    co['_cam'] = 1
    sc.collection.objects.link(co)
    co.location = pos
    co.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    return co, r


GHOST_PORTAL = {'diaphragm': 0.35, 'falciform_ligament': 0.3, 'umbilicus': 0.4, 'appendix': 0.3, 'liver': 0.28, 'stomach': 0.18, 'esophagus': 0.35, 'colon': 0.2, 'small_bowel': 0.2, 'duodenum': 0.35,
                'pancreas': 0.3, 'gallbladder': 0.4, 'heart': 0.6, 'right_atrium': 0.6}
GHOST_LIVER = {'diaphragm': 0.5, 'falciform_ligament': 0.4, 'liver': 0.32, 'gallbladder': 0.5, 'stomach': 0.45, 'colon': 0.45, 'duodenum': 0.5}
GHOST_ALL = {k: 0.22 for k in COL if k not in ('portal', 'systemic', 'artery', 'body_plate')}

VIEWS = [
    # name, camera shot, yaw offset (deg, + toward the patient's left), pitch override, ghost
    ('01-body-frontal', 'body', 0, None, None),
    ('02-body-frontal-veins', 'body', 0, None, GHOST_PORTAL),
    ('03-body-orbit25', 'body', 25, None, None),
    ('04-body-orbit25-veins', 'body', 25, None, GHOST_PORTAL),
    ('05-portal', 'portal', 0, None, GHOST_PORTAL),
    ('06-liver', 'liver', 0, None, None),
    ('07-liver-veins', 'liver', 0, None, GHOST_LIVER),
    ('08-check-right-lateral', 'body', -90, 0, GHOST_ALL),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    sc, solids, cams = setup()
    for name, shot, yaw, pitch, ghost in VIEWS:
        if ONLY and name not in ONLY:
            continue
        base = cams[shot]
        cam, dist = orbit_camera(sc, base, yaw, pitch)
        sc.camera = cam
        place(sc, solids, cam, dist, ghost)
        sc.cycles.samples = 64 if ghost else 20
        sc.render.filepath = os.path.join(OUT, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('wrote', sc.render.filepath, flush=True)


if __name__ == '__main__':
    main()
