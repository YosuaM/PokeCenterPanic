import type { AddressInfo } from 'node:net';
import { Client } from '@colyseus/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_INFO } from '@pokecenter/shared';
import { createGameServer, resolvePort } from './server.js';

describe('resolvePort', () => {
  it('uses the default when PORT is absent', () => {
    expect(resolvePort(undefined)).toBe(2567);
  });

  it('accepts an available numeric port', () => {
    expect(resolvePort('4000')).toBe(4000);
  });

  it.each(['', '0', '-1', '65536', '1.5', '0x100', ' 4000 ', 'invalid'])('rejects invalid PORT=%s', (value) => {
    expect(() => resolvePort(value)).toThrow('PORT must be an integer between 1 and 65535');
  });
});

describe('Colyseus startup', () => {
  const server = createGameServer();

  afterEach(async () => {
    await server.gracefullyShutdown(false);
  });

  it('accepts a client in the registered prototype room', async () => {
    await server.listen(0, '127.0.0.1');
    const transport = server.transport as { server: { address(): AddressInfo | string | null } };
    const address = transport.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address');

    const client = new Client(`ws://127.0.0.1:${address.port}`);
    const room = await client.joinOrCreate(PROJECT_INFO.roomName);

    expect(room.name).toBe(PROJECT_INFO.roomName);
    await room.leave();
  });
});
