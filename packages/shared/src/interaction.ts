import { isWalkable, PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH,
  type Direction, type MapObstacle, type Point, TILE_SIZE } from './map.js';

export interface InteractionTarget {
  id: string;
  position: Point;
  bounds?: MapObstacle;
  expectedOccupantId: string;
  label: string;
}

function interactionPoint(player: Point, target: Point | MapObstacle): Point {
  if (!('width' in target)) return target;
  // Measure reach from where the player's collision body can touch the station.
  return {
    x: Math.max(target.x - PLAYER_HALF_WIDTH,
      Math.min(player.x, target.x + target.width + PLAYER_HALF_WIDTH)),
    y: Math.max(target.y - PLAYER_HALF_HEIGHT,
      Math.min(player.y, target.y + target.height + PLAYER_HALF_HEIGHT)),
  };
}

export function isInteractionReachable(player: Point, _facing: Direction, target: Point | MapObstacle): boolean {
  if (!isWalkable(player)) return false;
  const point = interactionPoint(player, target);
  if (!isWalkable(point)) return false;
  const dx = point.x - player.x;
  const dy = point.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance > TILE_SIZE) return false;
  for (let traveled = 4; traveled < distance; traveled += 4) {
    const fraction = traveled / distance;
    if (!isWalkable({ x: player.x + dx * fraction, y: player.y + dy * fraction })) return false;
  }
  return true;
}

export function selectInteractionTarget(player: Point, facing: Direction,
  targets: readonly InteractionTarget[]): InteractionTarget | null {
  let selected: InteractionTarget | null = null;
  let selectedDistance = Infinity;
  let selectedAnchorDistance = Infinity;
  for (const target of targets) {
    const location = target.bounds ?? target.position;
    if (!isInteractionReachable(player, facing, location)) continue;
    const position = interactionPoint(player, location);
    const dx = position.x - player.x;
    const dy = position.y - player.y;
    const distance = dx * dx + dy * dy;
    const anchorDistance = (target.position.x - player.x) ** 2 + (target.position.y - player.y) ** 2;
    if (distance < selectedDistance || (distance === selectedDistance &&
      (anchorDistance < selectedAnchorDistance || (anchorDistance === selectedAnchorDistance &&
        target.id < (selected?.id ?? ''))))) {
      selected = target.bounds ? { ...target, position } : target;
      selectedDistance = distance;
      selectedAnchorDistance = anchorDistance;
    }
  }
  return selected;
}
