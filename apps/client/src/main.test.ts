import { beforeEach, expect, it, vi } from 'vitest';
import type { LobbyView } from './rooms/LobbyController.js';

const state = vi.hoisted(() => {
  const gameEvents = new Map<string, () => void>();
  const sceneEvents = new Map<string, () => void>();
  const scene = { events: { once: vi.fn((event: string, callback: () => void) => sceneEvents.set(event, callback)) },
    setGameplayActive: vi.fn(), clearPlayers: vi.fn(), setPlayers: vi.fn(),
    setInputSender: vi.fn(), setInteractionSender: vi.fn(), setAuthoritativePositions: vi.fn(),
    setPatients: vi.fn(), setMedicines: vi.fn(), showMedicineDiscard: vi.fn(),
    setInteractionResult: vi.fn(), setHealingMachine: vi.fn(), setDischargedCount: vi.fn(),
    setLostCount: vi.fn(), setRoundProgress: vi.fn() };
  const loop = { running: true, sleep: vi.fn(() => { loop.running = false; }),
    wake: vi.fn(() => { loop.running = true; }) };
  const ui = { setBusy: vi.fn(), showRoom: vi.fn(), showPhase: vi.fn(), showResults: vi.fn(),
    showStatus: vi.fn(), showMenu: vi.fn(), showFixture: vi.fn() };
  const controller = { create: vi.fn(), join: vi.fn(), leave: vi.fn(), selectCharacter: vi.fn(),
    setReady: vi.fn(), startGame: vi.fn(), replay: vi.fn(), sendInput: vi.fn(),
    sendInteraction: vi.fn(), restore: vi.fn() };
  return { gameEvents, sceneEvents, scene, loop, ui, controller, portraits: { load: vi.fn(async () => {}), dispose: vi.fn() }, fixture: false,
    view: undefined as LobbyView | undefined };
});

vi.mock('phaser', () => ({ default: {
  Core: { Events: { READY: 'ready' } }, Scenes: { Events: { CREATE: 'create' } },
  Game: class {
    loop = state.loop;
    events = { once: vi.fn((event: string, callback: () => void) => state.gameEvents.set(event, callback)) };
    scene = { getScene: () => state.scene };
  },
} }));
vi.mock('./ui/characterPortraits.js', () => ({ CharacterPortraits: class { constructor() { return state.portraits; } } }));
vi.mock('./ui/menuAtmosphere.js', () => ({ initializeMenuAtmosphere: vi.fn(() => vi.fn()) }));
vi.mock('./gameConfig.js', () => ({ GAME_CONFIG: {} }));
vi.mock('./scenes/MapScene.js', () => ({ MapScene: class {} }));
vi.mock('./scenes/visualFixtures.js', () => ({ visualFixture: () => state.fixture }));
vi.mock('./ui/RoomInterface.js', () => ({ RoomInterface: class { constructor() { return state.ui; } } }));
vi.mock('./rooms/RoomGateway.js', () => ({ RoomGateway: class {} }));
vi.mock('./rooms/LobbyController.js', () => ({ LobbyController: class {
  constructor(_gateway: unknown, view: LobbyView) { state.view = view; return state.controller; }
} }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  state.gameEvents.clear(); state.sceneEvents.clear(); state.loop.running = true; state.fixture = false;
  vi.stubGlobal('document', {});
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', search: '' });
  vi.stubGlobal('sessionStorage', {});
});

it('waits until the map has loaded before restoring rooms and sleeps the hidden renderer', async () => {
  await import('./main.js');
  expect(state.ui.setBusy).toHaveBeenCalledWith(true);
  expect(state.portraits.load).toHaveBeenCalledOnce();
  expect(state.controller.restore).not.toHaveBeenCalled();
  state.gameEvents.get('ready')!();
  expect(state.scene.setGameplayActive).toHaveBeenCalledWith(false);
  expect(state.controller.restore).not.toHaveBeenCalled();
  state.sceneEvents.get('create')!();
  expect(state.loop.running).toBe(false);
  expect(state.ui.setBusy).toHaveBeenLastCalledWith(false);
  expect(state.controller.restore).toHaveBeenCalledOnce();
});

it('wakes gameplay only for a running round and hides it again for results, replay and leaving', async () => {
  await import('./main.js');
  state.gameEvents.get('ready')!(); state.sceneEvents.get('create')!();
  const phase = { phase: 'countdown' as const, hostId: 'host', countdownRemainingMs: 3000, roundId: 'round-1' };
  state.view!.showPhase(phase, 'host');
  expect(state.loop.running).toBe(false);
  expect(state.ui.showPhase).toHaveBeenCalledWith(phase, 'host');
  state.view!.showPhase({ ...phase, phase: 'running' }, 'host');
  expect(state.loop.running).toBe(true);
  expect(state.scene.setGameplayActive).toHaveBeenLastCalledWith(true);
  state.view!.showPhase({ ...phase, phase: 'results' }, 'host');
  expect(state.loop.running).toBe(false);
  const results = { score: 100, admitted: 1, discharged: 1, lost: 0, unfinished: 0, stars: 3 };
  state.view!.showRound({ remainingMs: 0, score: 100, results });
  expect(state.ui.showResults).toHaveBeenCalledWith(results);
  state.view!.showPhase({ ...phase, phase: 'lobby' }, 'host');
  expect(state.loop.running).toBe(false);
  state.view!.showPhase({ ...phase, phase: 'running' }, 'host');
  state.view!.showMenu('You left the room.');
  expect(state.ui.showMenu).toHaveBeenCalledWith('You left the room.');
  expect(state.scene.setGameplayActive).toHaveBeenLastCalledWith(false);
  expect(state.scene.clearPlayers).toHaveBeenCalledOnce();
  expect(state.loop.running).toBe(false);
});

it('keeps disconnected reservations in the interface and out of the playable scene', async () => {
  await import('./main.js');
  const players = [{ id: 'host', name: 'Red', slot: 0 },
    { id: 'guest', name: 'Blue', slot: 1, connected: false }];
  state.view!.showRoom('ABC234', players, 'host');
  expect(state.ui.showRoom).toHaveBeenCalledWith('ABC234', players, 'host');
  expect(state.scene.setPlayers).toHaveBeenCalledWith([players[0]], 'host');
});

it('leaves development art fixtures visible and running without restoring a private room', async () => {
  state.fixture = true;
  await import('./main.js');
  expect(state.ui.showFixture).toHaveBeenCalledOnce();
  expect(state.gameEvents.size).toBe(0);
  expect(state.controller.restore).not.toHaveBeenCalled();
  expect(state.loop.sleep).not.toHaveBeenCalled();
});
