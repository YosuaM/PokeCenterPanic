import { ART_WIDTH } from './menuAtmosphereModel.js';

/** Pokémon that live in the title-screen artwork; coordinates are artwork pixels at their feet. */
export interface Point { x: number; y: number }
export interface CritterPose {
  species: string;
  animation: 'idle' | 'walk' | 'hover';
  /** PMD sheet row: 0 down, then counter-clockwise through right (2), up (4) and left (6). */
  row: number;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  /** Seconds into the current animation, for frame timing. */
  clock: number;
}

/** From the bottom of the stone path up to the clinic door. */
export const PATIENT_ROUTE: readonly Point[] = [
  { x: 455, y: 975 }, { x: 428, y: 890 }, { x: 400, y: 822 }, { x: 412, y: 762 },
  { x: 450, y: 712 }, { x: 478, y: 676 }, { x: 492, y: 648 },
];
export const PATIENT_SPECIES = ['Pikachu', 'Eevee', 'Charmander', 'Psyduck', 'Squirtle', 'Bulbasaur'] as const;
export const PATIENT_CYCLE_SECONDS = 20;
export const PATIENT_WALK_SECONDS = 13;
const PATIENT_FADE_SECONDS = 0.8;
export const GREETER: Point = { x: 584, y: 652 };
export const WANDER: readonly [Point, Point] = [{ x: 302, y: 772 }, { x: 520, y: 868 }];
const WANDER_WALK_SECONDS = 6;
const WANDER_REST_SECONDS = 4;

export function routeLength(route: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < route.length; index += 1) {
    length += Math.hypot(route[index]!.x - route[index - 1]!.x, route[index]!.y - route[index - 1]!.y);
  }
  return length;
}

/** Position and heading at a distance along a polyline, clamped to its ends. */
export function routePoint(route: readonly Point[], distance: number): Point & { dx: number; dy: number } {
  let left = Math.max(0, distance);
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1]!, to = route[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (left <= length || index === route.length - 1) {
      const t = length ? Math.min(1, left / length) : 1;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, dx: to.x - from.x, dy: to.y - from.y };
    }
    left -= length;
  }
  const only = route[0]!;
  return { ...only, dx: 0, dy: 1 };
}

/** The eight-way PMD row that faces along a screen-space heading (y grows downward). */
export function facingRow(dx: number, dy: number): number {
  if (!dx && !dy) return 0;
  return ((Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) % 8) + 8) % 8;
}

/** Index of the frame shown after the given seconds, using PMD durations in 1/60 s ticks. */
export function frameAt(durations: readonly number[], seconds: number): number {
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (!total) return 0;
  let tick = ((seconds * 60) % total + total) % total;
  for (let index = 0; index < durations.length; index += 1) {
    tick -= durations[index]!;
    if (tick < 0) return index;
  }
  return durations.length - 1;
}

/** Further up the path is further from the viewer. */
export function depthScale(y: number): number {
  return 3.5 + Math.min(1, Math.max(0, (y - 640) / 330)) * 0.8;
}

export function patientPose(seconds: number): CritterPose | null {
  const cycle = Math.floor(seconds / PATIENT_CYCLE_SECONDS);
  const time = seconds - cycle * PATIENT_CYCLE_SECONDS;
  if (time >= PATIENT_WALK_SECONDS + PATIENT_FADE_SECONDS) return null;
  const length = routeLength(PATIENT_ROUTE);
  const point = routePoint(PATIENT_ROUTE, length * Math.min(1, time / PATIENT_WALK_SECONDS));
  const arrived = time >= PATIENT_WALK_SECONDS;
  return { species: PATIENT_SPECIES[((cycle % PATIENT_SPECIES.length) + PATIENT_SPECIES.length) % PATIENT_SPECIES.length]!,
    animation: arrived ? 'idle' : 'walk', row: facingRow(point.dx, point.dy), x: point.x, y: point.y,
    scale: depthScale(point.y), alpha: arrived ? Math.max(0, 1 - (time - PATIENT_WALK_SECONDS) / PATIENT_FADE_SECONDS) : 1,
    clock: time };
}

/** Chansey waits by the door and turns to watch the arriving patient. */
export function greeterPose(seconds: number, patient: CritterPose | null): CritterPose {
  const row = patient ? facingRow(patient.x - GREETER.x, patient.y - GREETER.y) : 7;
  return { species: 'Chansey', animation: 'idle', row, x: GREETER.x, y: GREETER.y, scale: depthScale(GREETER.y), alpha: 1,
    clock: seconds };
}

/** Meowth strolls along the lower path, resting at each end. */
export function wanderPose(seconds: number): CritterPose {
  const leg = WANDER_WALK_SECONDS + WANDER_REST_SECONDS;
  const index = Math.floor(seconds / leg);
  const time = seconds - index * leg;
  const [from, to] = index % 2 ? [WANDER[1], WANDER[0]] : [WANDER[0], WANDER[1]];
  const walking = time < WANDER_WALK_SECONDS;
  const t = walking ? time / WANDER_WALK_SECONDS : 1;
  const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t;
  return { species: 'Meowth', animation: walking ? 'walk' : 'idle', row: walking ? facingRow(to.x - from.x, to.y - from.y) : 0,
    x, y, scale: depthScale(y), alpha: 1, clock: walking ? time : time - WANDER_WALK_SECONDS };
}

export const FLIGHT_CYCLE_SECONDS = 45;
export const FLIGHT_START_SECONDS = 3;
export const FLIGHT_SECONDS = 16;
const FLIGHT_MARGIN = 200;
/** One climb-and-glide wave of the flight path. */
export const FLIGHT_WAVE_SECONDS = 5;
const FLIGHT_WAVE_HEIGHT = 30;

/**
 * Lugia crosses the sky in waves, alternating direction each pass: it flaps (Hover) while it climbs
 * and glides (Walk) while it sinks.
 */
export function flyerPose(seconds: number): CritterPose | null {
  const cycle = Math.floor(seconds / FLIGHT_CYCLE_SECONDS);
  const time = seconds - cycle * FLIGHT_CYCLE_SECONDS - FLIGHT_START_SECONDS;
  if (time < 0 || time > FLIGHT_SECONDS) return null;
  const rightward = cycle % 2 === 0;
  const progress = time / FLIGHT_SECONDS;
  const from = rightward ? -FLIGHT_MARGIN : ART_WIDTH + FLIGHT_MARGIN;
  const to = rightward ? ART_WIDTH + FLIGHT_MARGIN : -FLIGHT_MARGIN;
  const altitude = rightward ? 160 - 70 * progress : 100 + 50 * progress;
  const phase = (time / FLIGHT_WAVE_SECONDS) * Math.PI * 2;
  // Height grows upward, so the path climbs while sin falls; flap through the climb, glide down the rest.
  const climbing = Math.cos(phase) < 0;
  return { species: 'Lugia', animation: climbing ? 'hover' : 'walk', row: rightward ? 2 : 6,
    x: from + (to - from) * progress, y: altitude + Math.sin(phase) * FLIGHT_WAVE_HEIGHT, scale: 2.1, alpha: 1, clock: time };
}

/** Everyone on screen, back to front. */
export function critterPoses(seconds: number): CritterPose[] {
  const patient = patientPose(seconds);
  return [greeterPose(seconds, patient), wanderPose(seconds), ...(patient ? [patient] : [])].sort((a, b) => a.y - b.y);
}
