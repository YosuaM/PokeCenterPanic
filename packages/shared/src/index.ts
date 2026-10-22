export interface ProjectInfo {
  title: string;
  roomName: string;
}

export interface PlayerPresence {
  id: string;
  name: string;
  slot: number;
  character?: PlayerCharacter;
  ready?: boolean;
  connected?: boolean;
  reconnectRemainingMs?: number;
}

export const PLAYER_CHARACTERS = ['Chansey', 'Audino', 'Machoke', 'Meowth'] as const;
export type PlayerCharacter = typeof PLAYER_CHARACTERS[number];
export type RoomPhase = 'lobby' | 'countdown' | 'running' | 'results';

export interface RoomPhaseSnapshot {
  phase: RoomPhase;
  hostId: string;
  countdownRemainingMs: number;
  roundId: string;
}

export interface PlayerPosition {
  id: string;
  x: number;
  y: number;
  facing: import('./map.js').Direction;
  carriedPatientId: string;
  carriedMedicineId?: string;
}

export interface PlayerInput {
  direction: import('./map.js').Direction | null;
  interactHeld?: boolean;
  sequence: number;
  roundId: string | null;
}

export * from './map.js';
export * from './interaction.js';
export * from './stationInteractions.js';
export * from './patient.js';
export * from './patientTravel.js';
export * from './medicine.js';
export * from './round.js';

export const PROJECT_INFO = {
  title: 'PokéCenter Panic',
  roomName: 'prototype',
} as const satisfies ProjectInfo;
