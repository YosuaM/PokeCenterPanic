import type { Point } from '@pokecenter/shared';

export class CarriedItemMotion {
  private previous: Point | null = null;
  private lastTime = 0;
  private wasCarried = false;
  private phase = 0;
  private strength = 0;

  constructor(private readonly amplitude: { lift: number; roll: number }) {}

  update(point: Point, carried: boolean, timeMs: number): { lift: number; roll: number } {
    const distance = this.previous ? Math.hypot(point.x - this.previous.x, point.y - this.previous.y) : 0;
    const delta = (timeMs - this.lastTime) / 1000;
    const reset = !carried || !this.wasCarried || !this.previous || delta < 0 || delta > 0.25 || distance > 48;
    this.previous = { ...point };
    this.lastTime = timeMs;
    this.wasCarried = carried;
    if (reset) {
      this.phase = 0;
      this.strength = 0;
    } else if (delta > 0) {
      const moving = distance / delta > 4;
      this.strength += ((moving ? 1 : 0) - this.strength) * (1 - Math.exp(-delta * 12));
      if (this.strength < 0.001) this.strength = 0;
      this.phase = (this.phase + delta * Math.PI * 2 / 0.8) % (Math.PI * 2);
    }
    if (this.strength === 0) {
      this.phase = 0;
      return { lift: 0, roll: 0 };
    }
    return { lift: this.amplitude.lift * this.strength * (0.5 - 0.5 * Math.cos(this.phase * 2)),
      roll: this.amplitude.roll * this.strength * Math.sin(this.phase) };
  }
}
