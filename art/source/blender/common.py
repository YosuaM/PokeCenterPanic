"""Shared helpers for the original PokéCenter Panic Blender assets.

Run an asset script with:
    Blender -b --factory-startup -P art/source/blender/<asset>.py

Coordinates use Blender Z up. glTF export converts them to Y up, so a Blender
point (x, y, z) becomes runtime (x, z, -y). One unit is one 48-pixel map tile.
"""

import json
import math
import os
import pathlib

import bpy
import bmesh
from mathutils import Vector

REPO = pathlib.Path(__file__).resolve().parents[3]
TILE = 48

PALETTE = {
    'cream': (1.0, 0.957, 0.875),
    'paper': (0.98, 0.93, 0.84),
    'coral': (0.91, 0.45, 0.40),
    'red': (0.86, 0.26, 0.25),
    'coralLight': (1.0, 0.71, 0.60),
    'teal': (0.25, 0.56, 0.58),
    'tealDark': (0.15, 0.29, 0.33),
    'mint': (0.78, 0.89, 0.84),
    'mintDeep': (0.55, 0.78, 0.74),
    'aqua': (0.41, 0.79, 0.76),
    'navy': (0.12, 0.19, 0.25),
    'slate': (0.26, 0.31, 0.36),
    'lavender': (0.72, 0.65, 0.81),
    'lavenderDeep': (0.52, 0.45, 0.66),
    'wood': (0.66, 0.47, 0.36),
    'woodLight': (0.82, 0.64, 0.48),
    'leaf': (0.36, 0.64, 0.38),
    'leafLight': (0.55, 0.78, 0.45),
    'gold': (0.96, 0.80, 0.47),
    'white': (0.97, 0.97, 0.95),
    'glass': (0.62, 0.84, 0.92),
    'sky': (0.67, 0.86, 0.96),
    'black': (0.08, 0.09, 0.11),
}


def map_point(x, y):
    """Shared-map pixels to Blender ground coordinates."""
    return ((x - 480) / TILE, -(y - 270) / TILE)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    return scene


_materials = {}


def material(name, color=None, roughness=0.62, emission=None, strength=0.0, metallic=0.0):
    key = name
    if key in _materials:
        return _materials[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    rgb = PALETTE.get(color, color) if color is not None else PALETTE.get(name, (0.8, 0.8, 0.8))
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission is not None:
        erg = PALETTE.get(emission, emission)
        bsdf.inputs['Emission Color'].default_value = (*erg, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    _materials[key] = mat
    return mat


def _link(obj, collection):
    collection.objects.link(obj)
    return obj


def _bevel(obj, width, segments=3):
    if width <= 0:
        return obj
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.harden_normals = False
    return obj


def box(collection, name, center, size, mat, bevel=0.04, segments=2):
    """Axis-aligned rounded box. center is (x, y, z) of the box center."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.data.materials.append(mat)
    _link(obj, collection)
    limit = min(size) / 2 - 0.001
    _bevel(obj, min(bevel, limit), segments)
    return obj


def cylinder(collection, name, center, radius, depth, mat, vertices=24, bevel=0.0, axis='Z'):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=vertices, radius1=radius, radius2=radius, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    if axis == 'X':
        obj.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'Y':
        obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(mat)
    _link(obj, collection)
    _bevel(obj, min(bevel, depth / 2 - 0.001, radius - 0.001), 2)
    return obj


def cone(collection, name, center, radius1, radius2, depth, mat, vertices=16):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=vertices, radius1=radius1, radius2=radius2, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.data.materials.append(mat)
    _link(obj, collection)
    return obj


def sphere(collection, name, center, radius, mat, segments=16, rings=10, scale=(1, 1, 1)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.scale = scale
    obj.data.materials.append(mat)
    _link(obj, collection)
    return obj


def disk(collection, name, center, radius, thickness, mat, vertices=32, start=0.0, end=2 * math.pi, facing=None):
    """Flat disk or sector lying on the ground plane."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    full = abs(end - start - 2 * math.pi) < 1e-6
    steps = vertices
    ring_top, ring_bottom = [], []
    for i in range(steps + (0 if full else 1)):
        a = start + (end - start) * i / steps
        ring_top.append(bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, thickness / 2)))
        ring_bottom.append(bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, -thickness / 2)))
    if not full:
        ring_top.append(bm.verts.new((0, 0, thickness / 2)))
        ring_bottom.append(bm.verts.new((0, 0, -thickness / 2)))
    bm.faces.new(ring_top)
    bm.faces.new(list(reversed(ring_bottom)))
    n = len(ring_top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ring_top[i], ring_top[j], ring_bottom[j], ring_bottom[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    if facing == 'front':
        # Stand the disk up so it faces Blender -Y (the runtime +Z front).
        obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(mat)
    _link(obj, collection)
    return obj


def ring(collection, name, center, outer, inner, thickness, mat, vertices=40):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for radius, z in ((outer, thickness / 2), (inner, thickness / 2), (inner, -thickness / 2), (outer, -thickness / 2)):
        rows.append([bm.verts.new((math.cos(2 * math.pi * i / vertices) * radius,
                                   math.sin(2 * math.pi * i / vertices) * radius, z)) for i in range(vertices)])
    for r in range(4):
        a, b = rows[r], rows[(r + 1) % 4]
        for i in range(vertices):
            j = (i + 1) % vertices
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.data.materials.append(mat)
    _link(obj, collection)
    return obj


def empty(collection, name, location):
    obj = bpy.data.objects.new(name, None)
    obj.location = location
    obj.empty_display_size = 0.2
    _link(obj, collection)
    return obj


def asset_collection(scene, name):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    return collection


def export_asset(scene, editable, root_name, keep_separate, glb_path, anchors=()):
    """Bake modifiers, join meshes by material and export only the runtime hierarchy."""
    runtime = bpy.data.collections.new(f'{root_name} - Runtime')
    scene.collection.children.link(runtime)
    # Free the editable names so runtime nodes keep exact names without numeric suffixes.
    originals = {obj: obj.name for obj in editable.objects}
    for obj in originals:
        obj.name = f'{obj.name}__src'
    depsgraph = bpy.context.evaluated_depsgraph_get()
    groups = {}
    separate = []
    for obj in editable.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
        mesh.transform(obj.matrix_world)
        copy = bpy.data.objects.new(f'{obj.name}_baked', mesh)
        runtime.objects.link(copy)
        name = originals[obj]
        if name in keep_separate:
            copy.name = name + '_tmp'
            separate.append((name, copy))
        else:
            groups.setdefault(obj.data.materials[0].name, []).append(copy)
    root = bpy.data.objects.new(root_name, None)
    runtime.objects.link(root)
    joined = []
    for mat_name, objects in sorted(groups.items()):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        target = bpy.context.view_layer.objects.active
        target.name = mat_name.replace(' ', '')
        if target.name in keep_separate or target.name in dict(anchors):
            target.name = f'{target.name}Parts'

        target.data.name = target.name
        joined.append(target)
    for name, copy in separate:
        copy.name = name
        copy.data.name = name
        joined.append(copy)
    for obj in joined:
        for poly in obj.data.polygons:
            poly.use_smooth = False
        obj.parent = root
    for anchor_name, location in anchors:
        anchor = bpy.data.objects.new(anchor_name, None)
        anchor.location = location
        runtime.objects.link(anchor)
        anchor.parent = root
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in runtime.objects:
        obj.select_set(True)
    glb = REPO / glb_path
    glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False, export_animations=False, export_materials='EXPORT',
                              export_normals=True, export_texcoords=False)
    stats = {
        'meshes': len(joined),
        'materials': len({m.name for o in joined for m in o.data.materials}),
        'triangles': sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in joined),
        'bytes': glb.stat().st_size,
    }
    # The runtime copy is regenerated on every export; keep only editable parts in the source.
    for obj in list(runtime.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(runtime)
    for obj, name in originals.items():
        obj.name = name
    return stats


def studio(scene, target, distance, height_angle=0.62, yaw=-0.55, ortho=None, size=(1400, 1100)):
    """Neutral preview studio in its own collection, excluded from export."""
    collection = bpy.data.collections.new('Studio')
    scene.collection.children.link(collection)
    ground = box(collection, 'StudioGround', (target[0], target[1], -0.06), (80, 80, 0.1),
                 material('StudioGround', (0.58, 0.66, 0.68), roughness=0.9), bevel=0)
    cam_data = bpy.data.cameras.new('PreviewCamera')
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho
    camera = bpy.data.objects.new('PreviewCamera', cam_data)
    collection.objects.link(camera)
    direction = Vector((math.sin(yaw) * math.cos(height_angle), -math.cos(yaw) * math.cos(height_angle),
                        math.sin(height_angle)))
    camera.location = Vector(target) + direction * distance
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    sun_data = bpy.data.lights.new('KeySun', 'SUN')
    sun_data.energy = 2.6
    sun_data.angle = 0.35
    sun = bpy.data.objects.new('KeySun', sun_data)
    sun.rotation_euler = (0.75, 0.15, -0.6)
    collection.objects.link(sun)
    fill_data = bpy.data.lights.new('Fill', 'AREA')
    fill_data.energy = 500
    fill_data.size = 12
    fill = bpy.data.objects.new('Fill', fill_data)
    fill.location = Vector(target) + Vector((6, -8, 9))
    fill.rotation_euler = (0.85, 0, 0.6)
    collection.objects.link(fill)
    world = bpy.data.worlds.new('StudioWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.66, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45
    scene.world = world
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'Medium High Contrast'
    scene.eevee.taa_render_samples = 32
    return collection, ground


def render_preview(scene, path):
    scene.render.filepath = str(REPO / path)
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


def save_source(path):
    bpy.ops.wm.save_as_mainfile(filepath=str(REPO / path), compress=True)
    for leftover in (REPO / path).parent.glob((REPO / path).name + '1'):
        leftover.unlink()


def write_manifest(path, data):
    (REPO / path).write_text(json.dumps(data, indent=2) + '\n')


def editable_count(collection):
    return sum(1 for obj in collection.objects if obj.type == 'MESH')
