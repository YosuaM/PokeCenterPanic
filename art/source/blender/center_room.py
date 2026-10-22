"""Original clinic shell: floor zones, cutaway walls, PC corner and lobby plants.

The room is exported in shared-map coordinates (runtime origin = map point 480, 270).
"""

import math
import sys

sys.path.insert(0, __import__('os').path.dirname(__file__))
import common as c  # noqa: E402

WALK = {'left': -48, 'right': 1008, 'top': -66, 'bottom': 606}
LEFT, BACK = c.map_point(WALK['left'], WALK['top'])
RIGHT, FRONT = c.map_point(WALK['right'], WALK['bottom'])
COUNTER_ROW = c.map_point(0, 250)[1]
LOBBY_EDGE = c.map_point(0, 318)[1]
ENTRANCE_WIDTH = 6.16
ENTRANCE_Y = c.map_point(480, WALK['bottom'] + 0.4 * c.TILE)[1]
WALL = 0.22
BACK_HEIGHT = 2.36
SIDE_HEIGHT = 1.48
FLOOR_TOP = 0.012
CARPET_HALF = 2.0
EMBLEM = (0.0, c.map_point(0, 420)[1])
EMBLEM_RADIUS = 1.3

scene = c.reset_scene()
parts = c.asset_collection(scene, 'CenterRoom - Editable Parts')
M = {
    'rubber': c.material('SlateRubber', 'navy', 0.9),
    'grout': c.material('FloorGrout', (0.72, 0.70, 0.64), 0.95),
    'tileCream': c.material('TileCream', (0.95, 0.89, 0.78), 0.55),
    'tileSand': c.material('TileSand', (0.90, 0.83, 0.70), 0.55),
    'tileMint': c.material('TileMint', (0.80, 0.91, 0.86), 0.5),
    'tileWhite': c.material('TileWhite', (0.95, 0.97, 0.95), 0.5),
    'carpet': c.material('Carpet', (0.80, 0.27, 0.27), 0.95),
    'carpetEdge': c.material('CarpetEdge', 'gold', 0.6),
    'emblemWhite': c.material('EmblemWhite', 'white', 0.5),
    'emblemDark': c.material('EmblemDark', 'navy', 0.6),
    'wall': c.material('WallMint', (0.62, 0.82, 0.79), 0.75),
    'wainscot': c.material('WallCream', 'cream', 0.7),
    'stripe': c.material('WallCoral', 'coral', 0.6),
    'trim': c.material('WallTeal', 'teal', 0.6),
    'frame': c.material('WindowFrame', 'white', 0.45),
    'glass': c.material('WindowGlass', 'sky', 0.15, emission='sky', strength=0.35),
    'wood': c.material('Wood', 'wood', 0.65),
    'woodLight': c.material('WoodLight', 'woodLight', 0.6),
    'pot': c.material('PlanterCoral', 'coral', 0.7),
    'leaf': c.material('Leaf', 'leaf', 0.8),
    'leafLight': c.material('LeafLight', 'leafLight', 0.8),
    'poster': c.material('PosterPaper', 'paper', 0.8),
    'posterRed': c.material('PosterRed', 'red', 0.7),
    'gold': c.material('Gold', 'gold', 0.4),
    'lavender': c.material('StockLavender', 'lavender', 0.6),
    'ballGlow': c.material('HealingBall', (1.0, 0.55, 0.55), 0.3, emission=(1.0, 0.45, 0.5), strength=0.9),
}


def floor():
    width = RIGHT - LEFT
    depth = BACK - FRONT
    c.box(parts, 'SlateRubber', (0, (BACK + FRONT) / 2, -0.106), (width + 2 * WALL + 0.12, depth + WALL + 0.12, 0.2),
          M['rubber'], bevel=0.02)
    c.box(parts, 'FloorGrout', (0, (BACK + FRONT) / 2, -0.0025), (width, depth, 0.005), M['grout'], bevel=0)
    gap = 0.035
    for column in range(round(width)):
        for row in range(round(depth)):
            x0 = LEFT + column
            y0 = FRONT + row
            cx, cy = x0 + 0.5, y0 + 0.5
            if abs(cx) < CARPET_HALF and cy < LOBBY_EDGE + 0.5:
                continue
            if cy > COUNTER_ROW:
                mat = M['tileWhite'] if (column + row) % 2 == 0 else M['tileMint']
            elif cy > LOBBY_EDGE:
                mat = M['tileMint']
            else:
                mat = M['tileCream'] if (column + row) % 2 == 0 else M['tileSand']
            c.box(parts, f'Tile_{column}_{row}', (cx, cy, FLOOR_TOP / 2), (1 - gap, 1 - gap, FLOOR_TOP), mat, bevel=0)
    # Tiles stop on whole-tile lines, so the runner fills exactly the skipped cells.
    runner_depth = round(LOBBY_EDGE + 0.5 - FRONT)
    c.box(parts, 'CarpetRunner', (0, FRONT + runner_depth / 2, FLOOR_TOP / 2),
          (2 * CARPET_HALF - 0.16, runner_depth, FLOOR_TOP), M['carpet'], bevel=0)
    for side in (-1, 1):
        c.box(parts, f'CarpetEdge{side}', (side * (CARPET_HALF - 0.04), FRONT + runner_depth / 2, FLOOR_TOP / 2),
              (0.08, runner_depth, FLOOR_TOP), M['carpetEdge'], bevel=0)
    # Flat medallion inset into the runner; it stays within the walkable floor height.
    ex, ey = EMBLEM
    # Thin stacked layers above the runner; the highest stays below the 0.013 walkable floor limit.
    layer = 0.0004
    c.disk(parts, 'EmblemRim', (ex, ey, FLOOR_TOP + 0.0001), EMBLEM_RADIUS + 0.08, layer, M['carpetEdge'], 48)
    c.disk(parts, 'EmblemTop', (ex, ey, FLOOR_TOP + 0.0003), EMBLEM_RADIUS, layer, M['carpet'], 48, 0, math.pi)
    c.disk(parts, 'EmblemBottom', (ex, ey, FLOOR_TOP + 0.0003), EMBLEM_RADIUS, layer, M['emblemWhite'], 48, math.pi,
           2 * math.pi)
    c.box(parts, 'EmblemBand', (ex, ey, FLOOR_TOP + 0.0005), (2 * EMBLEM_RADIUS, 0.16, layer), M['emblemDark'], bevel=0)
    c.disk(parts, 'EmblemButtonRing', (ex, ey, FLOOR_TOP + 0.0005), 0.36, layer, M['emblemDark'], 32)
    c.disk(parts, 'EmblemButton', (ex, ey, FLOOR_TOP + 0.0007), 0.24, layer, M['emblemWhite'], 32)


def back_wall():
    width = RIGHT - LEFT + 2 * WALL
    y = BACK + WALL / 2
    face = BACK
    c.box(parts, 'BackWall', (0, y, BACK_HEIGHT / 2), (width, WALL, BACK_HEIGHT), M['wall'], bevel=0.03)
    c.box(parts, 'BackWainscot', (0, face - 0.03, 0.5), (RIGHT - LEFT, 0.06, 1.0), M['wainscot'], bevel=0.02)
    c.box(parts, 'BackStripe', (0, face - 0.045, 1.06), (RIGHT - LEFT, 0.07, 0.12), M['stripe'], bevel=0.02)
    c.box(parts, 'BackSkirting', (0, face - 0.05, 0.06), (RIGHT - LEFT, 0.08, 0.12), M['trim'], bevel=0.02)
    c.box(parts, 'BackCap', (0, y, BACK_HEIGHT - 0.05), (width + 0.04, WALL + 0.08, 0.1), M['wainscot'], bevel=0.03)
    for index, wx in enumerate((-5.15, 5.15)):
        window(f'BackWindow{index}', wx, face, 2.3, 1.15, 0.95)
    for index, wx in enumerate((-8.96, 8.96)):
        healing_console(f'HealingConsole{index}', wx, face)
    medicine_shelves(face)
    for index, wx in enumerate((-3.9, 3.9)):
        c.box(parts, f'WallLampBase{index}', (wx, face - 0.05, 1.86), (0.3, 0.08, 0.3), M['trim'], bevel=0.03)
        c.sphere(parts, f'WallLamp{index}', (wx, face - 0.14, 1.86), 0.13, M['glass'], 12, 8)


def window(name, x, face, width, height, bottom):
    depth = 0.12
    c.box(parts, f'{name}Frame', (x, face - depth / 2, bottom + height / 2), (width + 0.16, depth, height + 0.16),
          M['frame'], bevel=0.04)
    c.box(parts, f'{name}Glass', (x, face - depth - 0.005, bottom + height / 2), (width - 0.1, 0.02, height - 0.1),
          M['glass'], bevel=0)
    c.box(parts, f'{name}Mullion', (x, face - depth - 0.02, bottom + height / 2), (0.07, 0.04, height - 0.1),
          M['frame'], bevel=0.01)
    c.box(parts, f'{name}Transom', (x, face - depth - 0.02, bottom + height * 0.62), (width - 0.1, 0.04, 0.07),
          M['frame'], bevel=0.01)
    c.box(parts, f'{name}Sill', (x, face - 0.14, bottom - 0.06), (width + 0.3, 0.2, 0.08), M['wainscot'], bevel=0.02)


def healing_console(name, x, face):
    """Wall unit with six glowing ball slots above each healing bed."""
    z = 1.85
    c.box(parts, f'{name}Body', (x, face - 0.09, z), (1.95, 0.18, 0.78), M['wainscot'], bevel=0.08)
    c.box(parts, f'{name}Panel', (x, face - 0.19, z - 0.02), (1.7, 0.04, 0.56), M['trim'], bevel=0.04)
    c.box(parts, f'{name}Header', (x, face - 0.12, z + 0.42), (1.1, 0.14, 0.12), M['stripe'], bevel=0.04)
    for row in range(2):
        for column in range(3):
            bx = x - 0.5 + column * 0.5
            bz = z + 0.1 - row * 0.26
            c.cylinder(parts, f'{name}Socket{row}{column}', (bx, face - 0.21, bz), 0.11, 0.03, M['rubber'], 20, axis='Y')
            c.sphere(parts, f'{name}Ball{row}{column}', (bx, face - 0.23, bz + 0.02), 0.085, M['ballGlow'], 12, 6,
                     (1, 0.6, 0.7))
            c.box(parts, f'{name}BallBand{row}{column}', (bx, face - 0.28, bz - 0.005), (0.17, 0.02, 0.025),
                  M['wainscot'], bevel=0)


def medicine_shelves(face):
    """Open shelves of Burn Heal and Antidote stock behind the medicine table."""
    for side, cap in ((-1, 'posterRed'), (1, 'lavender')):
        cx = side * 1.65
        for level, z in enumerate((1.28, 1.66)):
            c.box(parts, f'Shelf{side}{level}', (cx, face - 0.14, z), (2.1, 0.28, 0.06), M['woodLight'], bevel=0.02)
            c.box(parts, f'ShelfBracket{side}{level}a', (cx - 0.9, face - 0.08, z - 0.08), (0.05, 0.16, 0.12), M['trim'],
                  bevel=0.01)
            c.box(parts, f'ShelfBracket{side}{level}b', (cx + 0.9, face - 0.08, z - 0.08), (0.05, 0.16, 0.12), M['trim'],
                  bevel=0.01)
            for item in range(6):
                bx = cx - 0.82 + item * 0.33 + (0.05 if level else 0)
                height = 0.2 if (item + level) % 3 else 0.26
                c.cylinder(parts, f'Stock{side}{level}{item}', (bx, face - 0.15, z + 0.03 + height / 2), 0.075, height,
                           M['wainscot'] if item % 2 else M['glass'], 12)
                c.cylinder(parts, f'StockCap{side}{level}{item}', (bx, face - 0.15, z + 0.04 + height), 0.065, 0.05,
                           M[cap], 12)


def cross_poster(name, x, face, z):
    c.box(parts, f'{name}Board', (x, face - 0.03, z), (0.9, 0.05, 0.9), M['poster'], bevel=0.03)
    c.box(parts, f'{name}Vertical', (x, face - 0.065, z), (0.22, 0.03, 0.6), M['posterRed'], bevel=0.01)
    c.box(parts, f'{name}Horizontal', (x, face - 0.065, z), (0.6, 0.03, 0.22), M['posterRed'], bevel=0.01)


def side_walls():
    depth = BACK - FRONT + WALL
    cy = (BACK + WALL + FRONT) / 2
    for side, wall_x in ((-1, LEFT - WALL / 2), (1, RIGHT + WALL / 2)):
        label = 'Left' if side < 0 else 'Right'
        inner = wall_x - side * WALL / 2
        c.box(parts, f'{label}Wall', (wall_x, cy, SIDE_HEIGHT / 2), (WALL, depth, SIDE_HEIGHT), M['wall'], bevel=0.03)
        c.box(parts, f'{label}Cap', (wall_x, cy, SIDE_HEIGHT - 0.04), (WALL + 0.08, depth + 0.04, 0.08),
              M['wainscot'], bevel=0.02)
        c.box(parts, f'{label}Wainscot', (inner - side * 0.03, (BACK + FRONT) / 2, 0.5), (0.06, BACK - FRONT, 1.0),
              M['wainscot'], bevel=0.02)
        c.box(parts, f'{label}Stripe', (inner - side * 0.045, (BACK + FRONT) / 2, 1.06), (0.07, BACK - FRONT, 0.12),
              M['stripe'], bevel=0.02)
        c.box(parts, f'{label}Skirting', (inner - side * 0.05, (BACK + FRONT) / 2, 0.06), (0.08, BACK - FRONT, 0.12),
              M['trim'], bevel=0.02)
        for index, wy in enumerate((-2.4, -5.0)):
            c.box(parts, f'{label}Window{index}Frame', (inner - side * 0.05, wy, 1.22), (0.1, 1.7, 0.42),
                  M['frame'], bevel=0.03)
            c.box(parts, f'{label}Window{index}Glass', (inner - side * 0.105, wy, 1.22), (0.02, 1.56, 0.3),
                  M['glass'], bevel=0)
        board_y = 4.2
        c.box(parts, f'{label}NoticeBoard', (inner - side * 0.04, board_y, 1.2), (0.06, 1.5, 0.5), M['wood'], bevel=0.02)
        for index, (dy, color) in enumerate(((-0.45, 'poster'), (0.0, 'posterRed'), (0.45, 'poster'))):
            c.box(parts, f'{label}Notice{index}', (inner - side * 0.08, board_y + dy, 1.2), (0.02, 0.32, 0.36),
                  M[color], bevel=0.005)


def front_trims():
    trim_width = (RIGHT - LEFT - ENTRANCE_WIDTH) / 2
    for side in (-1, 1):
        x = side * (ENTRANCE_WIDTH + trim_width) / 2
        c.box(parts, f'FrontTrim{side}', (x, FRONT - 0.02, 0.045), (trim_width, 0.11, 0.09), M['gold'], bevel=0.025)
    step = c.box(parts, 'EntranceStep', (0, FRONT - 0.4, -0.1), (ENTRANCE_WIDTH, 0.8, 0.2), M['rubber'], bevel=0.025)
    return step


def pc_corner():
    x0, y0 = c.map_point(-48, 250)
    x1, y1 = c.map_point(192, 318)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    width, depth = x1 - x0, y0 - y1
    c.box(parts, 'PcDeskCabinet', (cx, cy, 0.38), (width - 0.06, depth - 0.12, 0.76), M['wainscot'], bevel=0.06)
    c.box(parts, 'PcDeskTop', (cx, cy, 0.8), (width, depth, 0.08), M['woodLight'], bevel=0.035)
    c.box(parts, 'PcDeskStripe', (cx, y1 + 0.05, 0.56), (width - 0.2, 0.04, 0.1), M['stripe'], bevel=0.015)
    c.box(parts, 'PcDeskToe', (cx, cy, 0.05), (width - 0.24, depth - 0.3, 0.1), M['trim'], bevel=0.02)
    for index, dx in enumerate((-1.6, 0.0, 1.6)):
        c.box(parts, f'PcDeskDrawer{index}', (cx + dx, y1 + 0.04, 0.34), (1.2, 0.04, 0.32), M['poster'], bevel=0.02)
        c.box(parts, f'PcDeskHandle{index}', (cx + dx, y1 + 0.015, 0.4), (0.36, 0.04, 0.05), M['trim'], bevel=0.01)
    # Desk props stay clear of the PC terminal on the left half of the desk.
    plant(f'PcDeskPlant', (x1 - 0.45, cy + 0.1, 0.84), 0.24, 0.62)
    for index, (dx, mat) in enumerate(((0.0, 'posterRed'), (0.13, 'trim'), (0.26, 'wainscot'))):
        c.box(parts, f'PcDeskBook{index}', (x1 - 1.35 + dx, cy + 0.2, 0.84 + 0.17), (0.11, 0.5, 0.34), M[mat], bevel=0.01)
    for index, dx in enumerate((-0.2, 0.18)):
        c.sphere(parts, f'PcDeskBallTop{index}', (x1 - 2.25 + dx, cy - 0.15, 0.93), 0.11, M['posterRed'], 12, 6,
                 (1, 1, 0.9))


def plant(name, base, pot_radius, height):
    x, y, z = base
    c.cylinder(parts, f'{name}Pot', (x, y, z + pot_radius * 0.9), pot_radius, pot_radius * 1.8, M['pot'], 20, 0.03)
    c.cylinder(parts, f'{name}Rim', (x, y, z + pot_radius * 1.8), pot_radius * 1.1, 0.08, M['wainscot'], 20, 0.02)
    c.cylinder(parts, f'{name}Soil', (x, y, z + pot_radius * 1.8 + 0.01), pot_radius * 0.95, 0.04, M['wood'], 16)
    top = z + pot_radius * 1.8
    leaves = [(0, 0, 0.55, 0.55), (0.32, 0.1, 0.4, 0.42), (-0.3, -0.12, 0.38, 0.44), (0.05, 0.3, 0.68, 0.36),
              (-0.08, -0.28, 0.7, 0.34)]
    for index, (dx, dy, dz, r) in enumerate(leaves):
        scale = height / 1.2
        c.sphere(parts, f'{name}Leaf{index}', (x + dx * scale * pot_radius * 2, y + dy * scale * pot_radius * 2,
                                                top + dz * scale), r * scale,
                 M['leaf'] if index % 2 == 0 else M['leafLight'], 12, 8, (1, 1, 1.15))


def lobby_plants():
    for index, (mx, my) in enumerate(((258, 544), (646, 544))):
        x0, y0 = c.map_point(mx, my)
        x1, y1 = c.map_point(mx + 56, my + 56)
        plant(f'LobbyPlant{index}', ((x0 + x1) / 2, (y0 + y1) / 2, 0), 0.5, 1.25)


floor()
back_wall()
side_walls()
front_trims()
pc_corner()
lobby_plants()

anchors = [
    ('RoomFloorAnchor', (0, (BACK + FRONT) / 2, 0)),
    ('RoomEntranceAnchor', (0, ENTRANCE_Y, 0)),
    ('RoomSignAnchor', (0, BACK + 0.02, BACK_HEIGHT)),
    ('PcDeskAnchor', (c.map_point(36, 284)[0], c.map_point(36, 284)[1], 0.84)),
]
for name, location in anchors:
    c.empty(parts, name, location)

editable = c.editable_count(parts)
stats = c.export_asset(scene, parts, 'CenterRoom', {'SlateRubber', 'FloorGrout', 'EntranceStep'},
                       'apps/client/public/assets/original/models/center-room.glb', anchors)
studio, ground = c.studio(scene, (0, -0.3, 0), 30, height_angle=0.72, yaw=-0.42, ortho=27)
c.render_preview(scene, 'art/previews/center-room.png')
c.save_source('art/source/center-room.blend')
c.write_manifest('art/source/center-room.json', {
    'id': 'center-room',
    'source': 'art/source/center-room.blend',
    'generator': 'art/source/blender/center_room.py',
    'runtime': 'apps/client/public/assets/original/models/center-room.glb',
    'preview': 'art/previews/center-room.png',
    'status': 'integrated-3d-runtime',
    'origin': 'original-project-geometry',
    'externalResources': [],
    'blenderVersion': '5.2.2 LTS',
    'editableMeshes': editable,
    'root': 'CenterRoom',
    'runtimeUpAxis': '+Y',
    'runtimeFrontAxis': '+Z',
    'originPlacement': 'shared-map-origin',
    'runtimeMeshes': stats['meshes'],
    'runtimeMaterials': stats['materials'],
    'runtimeTriangles': stats['triangles'],
    'runtimeBytes': stats['bytes'],
    'anchors': [name for name, _ in anchors],
    'exportNotes': 'Compact 22 x 14 tile clinic: mint treatment floor, warm lobby with carpet runner and floor medallion, '
                   'cutaway walls with windows and posters, PC corner desk and entrance planters. Studio excluded.',
})
print('ROOM_STATS', stats, 'editable', editable)
