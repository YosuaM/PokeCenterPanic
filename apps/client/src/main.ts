import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig.js';
import { LobbyController } from './rooms/LobbyController.js';
import { RoomGateway } from './rooms/RoomGateway.js';
import { MapScene } from './scenes/MapScene.js';
import { visualFixture } from './scenes/visualFixtures.js';
import { RoomInterface } from './ui/RoomInterface.js';
import { initializeMenuAtmosphere } from './ui/menuAtmosphere.js';
import { CharacterPortraits } from './ui/characterPortraits.js';

const game = new Phaser.Game(GAME_CONFIG);
const disposeAtmosphere = initializeMenuAtmosphere(document);
import.meta.hot?.dispose(disposeAtmosphere);
const portraits = new CharacterPortraits(document);
const ui = new RoomInterface(document, {
  create: (name) => { void controller.create(name); },
  join: (code, name) => { void controller.join(code, name); },
  leave: () => { void controller.leave(); },
  selectCharacter: (character) => controller.selectCharacter(character),
  ready: (ready) => controller.setReady(ready),
  start: () => controller.startGame(),
  replay: () => controller.replay(),
}, undefined, portraits);
void portraits.load();
import.meta.hot?.dispose(() => portraits.dispose());

function mapScene(): MapScene {
  return game.scene.getScene('map') as MapScene;
}

const serverUrl = import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:2567`;
const controller = new LobbyController(new RoomGateway(serverUrl), {
  setBusy: (busy) => ui.setBusy(busy),
  showRoom(code, players, localId) {
    ui.showRoom(code, players, localId);
    mapScene().setPlayers(players.filter((player) => player.connected !== false), localId);
    mapScene().setInputSender((direction, interactHeld) => controller.sendInput(direction, interactHeld));
    mapScene().setInteractionSender((request) => controller.sendInteraction(request));
  },
  showPositions: (positions) => mapScene().setAuthoritativePositions(positions),
  showPatients: (patients) => mapScene().setPatients(patients),
  showMedicines: (doses, surfaces, owners, remainingMs) =>
    mapScene().setMedicines(doses, surfaces, owners, remainingMs),
  showMedicineDiscard: (event) => mapScene().showMedicineDiscard(event),
  showInteractionResult: (result) => mapScene().setInteractionResult(result),
  showHealingMachine: (machine, second) => mapScene().setHealingMachine(machine, second),
  showDischargedCount: (count) => mapScene().setDischargedCount(count),
  showLostCount: (count) => mapScene().setLostCount(count),
  showPhase(snapshot, localId) {
    ui.showPhase(snapshot, localId);
    mapScene().setGameplayActive(snapshot.phase === 'running');
    if (snapshot.phase === 'running' && !game.loop.running) game.loop.wake();
    if (snapshot.phase !== 'running' && game.loop.running) game.loop.sleep();
  },
  showRound(snapshot) {
    mapScene().setRoundProgress(snapshot.remainingMs, snapshot.score);
    if (snapshot.results) ui.showResults(snapshot.results);
  },
  showLobbyResult: (reason) => ui.showStatus(reason),
  showMenu(message) {
    ui.showMenu(message);
    mapScene().setGameplayActive(false);
    mapScene().clearPlayers();
    game.loop.sleep();
  },
}, sessionStorage);

if (import.meta.env.DEV && visualFixture(new URLSearchParams(location.search).get('artFixture'))) {
  ui.showFixture();
} else {
  ui.setBusy(true);
  game.events.once(Phaser.Core.Events.READY, () => {
    const scene = mapScene();
    scene.setGameplayActive(false);
    scene.events.once(Phaser.Scenes.Events.CREATE, () => {
      game.loop.sleep();
      ui.setBusy(false);
      ui.showStatus('');
      void controller.restore();
    });
  });
}
