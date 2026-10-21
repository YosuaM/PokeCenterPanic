import type { Client } from '@colyseus/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomGateway } from './RoomGateway.js';

const reservation = { name: 'prototype', roomId: 'room-1', sessionId: 'seat-1' };

describe('RoomGateway', () => {
  const consumeSeatReservation = vi.fn();
  const reconnect = vi.fn();
  const client = { consumeSeatReservation, reconnect } as unknown as
    Pick<Client, 'consumeSeatReservation' | 'reconnect'>;

  beforeEach(() => {
    consumeSeatReservation.mockReset().mockResolvedValue({ roomId: 'room-1' });
    reconnect.mockReset().mockResolvedValue({ roomId: 'room-1', sessionId: 'seat-1' });
  });

  it('reconnects only with the opaque token and reports invalid or closed reservations', async () => {
    const gateway = new RoomGateway('http://127.0.0.1:2567', fetch, client);
    await expect(gateway.reconnect('room-1:secret', 'ABC234')).resolves.toEqual({
      code: 'ABC234', room: { roomId: 'room-1', sessionId: 'seat-1' },
    });
    expect(reconnect).toHaveBeenCalledWith('room-1:secret');
    reconnect.mockRejectedValueOnce(new Error('reconnection token invalid or expired'));
    await expect(gateway.reconnect('room-1:wrong', 'ABC234')).rejects.toThrow('reservation has expired');
    reconnect.mockRejectedValueOnce(new Error('room disposed'));
    await expect(gateway.reconnect('room-1:secret', 'ABC234')).rejects.toThrow('room has closed');
  });

  it('creates and consumes a server-reserved seat', async () => {
    const request = vi.fn(async () => Response.json({ code: 'ABC234', reservation }));
    const gateway = new RoomGateway('http://127.0.0.1:2567', request as typeof fetch, client);
    const joined = await gateway.create('Red');
    expect(joined.code).toBe('ABC234');
    expect(joined.room.roomId).toBe('room-1');
    expect(request).toHaveBeenCalledWith(new URL('http://127.0.0.1:2567/api/rooms'), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ name: 'Red' }),
    }));
    expect(consumeSeatReservation).toHaveBeenCalledWith(reservation);
  });

  it('passes the code and presents server errors', async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ error: 'Room is full' }, { status: 409 });
    });
    const gateway = new RoomGateway('http://127.0.0.1:2567', request as typeof fetch, client);
    await expect(gateway.join(' abc234 ', 'Blue')).rejects.toThrow('Room is full');
    expect(request.mock.calls[0]?.[0]).toEqual(new URL('http://127.0.0.1:2567/api/rooms/abc234/join'));
  });

  it('reports transport failure in plain language', async () => {
    const gateway = new RoomGateway('http://127.0.0.1:2567', vi.fn().mockRejectedValue(new Error('offline')), client);
    await expect(gateway.create('Red')).rejects.toThrow('Server unavailable');
  });

  it('reports a malformed server response in plain language', async () => {
    const gateway = new RoomGateway('http://127.0.0.1:2567', vi.fn(async () => new Response('broken')), client);
    await expect(gateway.create('Red')).rejects.toThrow('Could not enter the room');
  });

  it('calls the browser fetch function without binding it to the gateway', async () => {
    const request = vi.fn(function (this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(Response.json({ code: 'ABC234', reservation }));
    });
    const gateway = new RoomGateway('http://127.0.0.1:2567', request as typeof fetch, client);
    await gateway.create('Red');
    expect(request).toHaveBeenCalledOnce();
  });
});
