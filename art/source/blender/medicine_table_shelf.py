"""Turn the medicine table's decorative reagent bottles into a three-dose stock shelf per station.

Run against the table source, which has no generator script of its own:
    Blender -b art/source/medicine-table.blend --factory-startup -P art/source/blender/medicine_table_shelf.py

Removes the six back-row bottles, adds StockAnchor1-6 at their bases (Burn Heal 1-3 and Antidote 4-6,
left to right) and re-exports the runtime GLB with the original node naming.
"""

import json
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common as c  # noqa: E402

PARTS = 'MedicineTable - Editable Parts'
BOTTLE_PREFIXES = ('ReagentBottle', 'ReagentCap', 'BottleMark')
STOCK_X = (-2.227, -1.667, -1.107, 1.107, 1.667, 2.227)
STOCK_Y = 0.7
SHELF_TOP = 0.78
GLB = 'apps/client/public/assets/original/models/medicine-table.glb'
MANIFEST = 'art/source/medicine-table.json'
ROOT_EXTRAS = {
    'asset_id': 'medicine-table',
    'units': 'one unit per 48px map tile',
    'front': '-Y in Blender, +Z in glTF',
    'worktop_height': 0.66,
    'footprint_width': 5.75,
    'footprint_depth': 2.125,
}

scene = bpy.context.scene
parts = bpy.data.collections[PARTS]
for obj in [obj for obj in parts.objects if obj.name.startswith(BOTTLE_PREFIXES)]:
    bpy.data.objects.remove(obj, do_unlink=True)

runtime = bpy.data.collections.new('MedicineTable - Runtime')
scene.collection.children.link(runtime)
sources = list(parts.objects)
originals = {obj: obj.name for obj in sources}
for obj in sources:
    obj.name = f'{obj.name}__src'
depsgraph = bpy.context.evaluated_depsgraph_get()
groups = {}
anchors = []
for obj in sources:
    if obj.type == 'EMPTY':
        anchors.append((originals[obj], obj.matrix_world.translation.copy()))
        continue
    if obj.type != 'MESH':
        continue
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
    mesh.transform(obj.matrix_world)
    copy = bpy.data.objects.new(f'{originals[obj]}_baked', mesh)
    runtime.objects.link(copy)
    groups.setdefault(obj.data.materials[0].name, []).append(copy)
anchors += [(f'StockAnchor{index + 1}', Vector((x, STOCK_Y, SHELF_TOP))) for index, x in enumerate(STOCK_X)]

root = bpy.data.objects.new('MedicineTable', None)
runtime.objects.link(root)
for key, value in ROOT_EXTRAS.items():
    root[key] = value
joined = []
for material, objects in sorted(groups.items()):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    target = bpy.context.view_layer.objects.active
    target.name = target.data.name = material.removeprefix('MT_').replace(' ', '')
    for poly in target.data.polygons:
        poly.use_smooth = False
    target.parent = root
    joined.append(target)
for name, location in anchors:
    anchor = bpy.data.objects.new(name, None)
    anchor.location = location
    runtime.objects.link(anchor)
    anchor.parent = root

bpy.ops.object.select_all(action='DESELECT')
for obj in runtime.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(c.REPO / GLB), export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                          export_animations=False, export_materials='EXPORT', export_normals=True,
                          export_texcoords=False, export_extras=True)
stats = {
    'runtimeMeshes': len(joined),
    'runtimeMaterials': len({m.name for obj in joined for m in obj.data.materials}),
    'runtimeTriangles': sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in joined),
    'runtimeBytes': (c.REPO / GLB).stat().st_size,
}
for obj in list(runtime.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.collections.remove(runtime)
for obj, name in originals.items():
    obj.name = name

manifest = json.loads((c.REPO / MANIFEST).read_text())
manifest.update(stats)
manifest['editableMeshes'] = c.editable_count(parts)
manifest['shelfScript'] = 'art/source/blender/medicine_table_shelf.py'
manifest['interactionAnchors'] = ['BurnHealAnchor', 'AntidoteAnchor', 'DisposalAnchor']
manifest['stockAnchors'] = [f'StockAnchor{index + 1}' for index in range(len(STOCK_X))]
manifest['exportNotes'] = ('Evaluated bevels and normals; grouped by material; no external textures, fonts, lights, '
                           'cameras or studio. The back shelf is empty: StockAnchor1-3 (Burn Heal) and 4-6 (Antidote) '
                           'mark where the runtime shows prepared doses. Gameplay points remain unchanged.')
c.write_manifest(MANIFEST, manifest)
c.render_preview(scene, 'art/previews/medicine-table.png')
c.save_source('art/source/medicine-table.blend')
print('TABLE_STATS', stats)
