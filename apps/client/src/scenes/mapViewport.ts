import type { Point } from '@pokecenter/shared';

// Match the original SVG fallback's world-to-screen transform; HUD coordinates stay fixed.
export const MAP_2D_SCALE = 0.38;
export function mapViewportPoint(point: Point): Point {
  return { x: 480 + (point.x - 480) * MAP_2D_SCALE, y: 270 + (point.y - 270) * MAP_2D_SCALE };
}
