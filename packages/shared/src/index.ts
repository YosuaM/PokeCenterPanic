export interface ProjectInfo {
  title: string;
  roomName: string;
}

export interface PlayerPresence {
  id: string;
  name: string;
  slot: number;
}

export interface PlayerPosition {
  id: string;
  x: number;
  y: number;
  facing: import('./map.js').Direction;
  carriedPatientId: string;
}

export interface PlayerInput {
  direction: import('./map.js').Direction | null;
  sequence: number;
  roundId: null;
}

export * from './map.js';
export * from './interaction.js';
export * from './patient.js';

export const PROJECT_INFO = {
  title: 'PokéCenter Panic',
  roomName: 'prototype',
} as const satisfies ProjectInfo;
