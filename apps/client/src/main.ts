import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig.js';
import { LobbyController } from './rooms/LobbyController.js';
import { RoomGateway } from './rooms/RoomGateway.js';
import { MapScene } from './scenes/MapScene.js';
import { PLAYER_CHARACTERS, type PlayerCharacter, type PlayerPresence,
  type RoomPhaseSnapshot } from '@pokecenter/shared';

const game = new Phaser.Game(GAME_CONFIG);

const nameInput = document.querySelector<HTMLInputElement>('#player-name')!;
const codeInput = document.querySelector<HTMLInputElement>('#room-code-input')!;
const createForm = document.querySelector<HTMLFormElement>('#create-room')!;
const joinForm = document.querySelector<HTMLFormElement>('#join-room')!;
const leaveButton = document.querySelector<HTMLButtonElement>('#leave-room')!;
const menu = document.querySelector<HTMLElement>('#room-menu')!;
const lobby = document.querySelector<HTMLElement>('#room-lobby')!;
const roomCode = document.querySelector<HTMLElement>('#room-code')!;
const players = document.querySelector<HTMLElement>('#room-players')!;
const status = document.querySelector<HTMLElement>('#room-status')!;
const panel = document.querySelector<HTMLElement>('#room-panel')!;
const phaseText = document.querySelector<HTMLElement>('#room-phase')!;
const characterSelect = document.querySelector<HTMLSelectElement>('#character-select')!;
const readyButton = document.querySelector<HTMLButtonElement>('#ready-button')!;
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!;
const lobbyControls = document.querySelector<HTMLElement>('#lobby-controls')!;
let currentPlayers: PlayerPresence[] = [];
let currentLocalId = '';
let currentPhase: RoomPhaseSnapshot = { phase: 'lobby', hostId: '',
  countdownRemainingMs: 0, roundId: '' };

function playerStatus(player: PlayerPresence): string {
  if (player.connected === false) {
    return `reconnecting (${Math.ceil((player.reconnectRemainingMs ?? 0) / 1000)}s)`;
  }
  return player.ready ? 'ready' : 'not ready';
}

function renderLobby(): void {
  const self = currentPlayers.find((player) => player.id === currentLocalId);
  players.textContent = currentPlayers.length ? currentPlayers.map((player) =>
    `#${player.slot + 1} ${player.name}${player.id === currentLocalId ? ' (you)' : ''} · ${player.character || 'no character'} · ${playerStatus(player)}`
  ).join('  |  ') : 'Connecting players…';
  panel.classList.toggle('is-playing', currentPhase.phase === 'running');
  lobbyControls.hidden = currentPhase.phase !== 'lobby';
  phaseText.textContent = currentPhase.phase === 'countdown' ?
    `Starting in ${Math.ceil(currentPhase.countdownRemainingMs / 1000)}…` :
    currentPhase.phase === 'running' ? 'Round in progress' : 'Choose a character and ready up';
  characterSelect.value = self?.character ?? '';
  readyButton.textContent = self?.ready ? 'Not ready' : 'Ready';
  readyButton.disabled = !self?.character;
  startButton.hidden = currentPhase.hostId !== currentLocalId;
  startButton.disabled = !currentPlayers.length || currentPlayers.some((player) => !player.ready ||
    player.connected === false);
}

function mapScene(): MapScene {
  return game.scene.getScene('map') as MapScene;
}

const serverUrl = import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:2567`;
const controller = new LobbyController(new RoomGateway(serverUrl), {
  setBusy(busy) {
    for (const button of [createForm, joinForm]) {
      button.querySelector('button')!.disabled = busy;
    }
  },
  showRoom(code, connectedPlayers, localId) {
    menu.hidden = true;
    lobby.hidden = false;
    roomCode.textContent = code;
    currentPlayers = connectedPlayers;
    currentLocalId = localId;
    renderLobby();
    status.textContent = '';
    mapScene().setPlayers(connectedPlayers.filter((player) => player.connected !== false), localId);
    mapScene().setGameplayActive(currentPhase.phase === 'running');
    mapScene().setInputSender((direction) => controller.sendInput(direction));
    mapScene().setInteractionSender((request) => controller.sendInteraction(request));
  },
  showPositions(positions) {
    mapScene().setAuthoritativePositions(positions);
  },
  showPatients(patients) {
    mapScene().setPatients(patients);
  },
  showInteractionResult(result) {
    mapScene().setInteractionResult(result);
  },
  showHealingMachine(machine) {
    mapScene().setHealingMachine(machine);
  },
  showDischargedCount(count) {
    mapScene().setDischargedCount(count);
  },
  showPhase(snapshot) {
    currentPhase = snapshot;
    renderLobby();
    mapScene().setGameplayActive(snapshot.phase === 'running');
  },
  showLobbyResult(reason) {
    status.textContent = reason;
  },
  showMenu(message) {
    menu.hidden = false;
    lobby.hidden = true;
    panel.classList.remove('is-playing');
    currentPlayers = [];
    currentLocalId = '';
    currentPhase = { phase: 'lobby', hostId: '', countdownRemainingMs: 0, roundId: '' };
    status.textContent = message;
    mapScene().clearPlayers();
  },
}, sessionStorage);

void controller.restore();

createForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void controller.create(nameInput.value);
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void controller.join(codeInput.value, nameInput.value);
});

leaveButton.addEventListener('click', () => {
  void controller.leave();
});

characterSelect.addEventListener('change', () => {
  const character = characterSelect.value;
  if (PLAYER_CHARACTERS.includes(character as PlayerCharacter)) {
    controller.selectCharacter(character as PlayerCharacter);
  }
});

readyButton.addEventListener('click', () => {
  controller.setReady(!currentPlayers.find((player) => player.id === currentLocalId)?.ready);
});

startButton.addEventListener('click', () => controller.startGame());
