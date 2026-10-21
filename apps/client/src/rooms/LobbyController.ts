import type { Room } from '@colyseus/sdk';
import type { JoinedRoom } from './RoomGateway.js';

export interface LobbyGateway {
  create(name: string): Promise<JoinedRoom>;
  join(code: string, name: string): Promise<JoinedRoom>;
}

export interface LobbyView {
  setBusy(busy: boolean): void;
  showRoom(code: string, players: string[]): void;
  showMenu(message: string): void;
}

export class LobbyController {
  private room: Room | null = null;
  private busy = false;

  constructor(private readonly gateway: LobbyGateway, private readonly view: LobbyView) {}

  async create(name: string): Promise<void> {
    await this.enter(() => this.gateway.create(name));
  }

  async join(code: string, name: string): Promise<void> {
    await this.enter(() => this.gateway.join(code, name));
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    if (room) await room.leave().catch(() => undefined);
    this.view.showMenu('You left the room.');
  }

  private async enter(connect: () => Promise<JoinedRoom>): Promise<void> {
    if (this.busy || this.room) return;
    this.busy = true;
    this.view.setBusy(true);
    try {
      const { code, room } = await connect();
      this.room = room;
      this.view.showRoom(code, []);
      room.onMessage('lobby:players', (players: string[]) => {
        if (this.room === room) this.view.showRoom(code, players);
      });
      room.onLeave(() => {
        if (this.room !== room) return;
        this.room = null;
        this.view.showMenu('Connection to the room was lost.');
      });
      room.send('lobby:sync');
    } catch (error) {
      this.view.showMenu(error instanceof Error ? error.message : 'Could not enter the room');
    } finally {
      this.busy = false;
      this.view.setBusy(false);
    }
  }
}
