import { describe, expect, it } from 'vitest';
import { RoomDirectory, normalizeRoomCode, validatePlayerName } from './RoomDirectory.js';

describe('room codes', () => {
  it('normalizes a valid case-insensitive code and rejects ambiguous characters', () => {
    expect(normalizeRoomCode(' abc234 ')).toBe('ABC234');
    expect(normalizeRoomCode('ABCO12')).toBeNull();
    expect(normalizeRoomCode('ABC23')).toBeNull();
  });

  it('retries collisions and releases codes when rooms close', () => {
    const codes = ['ABC234', 'ABC234', 'DEF567'];
    const directory = new RoomDirectory(() => codes.shift() ?? 'XYZ789');
    expect(directory.register('room-1')).toBe('ABC234');
    expect(directory.register('room-2')).toBe('DEF567');
    expect(directory.roomIdFor('ABC234')).toBe('room-1');
    directory.unregister('room-1');
    expect(directory.roomIdFor('ABC234')).toBeUndefined();
  });
});

describe('player names', () => {
  it('accepts trimmed visible names up to 16 characters', () => {
    expect(validatePlayerName('  Red  ')).toBe('Red');
    expect(validatePlayerName('P'.repeat(16))).toBe('P'.repeat(16));
  });

  it('rejects blank, overlong, and control-character names', () => {
    expect(validatePlayerName('   ')).toBeNull();
    expect(validatePlayerName('P'.repeat(17))).toBeNull();
    expect(validatePlayerName('Red\nBlue')).toBeNull();
  });
});
