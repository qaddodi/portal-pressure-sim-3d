"""Fast check of the delivered stage 1 files (plain Python, seconds): names, budgets, joins, engine IDs.
Run: python3 art/anatomy/check_stage1.py [path/to/hales-engine/src/portal/topology.js]
Exits non-zero with the reasons when something is off."""
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
GLB = os.path.join(HERE, 'body-stage1.glb')
VJS = os.path.join(REPO, 'public', 'anatomy', 'vessels.json')
TOPO = sys.argv[1] if len(sys.argv) > 1 else '/workspace/hales-engine/src/portal/topology.js'

ORGANS = ['liver', 'gallbladder', 'spleen', 'stomach', 'duodenum', 'pancreas', 'small_bowel', 'appendix', 'colon',
          'kidney_left', 'kidney_right', 'heart', 'right_atrium', 'aorta', 'diaphragm', 'falciform_ligament', 'umbilicus',
          'body_plate']
STAGE1 = ['SMV_CONF', 'V_SPL', 'SV_MID', 'SV_CONF', 'LGV_CONF', 'PV_TRUNK', 'PVH_R', 'PVH_L', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC',
          'IVC_IS', 'IVCS_RA', 'LRV_IVC', 'RRV_IVC', 'A_HEP', 'A_HR', 'A_HL']
CAMERAS = ['body', 'portal', 'liver']

errors = []


def err(msg):
    errors.append(msg)


with open(GLB, 'rb') as f:
    data = f.read()
magic, ver, length = struct.unpack_from('<III', data, 0)
if magic != 0x46546C67 or ver != 2 or length != len(data):
    err('not a valid glTF 2.0 binary')
jlen, _ = struct.unpack_from('<II', data, 12)
js = json.loads(data[20:20 + jlen])
nodes = {n.get('name'): n for n in js['nodes']}

# organs and triangle budgets
tris = {}
for name in ORGANS:
    n = nodes.get(name)
    if not n or 'mesh' not in n:
        err(f'missing organ mesh {name}')
        continue
    t = 0
    for p in js['meshes'][n['mesh']]['primitives']:
        if p.get('mode', 4) != 4:
            err(f'{name}: primitive is not triangles')
        t += js['accessors'][p['indices']]['count'] // 3
        if 'NORMAL' not in p['attributes']:
            err(f'{name}: no normals')
    tris[name] = t
total = sum(tris.values())
if total >= 150000:
    err(f'body over budget: {total} triangles')
if tris.get('liver', 0) >= 30000:
    err(f'liver over budget: {tris["liver"]} triangles')
if js.get('images') or js.get('textures'):
    err('file has textures or images')

# cameras
cam_names = [c.get('name') for c in js.get('cameras', [])]
for c in CAMERAS:
    if c not in cam_names:
        err(f'missing camera {c}')
    if 'camera_' + c not in nodes:
        err(f'missing camera node camera_{c}')

# vessels in the glb and the sidecar
with open(VJS) as f:
    side = json.load(f)
sv = {v['id']: v for v in side['vessels']}
for vid in STAGE1:
    if vid not in sv:
        err(f'vessels.json lacks {vid}')
for vid, v in sv.items():
    n = nodes.get(vid)
    if not n or not n.get('extras', {}).get('vessel'):
        err(f'{vid}: no vessel node with extras in the glb')
        continue
    ex = n['extras']
    if ex['points'] != v['points'] or ex['radii'] != v['radii']:
        err(f'{vid}: glb extras and vessels.json differ')
    if len(v['points']) < 2 or len(v['points']) != len(v['radii']):
        err(f'{vid}: points and radii do not pair up')
    if min(v['radii']) <= 0:
        err(f'{vid}: a radius is not positive')

# joins: every vessel end named by an engine node sits exactly on that node's point
ends = {}
for vid, v in sv.items():
    ends.setdefault(v['from'], []).append((vid, 'start', v['points'][0]))
    ends.setdefault(v['to'], []).append((vid, 'end', v['points'][-1]))
for node, lst in ends.items():
    pts = {tuple(p) for _, _, p in lst}
    if len(lst) > 1 and len(pts) > 1:
        err(f'join {node} does not meet at one point: {lst}')
    if node in side['nodes'] and len(lst) > 1 and tuple(side['nodes'][node]) not in pts:
        err(f'join {node} is not at the node point {side["nodes"][node]}')

# engine IDs
engine_ids = set()
if os.path.exists(TOPO):
    src = open(TOPO).read()
    engine_ids = set(re.findall(r"\{ id: '([A-Za-z0-9_]+)'", src))
    for vid, v in sv.items():
        if vid not in engine_ids:
            err(f'{vid} is not an edge in the engine topology')
        else:
            m = re.search(r"\{ id: '" + vid + r"', from: '([A-Z_0-9]+)', to: '([A-Z_0-9]+)'", src)
            if m and (m.group(1), m.group(2)) != (v['from'], v['to']):
                err(f'{vid}: from/to {v["from"]}->{v["to"]} but the engine has {m.group(1)}->{m.group(2)}')
else:
    print(f'(engine topology not found at {TOPO}; ID check skipped)')

print(f'organs: {len(tris)}  triangles: {total}  (liver {tris.get("liver")})')
print('per organ:', ', '.join(f'{k} {v}' for k, v in tris.items()))
print(f'vessels: {len(sv)}  ({", ".join(sv)})')
print(f'cameras: {cam_names}')
if errors:
    print('\nFAIL')
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK')
