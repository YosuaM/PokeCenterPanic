"""Assemble every exported clinic GLB at its runtime placement and render the game camera view.

Writes art/previews/clinic-overview.png. Placements mirror the client model loaders.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common as c  # noqa: E402

MODELS = 'apps/client/public/assets/original/models/'


def world(mx, my):
    return ((mx - 480) / c.TILE, (my - 270) / c.TILE)


def place(name, runtime, hide=()):
    """Import a GLB and position it with runtime (Y-up) coordinates."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(c.REPO / MODELS / f'{name}.glb'))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    roots = [obj for obj in imported if obj.parent is None]
    x, y, z = runtime
    for root in roots:
        root.location = (x + root.location.x, -z + root.location.y, y + root.location.z)
    for obj in imported:
        if obj.name.split('.')[0] in hide:
            obj.hide_render = True
    return imported


scene = c.reset_scene()
counter = world(480, 284)
place('center-room', (0, 0, 0))
place('reception-counter', (counter[0], 0, counter[1]))
for mx in (49.5, 910.5):
    x, z = world(mx, -0.5)
    place('healing-machine', (x, 0, z))
table = world(480, -9)
place('medicine-table', (table[0], 0, table[1]))
place('medicine-disposal-bin', (0, 0.705, table[1] + 0.22))
for mx in (92, 868):
    x, z = world(mx, 558)
    place('waiting-benches', (x, 0, z))
recovery = world(888, 288)
place('recovery-area', (recovery[0], 0, recovery[1]))
desk = world(72, 284)
place('pc-terminal', (desk[0] - 2.5 + 0.8, 0.84, desk[1]))
place('center-sign', (0, 2.36, world(480, -66)[1] - 0.02))
entrance = world(480, 606 + 0.4 * c.TILE)
place('entrance-door', (entrance[0], 0, entrance[1]), hide=('EntranceHeader_Runtime',))

yaw, elevation, radius, half_width = 0.08, math.pi / 4, 32, 17.4
camera_runtime = (math.sin(yaw) * math.cos(elevation) * radius, math.sin(elevation) * radius,
                  math.cos(yaw) * math.cos(elevation) * radius)
cam_data = bpy.data.cameras.new('GameCamera')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2 * half_width
camera = bpy.data.objects.new('GameCamera', cam_data)
scene.collection.objects.link(camera)
camera.location = (camera_runtime[0], -camera_runtime[2], camera_runtime[1])
target = Vector((0, 0, 0.65))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera
sun_data = bpy.data.lights.new('KeySun', 'SUN')
sun_data.energy = 2.4
sun_data.angle = 0.4
sun = bpy.data.objects.new('KeySun', sun_data)
sun.rotation_euler = (0.65, 0.2, -0.5)
scene.collection.objects.link(sun)
world_data = bpy.data.worlds.new('OverviewWorld')
world_data.use_nodes = True
world_data.node_tree.nodes['Background'].inputs['Color'].default_value = (0.1, 0.16, 0.22, 1)
world_data.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.6
scene.world = world_data
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.eevee.taa_render_samples = 32
c.render_preview(scene, 'art/previews/clinic-overview.png')
print('OVERVIEW_DONE')
