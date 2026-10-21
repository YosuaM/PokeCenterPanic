import { Client, type Room, type SeatReservation } from '@colyseus/sdk';

export interface JoinedRoom {
  code: string;
  room: Room;
}

interface RoomResponse {
  code: string;
  reservation: SeatReservation;
}

export class RoomGateway {
  constructor(
    private readonly endpoint: string,
    private readonly request: typeof fetch = fetch,
    private readonly client: Pick<Client, 'consumeSeatReservation' | 'reconnect'> = new Client(endpoint),
  ) {}

  create(name: string): Promise<JoinedRoom> {
    return this.reserve('/api/rooms', name);
  }

  join(code: string, name: string): Promise<JoinedRoom> {
    return this.reserve(`/api/rooms/${encodeURIComponent(code.trim())}/join`, name);
  }

  async reconnect(token: string, code: string): Promise<JoinedRoom> {
    try {
      return { code, room: await this.client.reconnect(token) };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/expired|invalid reconnection token/i.test(message)) {
        throw new Error('Your reconnect reservation has expired. Join again from the lobby.', { cause: error });
      }
      if (/disposed|not found/i.test(message)) throw new Error('The room has closed.', { cause: error });
      throw new Error('Server unavailable. Check your connection and try again.', { cause: error });
    }
  }

  private async reserve(path: string, name: string): Promise<JoinedRoom> {
    let response: Response;
    try {
      const request = this.request;
      response = await request(new URL(path, this.endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch {
      throw new Error('Server unavailable. Check your connection and try again.');
    }

    let data: Partial<RoomResponse> & { error?: string };
    try {
      data = await response.json() as typeof data;
    } catch {
      throw new Error('Could not enter the room. Try again.');
    }
    if (!response.ok || !data.code || !data.reservation) {
      throw new Error(data.error ?? 'Could not enter the room');
    }

    try {
      return { code: data.code, room: await this.client.consumeSeatReservation(data.reservation) };
    } catch {
      throw new Error('Could not connect to the room. Try again.');
    }
  }
}
