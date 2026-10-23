import { PLAYER_CHARACTERS, type PlayerCharacter, type PlayerPresence,
  type RoomPhaseSnapshot, type RoundResults } from '@pokecenter/shared';
import { resultsPresentation } from '../rooms/roundPresentation.js';
import type { CharacterPortraits } from './characterPortraits.js';
import { CHARACTER_ROLE_TEXT } from './characterRoles.js';
import { ROOM_SEATS, canStart, cycleCharacter, inviteLink, lobbyHint, openSeats } from './lobbyModel.js';

interface RoomActions {
  create(name: string): void;
  join(code: string, name: string): void;
  leave(): void;
  selectCharacter(character: PlayerCharacter | null): void;
  ready(ready: boolean): void;
  start(): void;
  replay(): void;
  addBot?(): void;
  removeBot?(botId: string): void;
  setBotCharacter?(botId: string, character: PlayerCharacter): void;
}

const ROSTER_PORTRAIT_SIZE = 96;

const EMPTY_PHASE: RoomPhaseSnapshot = { phase: 'lobby', hostId: '',
  countdownRemainingMs: 0, roundId: '' };

export class RoomInterface {
  private readonly panel: HTMLElement;
  private readonly game: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly code: HTMLInputElement;
  private readonly create: HTMLFormElement;
  private readonly join: HTMLFormElement;
  private readonly createTab: HTMLButtonElement;
  private readonly joinTab: HTMLButtonElement;
  private readonly characters: HTMLButtonElement[];
  private readonly ready: HTMLButtonElement;
  private readonly start: HTMLButtonElement;
  private phase = EMPTY_PHASE;
  private players: PlayerPresence[] = [];
  private localId = '';
  private roomCode = '';
  private rosterSignature = '';
  private busy = false;
  private readonly copyLabels = new Map<HTMLElement, string>();

  constructor(private readonly document: Document, private readonly actions: RoomActions,
    private readonly clipboard: Pick<Clipboard, 'writeText'> | null = globalThis.navigator?.clipboard ?? null,
    private readonly portraits?: Pick<CharacterPortraits, 'create' | 'release' | 'setActive' | 'setSelected'>,
    private readonly inviteBase = '') {
    this.panel = this.element('#room-panel');
    this.game = this.element('#game');
    this.name = this.element('#player-name');
    this.code = this.element('#room-code-input');
    this.create = this.element('#create-room');
    this.join = this.element('#join-room');
    this.createTab = this.element('#create-tab');
    this.joinTab = this.element('#join-tab');
    this.characters = [...this.document.querySelectorAll<HTMLButtonElement>('#character-select button')];
    this.ready = this.element('#ready-button');
    this.start = this.element('#start-button');
    const tabs = [this.createTab, this.joinTab];
    for (const [index, tab] of tabs.entries()) {
      tab.addEventListener('click', () => this.selectTab(index === 1));
      tab.addEventListener('keydown', (event) => {
        if (this.busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
        this.selectTab(next === 1);
        tabs[next]!.focus();
      });
    }
    this.create.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.busy && this.name.reportValidity()) actions.create(this.name.value.trim());
    });
    this.join.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.busy && this.name.reportValidity() && this.code.reportValidity()) {
        actions.join(this.code.value.trim().toUpperCase(), this.name.value.trim());
      }
    });
    this.element('#leave-room').addEventListener('click', () => actions.leave());
    for (const character of this.characters) {
      const role = CHARACTER_ROLE_TEXT[character.value as PlayerCharacter];
      const caption = character.querySelector('.character-caption');
      if (role && caption && character.dataset.role !== role.title) {
        character.dataset.role = role.title;
        const text = this.document.createElement('span');
        text.className = 'character-role';
        const title = this.document.createElement('b');
        title.textContent = role.title;
        text.append(title, ` ${role.perks}`);
        caption.append(text);
      }
      character.addEventListener('click', () => {
        const self = this.self();
        const value = character.value as PlayerCharacter;
        this.renderCharacterSelection();
        if (this.phase.phase === 'lobby' && self && self.connected !== false &&
          !character.disabled && PLAYER_CHARACTERS.includes(value)) {
          actions.selectCharacter(value === self.character ? null : value);
        }
      });
      character.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const available = this.characters.filter((button) => !button.disabled);
        const index = available.indexOf(character);
        if (index < 0) return;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 :
          (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + available.length) % available.length;
        available[next]!.focus();
      });
    }
    this.ready.addEventListener('click', () => actions.ready(!this.self()?.ready));
    this.start.addEventListener('click', () => actions.start());
    this.element('#replay-button').addEventListener('click', () => actions.replay());
    for (const [selector, done] of [['#copy-code', 'Code copied!'], ['#copy-link', 'Link copied!']] as const) {
      const button = this.element(selector);
      this.copyLabels.set(button, button.textContent ?? '');
      button.addEventListener('click', () => this.copy(button, selector === '#copy-code' ? this.roomCode : this.invite(), done));
    }
    this.element('#fill-bots').addEventListener('click', () => {
      for (let seat = 0; seat < openSeats(this.players); seat += 1) actions.addBot?.();
    });
    for (const button of this.document.querySelectorAll<HTMLButtonElement>('[data-dialog]')) {
      button.addEventListener('click', () => {
        this.element<HTMLDialogElement>(`#${button.dataset.dialog}`).showModal();
      });
    }
    this.setScreen('menu');
  }

  /** Opens the join form for a room code taken from an invite link. */
  prefillInvite(code: string): void {
    this.selectTab(true);
    this.code.value = code;
    this.showStatus(`You're invited to room ${code}. Enter your name and join!`);
    this.name.focus();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.panel.setAttribute('aria-busy', String(busy));
    for (const control of [this.name, this.code, this.createTab, this.joinTab,
      this.create.querySelector('button')!, this.join.querySelector('button')!]) control.disabled = busy;
    this.create.querySelector('button span')!.textContent = busy ? 'Connecting…' : 'Create room';
    this.join.querySelector('button span')!.textContent = busy ? 'Connecting…' : 'Join room';
    if (busy) this.showStatus('Connecting to your care crew…');
  }

  showRoom(code: string, players: PlayerPresence[], localId: string): void {
    const entering = this.element('#room-menu').hidden === false;
    this.element('#room-menu').hidden = true;
    this.element('#room-lobby').hidden = false;
    this.element('#room-code').textContent = code;
    if (this.roomCode !== code) for (const [button, label] of this.copyLabels) button.textContent = label;
    this.roomCode = code;
    this.players = players;
    this.localId = localId;
    this.render();
    if (entering) this.showStatus('');
  }

  showPhase(phase: RoomPhaseSnapshot, localId: string): void {
    this.phase = phase;
    this.localId = localId;
    this.render();
  }

  showResults(results: RoundResults): void {
    for (const [key, text] of Object.entries(resultsPresentation(results))) {
      this.element(`#results-${key}`).textContent = text;
    }
  }

  showStatus(message: string): void {
    this.element('#room-status').textContent = message;
  }

  showMenu(message: string): void {
    this.portraits?.setSelected(undefined);
    const roster = this.element('#room-players');
    this.portraits?.release(roster);
    roster.replaceChildren();
    this.rosterSignature = '';
    this.players = [];
    this.localId = '';
    this.phase = EMPTY_PHASE;
    this.element('#room-menu').hidden = false;
    this.element('#room-lobby').hidden = true;
    this.panel.classList.remove('is-playing', 'is-results');
    this.setScreen('menu');
    this.showStatus(message);
  }

  showFixture(): void {
    this.panel.hidden = true;
    this.setScreen('fixture');
  }

  private element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.document.querySelector<T>(selector)!;
  }

  private copy(button: HTMLElement, text: string, done: string): void {
    if (!this.clipboard) { this.showStatus('Copy the room code shown above to invite your friends.'); return; }
    void this.clipboard.writeText(text).then(() => { button.textContent = done; })
      .catch(() => this.showStatus('Could not copy automatically. Select and copy the room code above.'));
  }

  private invite(): string {
    try { return this.inviteBase ? inviteLink(this.inviteBase, this.roomCode) : this.roomCode; } catch { return this.roomCode; }
  }

  private self(): PlayerPresence | undefined {
    return this.players.find((player) => player.id === this.localId);
  }

  private selectTab(joining: boolean): void {
    if (this.busy) return;
    this.create.hidden = joining;
    this.join.hidden = !joining;
    this.name.setAttribute('form', joining ? 'join-room' : 'create-room');
    for (const [tab, selected] of [[this.createTab, !joining], [this.joinTab, joining]] as const) {
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    this.showStatus('');
  }

  private setScreen(screen: string): void {
    this.portraits?.setActive(screen === 'lobby');
    const visible = screen === 'running' || screen === 'fixture';
    this.document.body.dataset.screen = screen;
    this.game.inert = !visible;
    this.game.setAttribute('aria-hidden', String(!visible));
  }

  private render(): void {
    const phase = this.phase.phase;
    this.setScreen(phase);
    this.panel.classList.toggle('is-playing', phase === 'running');
    this.panel.classList.toggle('is-results', phase === 'results');
    this.element('#lobby-controls').hidden = phase !== 'lobby';
    this.element('#ready-actions').hidden = phase !== 'lobby';
    this.element('#round-results').hidden = phase !== 'results';
    this.element('#countdown-card').hidden = phase !== 'countdown';
    const host = this.phase.hostId === this.localId;
    this.element('#replay-button').hidden = !host;
    this.element('#replay-hint').hidden = host;
    this.start.hidden = !host;
    this.start.disabled = !canStart(this.players);
    this.element('#fill-bots').hidden = !host || phase !== 'lobby' || openSeats(this.players) === 0;
    const hint = lobbyHint(this.players, this.localId, this.phase.hostId);
    const hintLabel = this.element('#lobby-hint');
    hintLabel.hidden = phase !== 'lobby';
    hintLabel.textContent = hint.text;
    hintLabel.dataset.tone = hint.tone;
    const self = this.self();
    this.renderCharacterSelection();
    this.ready.textContent = self?.ready ? 'Cancel ready' : 'Ready up';
    this.ready.setAttribute('aria-pressed', String(self?.ready ?? false));
    this.ready.disabled = !self?.character || self.connected === false;
    const phaseLabel = this.element('#room-phase');
    phaseLabel.hidden = phase === 'lobby';
    phaseLabel.textContent = phase === 'countdown' ? 'All set. Your shift starts in…' :
      phase === 'running' ? 'Shift in progress' : phase === 'results' ? 'Shift complete' : '';
    this.element('#countdown-number').textContent = String(Math.ceil(this.phase.countdownRemainingMs / 1000));
    this.renderRoster();
  }

  private renderCharacterSelection(): void {
    const self = this.self();
    this.portraits?.setSelected(self?.character);
    for (const character of this.characters) {
      const owner = this.players.find((player) => player.character === character.value);
      const selected = owner?.id === self?.id && !!self;
      // A bot gives its Pokémon to a person and switches to a free one.
      const takenByBot = !!owner && !selected && owner.bot === true;
      const taken = !!owner && !selected && !takenByBot;
      character.setAttribute('aria-pressed', String(selected));
      character.dataset.ownerSlot = owner ? String(owner.slot) : '';
      character.disabled = this.phase.phase !== 'lobby' || !self || self.connected === false || taken;
      const role = CHARACTER_ROLE_TEXT[character.value as PlayerCharacter];
      character.setAttribute('aria-label', `${character.value}${role ? `, ${role.title}: ${role.perks}` : ''}${
        taken ? `, chosen by ${owner.name}` : takenByBot ? `, used by ${owner.name}; choosing it swaps the bot` :
          selected ? ', selected. Activate again to deselect' : ''}`);
      character.querySelector<HTMLElement>('.character-invite')!.textContent = taken ?
        `Chosen by ${owner.name}` : takenByBot ? `${owner.name} · swap` : selected ? 'YOUR POKÉMON' : 'I CHOOSE YOU!';
    }
  }

  private renderRoster(): void {
    const signature = JSON.stringify([this.players, this.localId, this.phase.hostId, this.phase.phase]);
    if (signature === this.rosterSignature) return;
    this.rosterSignature = signature;
    const roster = this.element('#room-players');
    const previous = [...roster.children] as HTMLElement[];
    const managesBots = this.phase.phase === 'lobby' && this.phase.hostId === this.localId && !!this.localId;
    const cards: HTMLElement[] = [];
    for (let slot = 0; slot < ROOM_SEATS; slot += 1) {
      const player = this.players.find((candidate) => candidate.slot === slot);
      const card = this.document.createElement('li');
      card.className = 'player-card';
      card.dataset.slot = String(slot);
      card.dataset.playerId = player?.id ?? '';
      card.dataset.character = player?.character ?? '';
      const add = (className: string, text: string) => {
        const part = this.document.createElement('span');
        part.className = className;
        part.textContent = text;
        card.append(part);
        return part;
      };
      const button = (className: string, text: string, label: string, onClick: () => void) => {
        const control = this.document.createElement('button');
        control.type = 'button';
        control.className = className;
        control.textContent = text;
        control.setAttribute('aria-label', label);
        control.addEventListener('click', onClick);
        card.append(control);
        return control;
      };
      add('seat-label', `P${slot + 1}${player?.id === this.phase.hostId ? ' · HOST' : ''}`);
      const old = previous.find((entry) => entry.dataset.slot === String(slot));
      let avatar = old?.dataset.playerId === card.dataset.playerId &&
        old?.dataset.character === card.dataset.character ? old.querySelector<HTMLElement>('.player-avatar') : null;
      if (!avatar) {
        avatar = this.document.createElement('span');
        avatar.className = 'player-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        if (player?.character && this.portraits) {
          avatar.append(this.portraits.create(player.character as PlayerCharacter, ROSTER_PORTRAIT_SIZE));
        } else avatar.textContent = player ? '?' : '+';
      }
      card.append(avatar);
      const name = add('player-name', player ? `${player.name}${player.id === this.localId ? ' (you)' : ''}` : 'Open seat');
      for (const [show, className, label] of [[player?.id === this.phase.hostId, 'player-host', 'Host'],
        [player?.bot === true, 'player-host player-bot', 'Bot']] as const) {
        if (!show) continue;
        const badge = this.document.createElement('span');
        badge.className = className;
        badge.textContent = label;
        name.textContent += ' ';
        name.append(badge);
      }
      const role = player?.character ? CHARACTER_ROLE_TEXT[player.character as PlayerCharacter] : undefined;
      add('player-character', player?.character ? `${player.character}${role ? ` · ${role.title}` : ''}` :
        player ? 'Choosing a Pokémon…' : managesBots ? 'Invite a friend or add a bot' : 'Invite a friend');
      add('player-state', !player ? 'Waiting for staff' : player.connected === false ?
        `Reconnecting · ${Math.ceil((player.reconnectRemainingMs ?? 0) / 1000)}s` : player.ready ? 'Ready!' : 'Getting ready');
      if (!player && this.phase.phase === 'lobby') {
        const invite = button('seat-invite', 'Invite', 'Copy an invite link for this seat', () => {
          this.copy(invite, this.invite(), 'Link copied!');
        });
        if (managesBots) button('bot-add', '+ Bot', 'Add a bot to this seat', () => this.actions.addBot?.());
      }
      if (player?.bot && managesBots) {
        const botId = player.id;
        for (const [step, text, className] of [[-1, '‹', 'bot-cycle is-previous'], [1, '›', 'bot-cycle is-next']] as const) {
          const next = cycleCharacter(player, this.players, step);
          const control = button(className, text, next ? `Switch ${player.name} to ${next}` : 'No other Pokémon is free',
            () => { if (next) this.actions.setBotCharacter?.(botId, next); });
          control.disabled = !next;
        }
        button('bot-remove', '×', `Remove ${player.name}`, () => this.actions.removeBot?.(botId));
      }
      card.classList.toggle('is-empty', !player);
      card.classList.toggle('is-bot', player?.bot === true);
      card.classList.toggle('is-local', player?.id === this.localId);
      card.classList.toggle('is-ready', player?.ready === true && player.connected !== false);
      card.classList.toggle('is-disconnected', player?.connected === false);
      cards.push(card);
    }
    this.portraits?.release(roster);
    roster.replaceChildren(...cards);
  }
}
