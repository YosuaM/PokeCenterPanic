import { PLAYER_CHARACTERS, type PlayerCharacter, type PlayerPresence } from '@pokecenter/shared';

export const ROOM_SEATS = 4;
export const INVITE_PARAMETER = 'room';

/** A shareable link that opens the join form with the room code filled in. */
export function inviteLink(base: string, code: string): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set(INVITE_PARAMETER, code);
  return url.toString();
}

/** The room code carried by an invite link, or null when the query has none or it is malformed. */
export function invitedCode(search: string): string | null {
  const code = new URLSearchParams(search).get(INVITE_PARAMETER)?.trim().toUpperCase() ?? '';
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

/** The next Pokémon in roster order that nobody but this bot holds, or null when none is free. */
export function cycleCharacter(bot: PlayerPresence, players: readonly PlayerPresence[], step: 1 | -1):
  PlayerCharacter | null {
  const taken = new Set(players.filter((player) => player.id !== bot.id).map((player) => player.character));
  const start = Math.max(0, PLAYER_CHARACTERS.indexOf(bot.character as PlayerCharacter));
  for (let offset = 1; offset < PLAYER_CHARACTERS.length; offset += 1) {
    const count = PLAYER_CHARACTERS.length;
    const candidate = PLAYER_CHARACTERS[((start + step * offset) % count + count) % count]!;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

export function openSeats(players: readonly PlayerPresence[]): number {
  return Math.max(0, ROOM_SEATS - players.length);
}

export function canStart(players: readonly PlayerPresence[]): boolean {
  return players.length > 0 && players.every((player) =>
    player.ready && PLAYER_CHARACTERS.includes(player.character as PlayerCharacter) && player.connected !== false) &&
    new Set(players.map((player) => player.character)).size === players.length;
}

export interface LobbyHint { text: string; tone: 'waiting' | 'action' | 'ready' }

/** One line telling the local player what the team is waiting for. */
export function lobbyHint(players: readonly PlayerPresence[], localId: string, hostId: string): LobbyHint {
  const self = players.find((player) => player.id === localId);
  if (!self) return { text: 'Joining the room…', tone: 'waiting' };
  if (!self.character) return { text: 'Pick a Pokémon below to join the shift.', tone: 'action' };
  if (!self.ready) return { text: 'Looking good! Press Ready when you are set.', tone: 'action' };
  const reconnecting = players.find((player) => player.connected === false);
  if (reconnecting) return { text: `Waiting for ${reconnecting.name} to reconnect…`, tone: 'waiting' };
  const pending = players.filter((player) => !player.ready || !player.character);
  if (pending.length) {
    const names = pending.map((player) => player.name);
    const list = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(' and ');
    return { text: `Waiting for ${list} to get ready…`, tone: 'waiting' };
  }
  if (localId === hostId) return { text: 'Everyone is ready. Start the shift!', tone: 'ready' };
  const host = players.find((player) => player.id === hostId);
  return { text: `Everyone is ready. Waiting for ${host?.name ?? 'the host'} to start…`, tone: 'ready' };
}
