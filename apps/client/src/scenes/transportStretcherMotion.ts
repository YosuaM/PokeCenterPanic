import { CarriedItemMotion } from './carriedItemMotion.js';

export class TransportStretcherMotion extends CarriedItemMotion {
  constructor() { super({ lift: 0.025, roll: 0.018 }); }
}
