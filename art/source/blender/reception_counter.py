"""Original central reception counter with four arrival pads and the discharge desk.

Ground-center origin at the shared counter footprint center; Blender -Y faces the lobby.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common as c  # noqa: E402

COUNTER = {'x': 312, 'y': 250, 'width': 336, 'height': 68}
CENTER = (COUNTER['x'] + COUNTER['width'] / 2, COUNTER['y'] + COUNTER['height'] / 2)
WIDTH = COUNTER['width'] / c.TILE
DEPTH = COUNTER['height'] / c.TILE
HALF_W, HALF_D = WIDTH / 2, DEPTH / 2
SLOTS = [348, 412, 548, 612]
DISCHARGE_X = 480
SLOT_Y = 290
SURFACE = 0.93
TOP = 0.86


def local(mx, my):
    return ((mx - CENTER[0]) / c.TILE, -(my - CENTER[1]) / c.TILE)


scene = c.reset_scene()
parts = c.asset_collection(scene, 'ReceptionCounter - Editable Parts')
M = {
    'toe': c.material('CounterToe', 'navy', 0.8),
    'body': c.material('CounterCoral', 'coral', 0.55),
    'band': c.material('CounterCream', 'cream', 0.6),
    'top': c.material('CounterTop', 'white', 0.35),
    'pad': c.material('ArrivalPad', (0.82, 0.92, 0.88), 0.5),
    'trim': c.material('CounterTeal', 'teal', 0.55),
    'ballRed': c.material('BallRed', 'red', 0.45),
    'ballWhite': c.material('BallWhite', 'white', 0.4),
    'ballDark': c.material('BallDark', 'navy', 0.5),
    'discharge': c.material('DischargeGreen', (0.55, 0.82, 0.58), 0.45),
    'shelf': c.material('StaffShelf', 'woodLight', 0.6),
    'screen': c.material('StaffScreen', 'tealDark', 0.35, emission='aqua', strength=0.6),
}


def glow(name, color):
    return c.material(name, color, 0.3, emission=color, strength=0.4)


straight = WIDTH - DEPTH
c.box(parts, 'Toe', (0, 0, 0.06), (straight + 0.02, DEPTH - 0.18, 0.12), M['toe'], bevel=0.03)
c.box(parts, 'Body', (0, 0.02, 0.44), (straight, DEPTH - 0.1, 0.66), M['body'], bevel=0.05)
c.box(parts, 'Band', (0, -0.01, 0.7), (straight + 0.01, DEPTH - 0.06, 0.12), M['band'], bevel=0.03)
# Outer surfaces stop a hair inside the footprint to survive float32 export rounding.
c.box(parts, 'Top', (0, 0, TOP - 0.04), (straight, DEPTH - 0.002, 0.08), M['top'], bevel=0.035)
c.box(parts, 'TopRim', (0, -HALF_D + 0.036, TOP + 0.003), (straight, 0.068, 0.02), M['band'], bevel=0.008)
c.box(parts, 'TopRimBack', (0, HALF_D - 0.036, TOP + 0.003), (straight, 0.068, 0.02), M['band'], bevel=0.008)
for side in (-1, 1):
    x = side * (HALF_W - HALF_D)
    c.cylinder(parts, f'EndToe{side}', (x, 0, 0.06), HALF_D - 0.09, 0.12, M['toe'], 32, 0.02)
    c.cylinder(parts, f'EndBody{side}', (x, 0.02, 0.44), HALF_D - 0.05, 0.66, M['body'], 32, 0.04)
    c.cylinder(parts, f'EndBand{side}', (x, -0.01, 0.7), HALF_D - 0.03, 0.12, M['band'], 32, 0.03)
    c.cylinder(parts, f'EndTop{side}', (x, 0, TOP - 0.04), HALF_D - 0.001, 0.08, M['top'], 32, 0.03)

front = -HALF_D + 0.05
# Front rhythm: rounded pilasters between bays and a lighter inset panel per bay.
for mx in (380, 446, 514, 580):
    x, _ = local(mx, 0)
    c.box(parts, f'Pilaster{mx}', (x, front - 0.02, 0.4), (0.1, 0.06, 0.52), M['top'], bevel=0.03)
for index, mx in enumerate(SLOTS):
    x, y = local(mx, SLOT_Y)
    c.box(parts, f'BayPanel{index}', (x, front - 0.015, 0.4), (0.98, 0.03, 0.44), M['band'], bevel=0.02)
    c.box(parts, f'ArrivalPad{index}', (x, y, SURFACE - 0.035), (1.05, 0.88, 0.07), M['pad'], bevel=0.03)
    c.box(parts, f'ReceptionGlow{index + 1}', (x, -HALF_D + 0.1, SURFACE - 0.02), (0.62, 0.07, 0.05),
          glow(f'ReceptionLight{index + 1}', (0.48, 0.72, 0.67)), bevel=0.015)
    c.box(parts, f'BayNumberPlate{index}', (x - 0.36, front - 0.03, 0.56), (0.18, 0.03, 0.18), M['top'], bevel=0.02)
    for pip in range(index + 1):
        c.box(parts, f'BayNumberPip{index}_{pip}', (x - 0.42 + pip * 0.04, front - 0.04, 0.56), (0.025, 0.01, 0.1),
              M['ballDark'], bevel=0)

# Discharge desk: green tray and a Poké Ball medallion on the front panel.
dx, dy = local(DISCHARGE_X, SLOT_Y)
c.box(parts, 'DischargeTray', (dx, dy, SURFACE - 0.035), (1.05, 0.88, 0.07), M['discharge'], bevel=0.03)
c.ring(parts, 'DischargeGlow', (dx, dy, SURFACE + 0.005), 0.44, 0.36, 0.03,
       glow('DischargeLight', (0.42, 0.85, 0.55)), 40)
# Medallion layers sit just proud of the coral body so the footprint stays exact.
body_front = 0.02 - (DEPTH - 0.1) / 2
c.cylinder(parts, 'MedallionRim', (dx, body_front - 0.015, 0.4), 0.29, 0.03, M['ballDark'], 36, 0.01, axis='Y')
c.disk(parts, 'MedallionTop', (dx, body_front - 0.035, 0.4), 0.25, 0.01, M['ballRed'], 32, 0, math.pi, 'front')
c.disk(parts, 'MedallionLower', (dx, body_front - 0.035, 0.4), 0.25, 0.01, M['ballWhite'], 32, math.pi, 2 * math.pi,
       'front')
c.box(parts, 'MedallionBand', (dx, body_front - 0.045, 0.4), (0.5, 0.01, 0.05), M['ballDark'], bevel=0)
c.cylinder(parts, 'MedallionButtonRing', (dx, body_front - 0.048, 0.4), 0.1, 0.012, M['ballDark'], 20, 0, axis='Y')
c.cylinder(parts, 'MedallionButton', (dx, body_front - 0.056, 0.4), 0.065, 0.012, M['ballWhite'], 20, 0, axis='Y')

# Staff side: shelves, a ledger screen and Poké Ball trays below the counter top.
back = HALF_D - 0.03
c.box(parts, 'StaffShelf', (0, back - 0.08, 0.5), (straight - 0.2, 0.16, 0.05), M['shelf'], bevel=0.015)
c.box(parts, 'StaffShelfLow', (0, back - 0.08, 0.22), (straight - 0.2, 0.16, 0.05), M['shelf'], bevel=0.015)
for index, x in enumerate((-2.2, -0.8, 0.8, 2.2)):
    for ball in range(3):
        bx = x - 0.24 + ball * 0.24
        c.sphere(parts, f'TrayBall{index}_{ball}', (bx, back - 0.1, 0.6), 0.075,
                 M['ballRed'] if ball != 1 else M['ballWhite'], 10, 6)
c.box(parts, 'LedgerScreen', (-1.0, 0.18, TOP + 0.13), (0.5, 0.05, 0.26), M['screen'], bevel=0.02)
c.box(parts, 'LedgerStand', (-1.0, 0.22, TOP + 0.02), (0.18, 0.12, 0.06), M['trim'], bevel=0.02)
c.cylinder(parts, 'ServiceBell', (0.75, 0.2, TOP + 0.03), 0.07, 0.06, M['band'], 16, 0.02)
c.sphere(parts, 'ServiceBellDome', (0.75, 0.2, TOP + 0.07), 0.06, c.material('BellGold', 'gold', 0.3), 12, 6,
         (1, 1, 0.6))

anchors = [(f'ReceptionAnchor{i + 1}', (*local(mx, SLOT_Y), SURFACE)) for i, mx in enumerate(SLOTS)]
anchors.append(('DischargeAnchor', (*local(DISCHARGE_X, SLOT_Y), SURFACE)))
editable = c.editable_count(parts)
stats = c.export_asset(scene, parts, 'ReceptionCounter',
                       {f'ReceptionGlow{i}' for i in range(1, 5)} | {'DischargeGlow'},
                       'apps/client/public/assets/original/models/reception-counter.glb', anchors)
c.studio(scene, (0, 0, 0.45), 11, height_angle=0.6, yaw=-0.45)
c.render_preview(scene, 'art/previews/reception-counter.png')
c.save_source('art/source/reception-counter.blend')
c.write_manifest('art/source/reception-counter.json', {
    'id': 'reception-counter',
    'source': 'art/source/reception-counter.blend',
    'generator': 'art/source/blender/reception_counter.py',
    'runtime': 'apps/client/public/assets/original/models/reception-counter.glb',
    'preview': 'art/previews/reception-counter.png',
    'status': 'integrated-3d-runtime',
    'origin': 'original-project-geometry',
    'externalResources': [],
    'blenderVersion': '5.2.2 LTS',
    'editableMeshes': editable,
    'mapTilePixels': c.TILE,
    'root': 'ReceptionCounter',
    'runtimeUpAxis': '+Y',
    'runtimeFrontAxis': '+Z',
    'originPlacement': 'ground-center',
    'patientSurfaceHeight': SURFACE,
    'runtimeMeshes': stats['meshes'],
    'runtimeMaterials': stats['materials'],
    'runtimeTriangles': stats['triangles'],
    'runtimeBytes': stats['bytes'],
    'anchors': [name for name, _ in anchors],
    'stateNodes': [f'ReceptionGlow{i}' for i in range(1, 5)] + ['DischargeGlow'],
    'exportNotes': 'Central island counter with rounded ends, four arrival pads, a green discharge tray with a '
                   'medallion front, and a staff side with shelves, trays, ledger screen and bell. Studio excluded.',
})
print('COUNTER_STATS', stats, 'editable', editable)
