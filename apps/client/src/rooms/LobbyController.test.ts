import type { Room } from '@colyseus/sdk';
import { describe, expect, it, vi } from 'vitest';
import { LobbyController, type LobbyGateway, type LobbyView } from './LobbyController.js';

function setup() {
  let message: ((players: string[]) => void) | undefined;
  let disconnected: (() => void) | undefined;
  const room = {
    leave: vi.fn(async () => 1000),
    send: vi.fn(),
    onMessage: vi.fn((_type, listener) => { message = listener; }),
    onLeave: vi.fn((listener) => { disconnected = listener; }),
  } as unknown as Room;
  const gateway: LobbyGateway = {
    create: vi.fn(async () => ({ code: 'ABC234', room })),
    join: vi.fn(async () => ({ code: 'ABC234', room })),
  };
  const view: LobbyView = {
    setBusy: vi.fn(),
    showRoom: vi.fn(),
    showMenu: vi.fn(),
  };
  return { controller: new LobbyController(gateway, view), gateway, view, room,
    players: (names: string[]) => message?.(names), disconnect: () => disconnected?.() };
}

describe('LobbyController', () => {
  it('creates a room, shows its code, and updates the connected player list', async () => {
    const { controller, gateway, view, room, players } = setup();
    await controller.create('Red');
    expect(gateway.create).toHaveBeenCalledWith('Red');
    expect(view.showRoom).toHaveBeenCalledWith('ABC234', []);
    expect(room.send).toHaveBeenCalledWith('lobby:sync');
    players(['Red', 'Blue']);
    expect(view.showRoom).toHaveBeenCalledWith('ABC234', ['Red', 'Blue']);
    expect(view.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('joins by code and returns to the menu when leaving', async () => {
    const { controller, gateway, view, room } = setup();
    await controller.join('abc234', 'Blue');
    expect(gateway.join).toHaveBeenCalledWith('abc234', 'Blue');
    await controller.leave();
    expect(room.leave).toHaveBeenCalled();
    expect(view.showMenu).toHaveBeenCalledWith('You left the room.');
  });

  it('shows a server error and clears a disconnected room', async () => {
    const { controller, gateway, view, disconnect } = setup();
    vi.mocked(gateway.join).mockRejectedValueOnce(new Error('Invalid room code'));
    await controller.join('bad', 'Blue');
    expect(view.showMenu).toHaveBeenCalledWith('Invalid room code');
    await controller.create('Red');
    disconnect();
    expect(view.showMenu).toHaveBeenCalledWith('Connection to the room was lost.');
  });
});
