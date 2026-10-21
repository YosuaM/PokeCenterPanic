import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig.js';
import { LobbyController } from './rooms/LobbyController.js';
import { RoomGateway } from './rooms/RoomGateway.js';
import { MapScene } from './scenes/MapScene.js';

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
    panel.classList.add('is-playing');
    roomCode.textContent = code;
    players.textContent = connectedPlayers.length
      ? connectedPlayers.map((player) => player.name + (player.id === localId ? ' (you)' : '')).join(', ')
      : 'Connecting players…';
    status.textContent = '';
    mapScene().setPlayers(connectedPlayers, localId);
    mapScene().setInputSender((direction) => controller.sendInput(direction));
  },
  showPositions(positions) {
    mapScene().setAuthoritativePositions(positions);
  },
  showPatients(patients) {
    mapScene().setPatients(patients);
  },
  showMenu(message) {
    menu.hidden = false;
    lobby.hidden = true;
    panel.classList.remove('is-playing');
    status.textContent = message;
    mapScene().clearPlayers();
  },
});

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
