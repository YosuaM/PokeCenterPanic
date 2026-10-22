import { WALK_BOUNDS, MAP_OBSTACLES, RECEPTION_SLOT_POSITIONS, SPAWN_POINTS,
  WAITING_SLOT_POSITIONS, type MapObstacle, type Point } from '@pokecenter/shared';

export const WORLD_SCALE = 48;
export const WORLD_WIDTH = (WALK_BOUNDS.right - WALK_BOUNDS.left) / WORLD_SCALE;
export const WORLD_DEPTH = (WALK_BOUNDS.bottom - WALK_BOUNDS.top) / WORLD_SCALE;
export const CAMERA_HALF_WIDTH = 17.4;
export const CAMERA_HALF_HEIGHT = CAMERA_HALF_WIDTH * 9 / 16;
export const CAMERA_YAW = 0.08;
export const CAMERA_ELEVATION = Math.PI / 4;
export const CAMERA_RADIUS = 32;

export interface WorldPosition {
  x: number;
  z: number;
}

export interface WorldFootprint extends WorldPosition {
  width: number;
  depth: number;
}

export function worldPosition(point: Point): WorldPosition {
  return { x: (point.x - 480) / WORLD_SCALE, z: (point.y - 270) / WORLD_SCALE };
}

export function worldFootprint(obstacle: MapObstacle): WorldFootprint {
  return {
    x: (obstacle.x + obstacle.width / 2 - 480) / WORLD_SCALE,
    z: (obstacle.y + obstacle.height / 2 - 270) / WORLD_SCALE,
    width: obstacle.width / WORLD_SCALE,
    depth: obstacle.height / WORLD_SCALE,
  };
}

export function cameraPosition(yaw = CAMERA_YAW, elevation = CAMERA_ELEVATION):
  { x: number; y: number; z: number } {
  return {
    x: Math.sin(yaw) * Math.cos(elevation) * CAMERA_RADIUS,
    y: Math.sin(elevation) * CAMERA_RADIUS,
    z: Math.cos(yaw) * Math.cos(elevation) * CAMERA_RADIUS,
  };
}

export const ENTRANCE_3D_WIDTH = 6.16;
export const ENTRANCE_3D_POSITION = worldPosition({
  x: 480,
  y: WALK_BOUNDS.bottom + 0.4 * WORLD_SCALE,
});

export const CENTER_3D_FOOTPRINTS = MAP_OBSTACLES.map(worldFootprint);
export const RECEPTION_3D_SLOTS = RECEPTION_SLOT_POSITIONS.map(worldPosition);
export const WAITING_3D_SLOTS = WAITING_SLOT_POSITIONS.map(worldPosition);
export const STAFF_3D_SPAWNS = SPAWN_POINTS.map(worldPosition);

export const CENTER_3D_ROSTER = [
  ...['Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle'].map((name, index) => ({
    name, point: RECEPTION_3D_SLOTS[index]!, elevation: 0.93,
  })),
  ...['Eevee', 'Psyduck'].map((name, index) => ({
    name, point: WAITING_3D_SLOTS[index]!, elevation: 0.5,
  })),
  ...['Chansey', 'Audino', 'Machoke', 'Meowth'].map((name, index) => ({
    name, point: STAFF_3D_SPAWNS[index]!, elevation: 0.03,
  })),
];

export function orbitFromDrag(yaw: number, elevation: number, deltaX: number, deltaY: number):
  { yaw: number; elevation: number } {
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
  return {
    yaw: clamp(yaw + deltaX * 0.0035, -0.62, 0.62),
    elevation: clamp(elevation - deltaY * 0.0035, 0.46, 1.08),
  };
}
