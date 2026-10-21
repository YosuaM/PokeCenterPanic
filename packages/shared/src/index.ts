export interface ProjectInfo {
  title: string;
  roomName: string;
}

export const PROJECT_INFO = {
  title: 'PokéCenter Panic',
  roomName: 'prototype',
} as const satisfies ProjectInfo;
