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
}

export interface PlayerInput {
  direction: import('./map.js').Direction | null;
  sequence: number;
  roundId: null;
}

export * from './map.js';

export const PROJECT_INFO = {
  title: 'PokéCenter Panic',
  roomName: 'prototype',
} as const satisfies ProjectInfo;
