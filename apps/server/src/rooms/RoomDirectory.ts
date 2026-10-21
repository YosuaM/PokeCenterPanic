import { randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code) ? code : null;
}

export function validatePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').trim();
  const length = Array.from(name).length;
  return length >= 1 && length <= 16 && !/[\p{C}]/u.test(name) ? name : null;
}

export class RoomDirectory {
  private readonly roomsByCode = new Map<string, string>();
  private readonly codesByRoom = new Map<string, string>();
  private readonly phasesByRoom = new Map<string, string>();

  constructor(private readonly generateCode = () =>
    Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')) {}

  register(roomId: string): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = this.generateCode();
      if (!normalizeRoomCode(code) || this.roomsByCode.has(code)) continue;
      this.roomsByCode.set(code, roomId);
      this.codesByRoom.set(roomId, code);
      this.phasesByRoom.set(roomId, 'lobby');
      return code;
    }
    throw new Error('Could not allocate a unique room code');
  }

  roomIdFor(code: string): string | undefined {
    return this.roomsByCode.get(code);
  }

  codeFor(roomId: string): string | undefined {
    return this.codesByRoom.get(roomId);
  }

  phaseFor(roomId: string): string | undefined {
    return this.phasesByRoom.get(roomId);
  }

  setPhase(roomId: string, phase: string): void {
    if (this.codesByRoom.has(roomId)) this.phasesByRoom.set(roomId, phase);
  }

  unregister(roomId: string): void {
    const code = this.codesByRoom.get(roomId);
    if (code) this.roomsByCode.delete(code);
    this.codesByRoom.delete(roomId);
    this.phasesByRoom.delete(roomId);
  }
}
