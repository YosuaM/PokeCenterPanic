"""Original recovery bay: bed with headboard, blanket, bedside monitor and drip stand.

Ground-center origin at the shared recovery footprint; Blender -Y faces the lobby.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common as c  # noqa: E402

WIDTH = 240 / c.TILE
DEPTH = 76 / c.TILE
HALF_W, HALF_D = WIDTH / 2, DEPTH / 2
ANCHOR = (-6 / c.TILE, 6 / c.TILE, 0.57)
BED_LEFT, BED_RIGHT = -HALF_W + 0.12, 1.62

scene = c.reset_scene()
parts = c.asset_collection(scene, 'RecoveryArea - Editable Parts')
M = {
    'wheel': c.material('BedWheel', 'navy', 0.7),
    'frame': c.material('BedFrame', 'teal', 0.55),
    'side': c.material('BedSide', 'cream', 0.6),
    'stripe': c.material('BedStripe', 'coral', 0.55),
    'mattress': c.material('MintCushion', 'mint', 0.8),
    'blanket': c.material('Blanket', 'coralLight', 0.9),
    'pillow': c.material('Pillow', 'white', 0.85),
    'metal': c.material('Chrome', (0.8, 0.84, 0.86), 0.3, metallic=0.6),
    'bag': c.material('DripBag', (0.8, 0.93, 0.95), 0.2),
    'screen': c.material('MonitorBody', 'tealDark', 0.4),
    'heart': c.material('HeartEmblem', 'red', 0.5),
}

mid = (BED_LEFT + BED_RIGHT) / 2
length = BED_RIGHT - BED_LEFT
for x in (BED_LEFT + 0.25, BED_RIGHT - 0.25):
    for y in (-HALF_D + 0.25, HALF_D - 0.25):
        c.cylinder(parts, f'Wheel{x:.1f}{y:.1f}', (x, y, 0.07), 0.07, 0.08, M['wheel'], 12, axis='X')
c.box(parts, 'BedChassis', (mid, 0, 0.2), (length, DEPTH - 0.2, 0.16), M['frame'], bevel=0.05)
c.box(parts, 'BedSidePanel', (mid, 0, 0.34), (length, DEPTH - 0.14, 0.14), M['side'], bevel=0.05)
c.box(parts, 'BedStripe', (mid, -HALF_D + 0.06, 0.34), (length - 0.1, 0.03, 0.05), M['stripe'], bevel=0.01)
c.box(parts, 'MintCushion', (mid - 0.02, ANCHOR[1] - 0.06, 0.49), (length - 0.12, DEPTH - 0.36, 0.16), M['mattress'],
      bevel=0.06)
c.box(parts, 'BlanketFold', (BED_LEFT + 0.75, ANCHOR[1] - 0.06, 0.59), (1.15, DEPTH - 0.3, 0.05), M['blanket'],
      bevel=0.025)
for index, offset in enumerate((-0.3, 0.0, 0.3)):
    c.box(parts, f'BlanketStripe{index}', (BED_LEFT + 0.75 + offset, ANCHOR[1] - 0.06, 0.615), (0.06, DEPTH - 0.3, 0.01),
          M['side'], bevel=0)
c.box(parts, 'Pillow', (BED_RIGHT - 0.42, ANCHOR[1] - 0.06, 0.6), (0.5, 0.75, 0.12), M['pillow'], bevel=0.05)
# Headboard against the wall end with a heart emblem facing the room.
c.box(parts, 'Headboard', (BED_RIGHT + 0.03, 0, 0.62), (0.12, DEPTH - 0.18, 0.86), M['side'], bevel=0.05)
c.box(parts, 'HeadboardCap', (BED_RIGHT + 0.03, 0, 1.07), (0.18, DEPTH - 0.12, 0.08), M['stripe'], bevel=0.03)
for dx in (-0.09, 0.09):
    c.sphere(parts, f'Heart{dx}', (BED_RIGHT - 0.04, -0.2 + dx * 0.9, 0.8), 0.1, M['heart'], 12, 8, (0.4, 1, 1))
c.cone(parts, 'HeartTip', (BED_RIGHT - 0.04, -0.2, 0.7), 0.15, 0.0, 0.18, M['heart'], 4).rotation_euler = (3.14159, 0, 0.785)
c.box(parts, 'Footboard', (BED_LEFT + 0.03, 0, 0.5), (0.1, DEPTH - 0.18, 0.46), M['side'], bevel=0.04)

# Bedside cabinet with the state monitor; the drip stand sits behind it near the wall.
cab_x = (BED_RIGHT + 0.12 + HALF_W - 0.04) / 2
cab_w = HALF_W - 0.04 - (BED_RIGHT + 0.12)
c.box(parts, 'Cabinet', (cab_x, -0.1, 0.3), (cab_w, 0.7, 0.6), M['side'], bevel=0.05)
c.box(parts, 'CabinetTop', (cab_x, -0.1, 0.62), (cab_w + 0.04, 0.74, 0.05), M['frame'], bevel=0.02)
c.box(parts, 'StatusGlow', (cab_x, -0.47, 0.42), (0.36, 0.03, 0.08),
      c.material('RecoveryStatusLight', (0.48, 0.72, 0.67), 0.3, emission=(0.48, 0.72, 0.67), strength=0.4), bevel=0.01)
c.box(parts, 'MonitorStand', (cab_x, -0.05, 0.72), (0.08, 0.08, 0.16), M['metal'], bevel=0.01)
c.box(parts, 'Monitor', (cab_x, -0.08, 0.92), (cab_w - 0.06, 0.1, 0.36), M['screen'], bevel=0.04)
c.box(parts, 'ScreenTrace', (cab_x, -0.14, 0.92), (cab_w - 0.2, 0.02, 0.05),
      c.material('RecoveryTrace', (0.48, 0.72, 0.67), 0.3, emission=(0.48, 0.72, 0.67), strength=0.6), bevel=0)
c.box(parts, 'ReadyMark', (cab_x, -0.145, 0.92), (0.2, 0.02, 0.2),
      c.material('RecoveryReady', (0.41, 0.93, 0.57), 0.3, emission=(0.41, 0.93, 0.57), strength=0.8), bevel=0.02)
pole_x, pole_y = cab_x, HALF_D - 0.18
c.cylinder(parts, 'DripBase', (pole_x, pole_y, 0.03), 0.13, 0.05, M['metal'], 16)
c.cylinder(parts, 'DripPole', (pole_x, pole_y, 0.6), 0.025, 1.15, M['metal'], 10)
c.box(parts, 'DripHook', (pole_x - 0.1, pole_y, 1.16), (0.24, 0.03, 0.03), M['metal'], bevel=0.01)
c.box(parts, 'DripBag', (pole_x - 0.18, pole_y, 1.0), (0.14, 0.06, 0.24), M['bag'], bevel=0.04)

anchors = [('RecoveryAnchor', ANCHOR)]
editable = c.editable_count(parts)
stats = c.export_asset(scene, parts, 'RecoveryArea', {'MintCushion', 'StatusGlow', 'ScreenTrace', 'ReadyMark'},
                       'apps/client/public/assets/original/models/recovery-area.glb', anchors)
c.studio(scene, (0, 0, 0.45), 8, height_angle=0.55, yaw=-0.5)
c.render_preview(scene, 'art/previews/recovery-area.png')
c.save_source('art/source/recovery-area.blend')
c.write_manifest('art/source/recovery-area.json', {
    'id': 'recovery-area',
    'source': 'art/source/recovery-area.blend',
    'generator': 'art/source/blender/recovery_area.py',
    'runtime': 'apps/client/public/assets/original/models/recovery-area.glb',
    'preview': 'art/previews/recovery-area.png',
    'status': 'integrated-3d-runtime',
    'origin': 'original-project-geometry',
    'externalResources': [],
    'blenderVersion': '5.2.2 LTS',
    'editableMeshes': editable,
    'mapTilePixels': c.TILE,
    'root': 'RecoveryArea',
    'runtimeUpAxis': '+Y',
    'runtimeFrontAxis': '+Z',
    'originPlacement': 'shared-obstacle-ground-center',
    'patientSurfaceHeight': ANCHOR[2],
    'runtimeMeshes': stats['meshes'],
    'runtimeMaterials': stats['materials'],
    'runtimeTriangles': stats['triangles'],
    'runtimeBytes': stats['bytes'],
    'anchors': ['RecoveryAnchor'],
    'stateNodes': ['StatusGlow', 'ScreenTrace', 'ReadyMark'],
    'exportNotes': 'Recovery bed with heart headboard, folded blanket, pillow, bedside monitor cabinet and drip stand. '
                   'Studio excluded.',
})
print('RECOVERY_STATS', stats, 'editable', editable)
