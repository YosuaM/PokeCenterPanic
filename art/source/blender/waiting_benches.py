"""Original four-seat waiting sofa; the runtime places two copies.

Ground-center origin; Blender -Y faces the camera, staff reach seats from behind (+Y).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common as c  # noqa: E402

BENCH = {'width': 240, 'height': 76}
WIDTH = BENCH['width'] / c.TILE
DEPTH = BENCH['height'] / c.TILE
HALF_W, HALF_D = WIDTH / 2, DEPTH / 2
SEATS = [(-120 + 39 + index * 54) / c.TILE for index in range(4)]
SEAT_Y = 6 / c.TILE
SEAT_TOP = 0.5

scene = c.reset_scene()
parts = c.asset_collection(scene, 'WaitingBenches - Editable Parts')
M = {
    'leg': c.material('SofaLeg', 'wood', 0.6),
    'frame': c.material('SofaFrame', 'cream', 0.6),
    'cushion': c.material('SofaLavender', 'lavender', 0.85),
    'back': c.material('SofaLavenderDeep', 'lavenderDeep', 0.85),
    'piping': c.material('SofaPiping', 'coral', 0.6),
    'pillow': c.material('SofaPillow', 'coralLight', 0.85),
    'plate': c.material('SofaPlate', 'white', 0.4),
}

frame_depth = DEPTH - 0.06
c.box(parts, 'Plinth', (0, 0, 0.1), (WIDTH - 0.3, frame_depth - 0.2, 0.06), M['leg'], bevel=0.02)
for sx in (-1, 1):
    for sy in (-1, 1):
        c.cylinder(parts, f'Leg{sx}{sy}', (sx * (HALF_W - 0.3), sy * (HALF_D - 0.18), 0.06), 0.06, 0.12, M['leg'], 12)
c.box(parts, 'SeatFrame', (0, -0.02, 0.24), (WIDTH - 0.3, frame_depth - 0.04, 0.22), M['frame'], bevel=0.05)
c.box(parts, 'FrontPiping', (0, -HALF_D + 0.05, 0.3), (WIDTH - 0.36, 0.04, 0.05), M['piping'], bevel=0.015)
for index, x in enumerate(SEATS):
    c.box(parts, f'SeatCushion{index}', (x, -SEAT_Y - 0.06, SEAT_TOP - 0.075), (1.06, 1.0, 0.15), M['cushion'],
          bevel=0.07)
    c.box(parts, f'BackCushion{index}', (x, HALF_D - 0.2, 0.62), (1.04, 0.24, 0.42), M['back'], bevel=0.09)
    c.box(parts, f'WaitingGlow{index + 1}', (x, -HALF_D + 0.035, 0.2), (0.32, 0.03, 0.07),
          c.material(f'SeatLight{index + 1}', (0.48, 0.72, 0.67), 0.3, emission=(0.48, 0.72, 0.67), strength=0.4),
          bevel=0.012)
    c.box(parts, f'SeatPlate{index}', (x, -HALF_D + 0.03, 0.2), (0.4, 0.02, 0.11), M['plate'], bevel=0.01)
c.box(parts, 'BackShell', (0, HALF_D - 0.06, 0.55), (WIDTH - 0.3, 0.1, 0.7), M['frame'], bevel=0.04)
c.box(parts, 'BackPiping', (0, HALF_D - 0.07, 0.9), (WIDTH - 0.28, 0.1, 0.05), M['piping'], bevel=0.02)
for side in (-1, 1):
    x = side * (HALF_W - 0.13)
    c.box(parts, f'Arm{side}', (x, 0, 0.4), (0.24, frame_depth, 0.56), M['frame'], bevel=0.08)
    c.box(parts, f'ArmPad{side}', (x, 0, 0.69), (0.26, frame_depth - 0.1, 0.07), M['piping'], bevel=0.03)
    c.box(parts, f'Pillow{side}', (side * (HALF_W - 0.4), HALF_D - 0.42, 0.66), (0.08, 0.3, 0.3), M['pillow'],
          bevel=0.04)

anchors = [(f'WaitingAnchor{index + 1}', (x, SEAT_Y, SEAT_TOP)) for index, x in enumerate(SEATS)]
editable = c.editable_count(parts)
stats = c.export_asset(scene, parts, 'WaitingBenches', {f'WaitingGlow{i}' for i in range(1, 5)},
                       'apps/client/public/assets/original/models/waiting-benches.glb', anchors)
c.studio(scene, (0, 0, 0.4), 8, height_angle=0.55, yaw=-0.5)
c.render_preview(scene, 'art/previews/waiting-benches.png')
c.save_source('art/source/waiting-benches.blend')
c.write_manifest('art/source/waiting-benches.json', {
    'id': 'waiting-benches',
    'source': 'art/source/waiting-benches.blend',
    'generator': 'art/source/blender/waiting_benches.py',
    'runtime': 'apps/client/public/assets/original/models/waiting-benches.glb',
    'preview': 'art/previews/waiting-benches.png',
    'status': 'integrated-3d-runtime',
    'origin': 'original-project-geometry',
    'externalResources': [],
    'blenderVersion': '5.2.2 LTS',
    'editableMeshes': editable,
    'mapTilePixels': c.TILE,
    'root': 'WaitingBenches',
    'runtimeUpAxis': '+Y',
    'runtimeFrontAxis': '+Z',
    'originPlacement': 'ground-center',
    'patientSurfaceHeight': SEAT_TOP,
    'runtimeMeshes': stats['meshes'],
    'runtimeMaterials': stats['materials'],
    'runtimeTriangles': stats['triangles'],
    'runtimeBytes': stats['bytes'],
    'anchors': [name for name, _ in anchors],
    'stateNodes': [f'WaitingGlow{i}' for i in range(1, 5)],
    'exportNotes': 'Four-seat lavender sofa with individual cushions, padded back, cream arms, coral piping, '
                   'wooden legs and one seat light per place. Studio excluded.',
})
print('SOFA_STATS', stats, 'editable', editable)
