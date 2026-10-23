import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLAYER_CHARACTERS, type PlayerPresence, type RoomPhaseSnapshot } from '@pokecenter/shared';
import { RoomInterface } from './RoomInterface.js';

class Element extends EventTarget {
  hidden = false;
  disabled = false;
  inert = false;
  tabIndex = 0;
  value = '';
  textContent = '';
  className = '';
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: Element[] = [];
  parent: Element | null = null;
  parts = new Map<string, Element>();
  classes = new Set<string>();
  classList = {
    toggle: (name: string, enabled: boolean) => enabled ? this.classes.add(name) : this.classes.delete(name),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
  };
  focus = vi.fn();
  showModal = vi.fn();
  reportValidity = vi.fn(() => true);
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(child: Element) {
    if (child.parent) child.parent.children = child.parent.children.filter((entry) => entry !== child);
    child.parent = this;
    this.children.push(child);
  }
  replaceChildren(...children: Element[]) { this.children = []; children.forEach((child) => this.append(child)); }
  contains(child: Element): boolean { return this === child || this.children.some((entry) => entry.contains(child)); }
  querySelector(selector: string) {
    const child = this.children.find((entry) => `.${entry.className}` === selector);
    if (child) return child;
    if (!this.parts.has(selector)) this.parts.set(selector, new Element());
    return this.parts.get(selector)!;
  }
}

function setup(clipboard: Pick<Clipboard, 'writeText'> | null = { writeText: vi.fn(async () => {}) }, inviteBase = '',
  transition?: { play(apply: () => void): void }) {
  const elements = new Map<string, Element>();
  const element = (selector: string) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector)!;
  };
  element('#join-room').hidden = true;
  element('#room-lobby').hidden = true;
  element('#copy-code').textContent = 'Copy code';
  element('#copy-link').textContent = 'Copy invite link';
  const body = new Element();
  const dialogButton = new Element();
  dialogButton.dataset.dialog = 'help-dialog';
  const characters = PLAYER_CHARACTERS.map((name) => { const input = element(`#character-${name}`); input.value = name; return input; });
  const document = { body, querySelector: element, querySelectorAll: (selector: string) => selector === '#character-select button' ? characters : [dialogButton],
    createElement: () => new Element() };
  const actions = { create: vi.fn(), join: vi.fn(), leave: vi.fn(), selectCharacter: vi.fn(),
    ready: vi.fn(), start: vi.fn(), replay: vi.fn() };
  const portraits = { create: vi.fn((character: string) => {
    const portrait = new Element(); portrait.dataset.character = character;
    return portrait as unknown as HTMLElement;
  }), release: vi.fn(), setActive: vi.fn(), setSelected: vi.fn() };
  const ui = new RoomInterface(document as unknown as Document, actions, clipboard, portraits, inviteBase, transition);
  const click = (selector: string) => element(selector).dispatchEvent(new Event('click'));
  const submit = (selector: string) => element(selector).dispatchEvent(new Event('submit', { cancelable: true }));
  const phase = (phase: RoomPhaseSnapshot['phase'], hostId = 'host', countdownRemainingMs = 0) =>
    ui.showPhase({ phase, hostId, countdownRemainingMs, roundId: 'round-1' }, 'host');
  const choose = (name: string) => click(`#character-${name}`);
  return { ui, element, body, dialogButton, actions, click, submit, phase, clipboard, characters, choose, portraits };
}

const roster: PlayerPresence[] = [
  { id: 'host', name: 'Red', slot: 0, character: 'Chansey', ready: true, connected: true },
  { id: 'guest', name: 'Blue', slot: 1, character: 'Audino', ready: false, connected: true },
];

function cardText(card: Element): string {
  return card.children.map((child) => child.textContent).join(' | ');
}

describe('room interface', () => {
  it('uses accessible toggle cards without the removed descriptions underneath', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).not.toContain('character-hint');
    expect(html).not.toContain('character-selection');
    expect(html).not.toContain('Same abilities.');
    expect(html).not.toContain('Your pick:');
    expect(html.match(/<button class="character-card"/g)).toHaveLength(4);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
    expect(html).toContain('id="leave-room" class="secondary-button leave-button"');
    expect(html).toMatch(/<div class="character-actions">\s*<button id="leave-room"[\s\S]*?<div id="ready-actions"/);
    expect(html.indexOf('id="leave-room"')).toBeLessThan(html.indexOf('id="ready-button"'));
  });

  it('keeps leaving available in every room phase while showing ready and start only in the lobby', () => {
    const { ui, element, phase, actions, click } = setup();
    ui.showRoom('ABC234', roster, 'host');
    expect(element('#ready-actions').hidden).toBe(false);
    for (const name of ['countdown', 'running', 'results'] as const) {
      phase(name);
      expect(element('#ready-actions').hidden).toBe(true);
      expect(element('#leave-room').hidden).toBe(false);
      click('#leave-room');
    }
    expect(actions.leave).toHaveBeenCalledTimes(3);
    phase('lobby');
    expect(element('#ready-actions').hidden).toBe(false);
    expect(element('#leave-room').hidden).toBe(false);
    expect(actions.ready).not.toHaveBeenCalled();
    expect(actions.start).not.toHaveBeenCalled();
  });

  it('shows each confirmed Pokémon instead of name initials, and keeps empty and unchosen seats clear', () => {
    const { ui, element, portraits, choose } = setup();
    const players = [roster[0]!, { ...roster[1]!, character: undefined }];
    ui.showRoom('ABC234', players, 'host');
    const cards = element('#room-players').children;
    const avatar = cards[0]!.querySelector('.player-avatar');
    expect(avatar.children[0]!.dataset.character).toBe('Chansey');
    expect(portraits.create).toHaveBeenCalledExactlyOnceWith('Chansey', 96);
    expect(cards[1]!.querySelector('.player-avatar').textContent).toBe('?');
    expect(cards[2]!.querySelector('.player-avatar').textContent).toBe('+');
    expect(cards.every((card) => card.children.every((child) => child.className !== 'player-initial'))).toBe(true);
    choose('Meowth');
    expect(portraits.create).toHaveBeenCalledOnce();
    ui.showRoom('ABC234', [{ ...players[0]!, character: 'Meowth' }, players[1]!], 'host');
    expect(element('#room-players').children[0]!.querySelector('.player-avatar').children[0]!.dataset.character).toBe('Meowth');
    expect(portraits.create).toHaveBeenLastCalledWith('Meowth', 96);
  });

  it('retains animated avatars across readiness, host and reconnect updates, and releases them on leaving', () => {
    const { ui, element, portraits, phase } = setup();
    ui.showRoom('ABC234', roster, 'host');
    const avatars = element('#room-players').children.map((card) => card.querySelector('.player-avatar'));
    ui.showRoom('ABC234', roster.map((player) => ({ ...player, ready: !player.ready,
      connected: false, reconnectRemainingMs: 14000 })), 'host');
    phase('lobby', 'guest');
    expect(element('#room-players').children.map((card) => card.querySelector('.player-avatar'))).toEqual(avatars);
    expect(portraits.create).toHaveBeenCalledTimes(2);
    expect(portraits.setActive).toHaveBeenLastCalledWith(true);
    phase('countdown');
    expect(portraits.setActive).toHaveBeenLastCalledWith(false);
    phase('running');
    phase('results');
    phase('lobby');
    expect(portraits.setActive).toHaveBeenLastCalledWith(true);
    ui.showMenu('You left the room.');
    expect(portraits.setSelected).toHaveBeenLastCalledWith(undefined);
    expect(portraits.release).toHaveBeenLastCalledWith(element('#room-players'));
    expect(element('#room-players').children).toHaveLength(0);
    expect(portraits.setActive).toHaveBeenLastCalledWith(false);
    ui.showRoom('ABC234', roster, 'host');
    expect(portraits.create).toHaveBeenCalledTimes(4);
  });

  it('waits for authoritative selection and deselection before changing the selected card or readiness', () => {
    const { ui, characters, element, actions, choose, phase, portraits } = setup();
    const selected = () => characters.filter((button) => button.attributes.get('aria-pressed') === 'true').map((button) => button.value);
    ui.showRoom('ABC234', roster, 'host');
    phase('lobby');
    expect(selected()).toEqual(['Chansey']);
    expect(characters[1]!.disabled).toBe(true);
    choose('Machoke');
    expect(portraits.setSelected).toHaveBeenLastCalledWith('Chansey');
    expect(actions.selectCharacter).toHaveBeenCalledWith('Machoke');
    expect(selected()).toEqual(['Chansey']);
    expect(actions.ready).not.toHaveBeenCalled();
    expect(element('#ready-button').textContent).toBe('Cancel ready');
    ui.showRoom('ABC234', [{ ...roster[0]!, character: 'Machoke', ready: false }, roster[1]!], 'host');
    expect(selected()).toEqual(['Machoke']);
    expect(portraits.setSelected).toHaveBeenLastCalledWith('Machoke');
    expect(element('#ready-button').textContent).toBe('Ready up');
    choose('Machoke');
    expect(actions.selectCharacter).toHaveBeenLastCalledWith(null);
    expect(selected()).toEqual(['Machoke']);
    ui.showRoom('ABC234', [{ ...roster[0]!, character: undefined, ready: false }, roster[1]!], 'host');
    expect(selected()).toEqual([]);
    expect(portraits.setSelected).toHaveBeenLastCalledWith(undefined);
    expect(element('#ready-button').disabled).toBe(true);
    expect(element('#start-button').disabled).toBe(true);
    characters[2]!.value = 'Invalid';
    choose('Machoke');
    expect(actions.selectCharacter).toHaveBeenCalledTimes(2);
  });

  it('disables occupied or reserved Pokémon, releases departed choices, and locks controls outside the connected lobby', () => {
    const { ui, characters, actions, choose, phase } = setup();
    choose('Chansey');
    expect(actions.selectCharacter).not.toHaveBeenCalled();
    ui.showRoom('ABC234', [{ ...roster[0]!, character: undefined, ready: false }, roster[1]!], 'host');
    phase('lobby');
    choose('Audino');
    expect(actions.selectCharacter).not.toHaveBeenCalled();
    expect(characters[1]!.disabled).toBe(true);
    expect(characters[1]!.attributes.get('aria-label')).toContain('chosen by Blue');
    expect(characters[1]!.querySelector('.character-invite').textContent).toBe('Chosen by Blue');
    ui.showRoom('ABC234', [roster[0]!, { ...roster[1]!, connected: false }], 'host');
    expect(characters[1]!.disabled).toBe(true);
    ui.showRoom('ABC234', [roster[0]!], 'host');
    expect(characters.every((button) => !button.disabled)).toBe(true);
    choose('Audino');
    expect(actions.selectCharacter).toHaveBeenCalledWith('Audino');
    ui.showRoom('ABC234', [{ ...roster[0]!, character: 'Audino', ready: true }], 'host');
    for (const name of ['countdown', 'running', 'results'] as const) {
      phase(name);
      expect(characters.every((button) => button.disabled)).toBe(true);
      choose('Meowth');
    }
    expect(actions.selectCharacter).toHaveBeenCalledOnce();
    phase('lobby');
    expect(characters.every((button) => !button.disabled)).toBe(true);
    ui.showRoom('ABC234', [{ ...roster[0]!, connected: false }], 'host');
    expect(characters.every((button) => button.disabled)).toBe(true);
    choose('Meowth');
    expect(actions.selectCharacter).toHaveBeenCalledOnce();
  });

  it('requires a different assigned Pokémon and readiness from every player to enable start', () => {
    const { ui, element, phase } = setup();
    phase('lobby');
    for (const players of [[], [{ ...roster[0]!, character: undefined }],
      [roster[0]!, { ...roster[1]!, character: 'Chansey' as const, ready: true }], roster]) {
      ui.showRoom('ABC234', players, 'host');
      expect(element('#start-button').disabled).toBe(true);
    }
    const players = PLAYER_CHARACTERS.map((character, slot) => ({ id: slot === 0 ? 'host' : String(slot),
      name: `Player ${slot}`, slot, character, ready: true, connected: true }));
    ui.showRoom('ABC234', players, 'host');
    expect(element('#start-button').disabled).toBe(false);
    ui.showRoom('ABC234', players.map((player) => player.slot === 3 ? { ...player, character: undefined } : player), 'host');
    expect(element('#start-button').disabled).toBe(true);
  });

  it('moves keyboard focus between available cards without selecting or stealing an occupied Pokémon', () => {
    const { ui, characters, actions } = setup();
    ui.showRoom('ABC234', roster, 'host');
    const key = (index: number, value: string) => characters[index]!.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: value }));
    key(0, 'ArrowRight');
    expect(characters[2]!.focus).toHaveBeenCalledOnce();
    key(2, 'End');
    expect(characters[3]!.focus).toHaveBeenCalledOnce();
    key(3, 'Home');
    expect(characters[0]!.focus).toHaveBeenCalledOnce();
    key(0, 'ArrowLeft');
    expect(characters[3]!.focus).toHaveBeenCalledTimes(2);
    expect(actions.selectCharacter).not.toHaveBeenCalled();
  });

  it('keeps the game hidden and inert until a round starts, including countdown, results, replay and leaving', () => {
    const { ui, body, element, phase } = setup();
    expect(body.dataset.screen).toBe('menu');
    expect(element('#game').inert).toBe(true);
    expect(element('#game').attributes.get('aria-hidden')).toBe('true');
    ui.showRoom('ABC234', roster, 'host');
    expect(body.dataset.screen).toBe('lobby');
    phase('countdown', 'host', 2100);
    expect(element('#countdown-number').textContent).toBe('3');
    expect(element('#countdown-card').hidden).toBe(false);
    expect(element('#lobby-controls').hidden).toBe(true);
    expect(element('#game').inert).toBe(true);
    phase('running');
    expect(body.dataset.screen).toBe('running');
    expect(element('#game').inert).toBe(false);
    expect(element('#game').attributes.get('aria-hidden')).toBe('false');
    expect(element('#room-panel').classes.has('is-playing')).toBe(true);
    phase('results');
    expect(element('#round-results').hidden).toBe(false);
    expect(element('#game').inert).toBe(true);
    phase('lobby');
    expect(element('#round-results').hidden).toBe(true);
    expect(element('#lobby-controls').hidden).toBe(false);
    ui.showMenu('Connection lost.');
    expect(body.dataset.screen).toBe('menu');
    expect(element('#room-menu').hidden).toBe(false);
    expect(element('#room-lobby').hidden).toBe(true);
    expect(element('#room-panel').classes.size).toBe(0);
    expect(element('#room-status').textContent).toBe('Connection lost.');
    ui.showFixture();
    expect(body.dataset.screen).toBe('fixture');
    expect(element('#game').inert).toBe(false);
    expect(element('#room-panel').hidden).toBe(true);
  });

  it('swaps screens behind the Pokéball transition and keeps the countdown inside the staff room', () => {
    const covers: (() => void)[] = [];
    const transition = { play: vi.fn((apply: () => void) => { covers.push(apply); }) };
    const { ui, body, element, phase, portraits } = setup(undefined, '', transition);
    ui.showRoom('ABC234', roster, 'host');
    ui.showRoom('ABC234', [roster[0]!], 'host');
    expect(transition.play).toHaveBeenCalledOnce();
    expect(body.dataset.screen).toBe('menu');
    expect(element('#room-lobby').hidden).toBe(true);
    covers.shift()!();
    expect(body.dataset.screen).toBe('lobby');
    expect(element('#room-menu').hidden).toBe(true);
    expect(element('#room-players').children.filter((card) => !card.classes.has('is-empty'))).toHaveLength(1);
    phase('countdown', 'host', 900);
    expect(transition.play).toHaveBeenCalledOnce();
    expect(body.dataset.screen).toBe('countdown');
    phase('running');
    expect(transition.play).toHaveBeenCalledTimes(2);
    expect(body.dataset.screen).toBe('countdown');
    expect(element('#game').inert).toBe(true);
    covers.shift()!();
    expect(body.dataset.screen).toBe('running');
    expect(element('#game').inert).toBe(false);
    portraits.release.mockClear();
    ui.showMenu('You left the room.');
    expect(transition.play).toHaveBeenCalledTimes(3);
    expect(portraits.release).not.toHaveBeenCalled();
    expect(element('#room-panel').classes.has('is-playing')).toBe(true);
    covers.shift()!();
    expect(body.dataset.screen).toBe('menu');
    expect(element('#room-menu').hidden).toBe(false);
    expect(element('#room-panel').classes.size).toBe(0);
    expect(portraits.release).toHaveBeenCalledWith(element('#room-players'));
    expect(element('#room-status').textContent).toBe('You left the room.');
  });

  it('switches entry forms with the keyboard without submitting or losing typed values', () => {
    const { element, click, actions } = setup();
    element('#player-name').value = 'Red';
    element('#room-code-input').value = 'abc234';
    click('#join-tab');
    expect(element('#create-room').hidden).toBe(true);
    expect(element('#join-room').hidden).toBe(false);
    expect(element('#join-tab').attributes.get('aria-selected')).toBe('true');
    expect(element('#player-name').attributes.get('form')).toBe('join-room');
    expect(element('#create-tab').tabIndex).toBe(-1);
    element('#join-tab').dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Home' }));
    expect(element('#create-room').hidden).toBe(false);
    expect(element('#player-name').attributes.get('form')).toBe('create-room');
    expect(element('#create-tab').focus).toHaveBeenCalledOnce();
    element('#create-tab').dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowRight' }));
    expect(element('#join-tab').focus).toHaveBeenCalledOnce();
    expect(element('#player-name').value).toBe('Red');
    expect(element('#room-code-input').value).toBe('abc234');
    expect(actions.join).not.toHaveBeenCalled();
  });

  it('validates the shared name for both entry forms, normalizes submitted input and blocks duplicate actions while connecting', () => {
    const { ui, element, actions, submit, click } = setup();
    element('#player-name').value = ' Red ';
    submit('#create-room');
    expect(actions.create).toHaveBeenLastCalledWith('Red');
    element('#player-name').reportValidity.mockReturnValue(false);
    submit('#join-room');
    expect(actions.join).not.toHaveBeenCalled();
    element('#player-name').reportValidity.mockReturnValue(true);
    element('#room-code-input').reportValidity.mockReturnValue(false);
    submit('#join-room');
    expect(actions.join).not.toHaveBeenCalled();
    element('#room-code-input').reportValidity.mockReturnValue(true);
    click('#join-tab');
    element('#room-code-input').value = ' abc234 ';
    submit('#join-room');
    expect(actions.join).toHaveBeenLastCalledWith('ABC234', 'Red');
    ui.setBusy(true);
    expect(element('#player-name').disabled).toBe(true);
    expect(element('#join-tab').disabled).toBe(true);
    expect(element('#create-room').querySelector('button span:last-child').textContent).toBe('Connecting…');
    submit('#create-room');
    submit('#join-room');
    click('#join-tab');
    expect(element('#join-room').hidden).toBe(false);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.join).toHaveBeenCalledOnce();
    ui.showMenu('Room is full.');
    ui.setBusy(false);
    expect(element('#player-name').disabled).toBe(false);
    expect(element('#join-tab').disabled).toBe(false);
    expect(element('#room-status').textContent).toBe('Room is full.');
    expect(element('#player-name').value).toBe(' Red ');
  });

  it('renders four safe roster seats with host, local, ready and reservation information', () => {
    const { ui, element, phase } = setup();
    ui.showRoom('ABC234', [{ ...roster[0]!, name: '<img src=x>' },
      { ...roster[1]!, connected: false, reconnectRemainingMs: 14200 }], 'host');
    phase('lobby');
    const cards = element('#room-players').children;
    expect(cards).toHaveLength(4);
    expect(cardText(cards[0]!)).toContain('<img src=x> (you)');
    expect(cardText(cards[0]!)).toContain('HOST');
    expect(cards[0]!.querySelector('.player-name').children.find((child) => child.className === 'player-host')?.textContent).toBe('Host');
    expect(cards[0]!.classes.has('is-local')).toBe(true);
    expect(cards[0]!.classes.has('is-ready')).toBe(true);
    expect(cardText(cards[1]!)).toContain('Reconnecting · 15s');
    expect(cards[1]!.classes.has('is-disconnected')).toBe(true);
    expect(cardText(cards[2]!)).toContain('Open seat');
    expect(cards[2]!.classes.has('is-empty')).toBe(true);
    expect(element('#start-button').disabled).toBe(true);
    phase('lobby');
    expect(element('#room-players').children[0]).toBe(cards[0]);
  });

  it('keeps the Host badge with the player name when authority changes or names wrap', () => {
    const { ui, element, phase } = setup();
    ui.showRoom('ABC234', [{ ...roster[0]!, name: 'SixteenLettersOK' }, roster[1]!], 'host');
    const badgeIn = (index: number) => element('#room-players').children[index]!.querySelector('.player-name')
      .children.filter((child) => child.className === 'player-host');
    phase('lobby');
    expect(badgeIn(0).map((badge) => badge.textContent)).toEqual(['Host']);
    expect(badgeIn(1)).toHaveLength(0);
    phase('lobby', 'guest');
    expect(badgeIn(0)).toHaveLength(0);
    expect(badgeIn(1).map((badge) => badge.textContent)).toEqual(['Host']);
  });

  it('omits lobby instructions while retaining countdown announcements through replay', () => {
    const { ui, element, phase } = setup();
    ui.showRoom('ABC234', roster, 'host');
    const label = element('#room-phase');
    expect(label.hidden).toBe(true);
    expect(label.textContent).toBe('');
    ui.showRoom('ABC234', roster.map((player) => ({ ...player, ready: true })), 'host');
    expect(label.hidden).toBe(true);
    expect(label.textContent).toBe('');
    phase('countdown', 'host', 2000);
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe('All set. Your shift starts in…');
    phase('results'); phase('lobby');
    expect(label.hidden).toBe(true);
    expect(label.textContent).toBe('');
  });

  it('tracks host authority, readiness, character changes and replay controls', () => {
    const { ui, element, actions, click, phase, choose } = setup();
    ui.showRoom('ABC234', roster, 'host');
    phase('lobby');
    expect(element('#start-button').hidden).toBe(false);
    expect(element('#start-button').disabled).toBe(true);
    ui.showRoom('ABC234', roster.map((player) => ({ ...player, ready: true })), 'host');
    expect(element('#start-button').disabled).toBe(false);
    click('#ready-button');
    expect(actions.ready).toHaveBeenCalledWith(false);
    choose('Machoke');
    expect(actions.selectCharacter).toHaveBeenCalledWith('Machoke');
    phase('lobby', 'guest');
    expect(element('#start-button').hidden).toBe(true);
    phase('results', 'guest');
    expect(element('#replay-button').hidden).toBe(true);
    expect(element('#replay-hint').hidden).toBe(false);
    phase('results');
    expect(element('#replay-button').hidden).toBe(false);
    click('#replay-button'); click('#leave-room'); click('#start-button');
    expect(actions.replay).toHaveBeenCalledOnce();
    expect(actions.leave).toHaveBeenCalledOnce();
    expect(actions.start).toHaveBeenCalledOnce();
    ui.showRoom('ABC234', [{ ...roster[0]!, character: undefined, ready: false }], 'host');
    expect(element('#ready-button').disabled).toBe(true);
    expect(element('#start-button').disabled).toBe(true);
  });

  it('opens help, shows frozen results and keeps connection warnings across roster updates', () => {
    const { ui, element, dialogButton } = setup();
    dialogButton.dispatchEvent(new Event('click'));
    expect(element('#help-dialog').showModal).toHaveBeenCalledOnce();
    ui.showRoom('ABC234', roster, 'host');
    ui.showStatus('Reconnecting to the room…');
    ui.showRoom('ABC234', roster, 'host');
    expect(element('#room-status').textContent).toBe('Reconnecting to the room…');
    ui.showResults({ score: 355, admitted: 5, discharged: 3, lost: 1, unfinished: 1, stars: 1, bestStreak: 3 });
    expect(element('#results-score').textContent).toBe('355 points');
    expect(element('#results-success').textContent).toBe('60.0% success');
    expect(element('#results-streak').textContent).toBe('Best streak: 3 discharges');
  });

  it('copies the room code and gives a manual fallback when clipboard access fails', async () => {
    const { ui, element, click, clipboard } = setup();
    ui.showRoom('ABC234', roster, 'host');
    click('#copy-code');
    await Promise.resolve();
    expect(clipboard!.writeText).toHaveBeenCalledWith('ABC234');
    expect(element('#copy-code').textContent).toBe('Code copied!');
    vi.mocked(clipboard!.writeText).mockRejectedValue(new Error('Denied'));
    click('#copy-code');
    await Promise.resolve(); await Promise.resolve();
    expect(element('#room-status').textContent).toContain('Select and copy');
    const unavailable = setup(null);
    unavailable.ui.showRoom('DEF567', roster, 'host');
    unavailable.click('#copy-code');
    expect(unavailable.element('#room-status').textContent).toContain('Copy the room code');
  });

  it('copies an invite link from the ticket or an open seat and resets the labels for a new room', async () => {
    const { ui, element, clipboard, phase } = setup(undefined, 'https://play.example/panic/?old=1#top');
    const fresh = setup(undefined, 'https://play.example/panic/');
    fresh.ui.showRoom('ABC234', roster, 'host');
    fresh.click('#copy-link');
    await Promise.resolve();
    expect(fresh.clipboard!.writeText).toHaveBeenCalledWith('https://play.example/panic/?room=ABC234');
    expect(fresh.element('#copy-link').textContent).toBe('Link copied!');
    fresh.ui.showRoom('DEF567', roster, 'host');
    expect(fresh.element('#copy-link').textContent).toBe('Copy invite link');
    ui.showRoom('ABC234', roster, 'host');
    phase('lobby');
    const seat = element('#room-players').children[2]!;
    const invite = seat.children.find((child) => child.className === 'seat-invite')!;
    expect(invite.attributes.get('aria-label')).toBe('Copy an invite link for this seat');
    invite.dispatchEvent(new Event('click'));
    await Promise.resolve();
    expect(clipboard!.writeText).toHaveBeenCalledWith('https://play.example/panic/?room=ABC234');
    expect(invite.textContent).toBe('Link copied!');
    phase('running');
    expect(element('#room-players').children.some((card) => card.children.some((child) => child.className === 'seat-invite')))
      .toBe(false);
    const codeOnly = setup();
    codeOnly.ui.showRoom('GHJ234', roster, 'host');
    codeOnly.click('#copy-link');
    expect(codeOnly.clipboard!.writeText).toHaveBeenCalledWith('GHJ234');
  });

  it('opens the join form with an invited room code', () => {
    const { ui, element } = setup();
    ui.prefillInvite('ABC234');
    expect(element('#join-room').hidden).toBe(false);
    expect(element('#create-room').hidden).toBe(true);
    expect(element('#room-code-input').value).toBe('ABC234');
    expect(element('#join-tab').attributes.get('aria-selected')).toBe('true');
    expect(element('#room-status').textContent).toContain('invited to room ABC234');
    expect(element('#player-name').focus).toHaveBeenCalled();
  });

  it('lets the host fill open seats with bots and remove them, with a visible bot badge', () => {
    const { ui, element, actions, phase } = setup();
    const extended = actions as typeof actions & { addBot: ReturnType<typeof vi.fn>; removeBot: ReturnType<typeof vi.fn> };
    extended.addBot = vi.fn();
    extended.removeBot = vi.fn();
    const players: PlayerPresence[] = [roster[0]!,
      { id: 'bot-1', name: 'Bot 2', slot: 1, character: 'Machoke', ready: true, connected: true, bot: true }];
    ui.showRoom('ABC234', players, 'host');
    phase('lobby');
    const cards = element('#room-players').children;
    const button = (card: Element, className: string) => card.children.find((child) => child.className === className);
    expect(cardText(cards[1]!)).toContain('Bot 2');
    expect(cards[1]!.children.flatMap((child) => child.children).some((child) => child.textContent === 'Bot')).toBe(true);
    expect(button(cards[0]!, 'bot-remove')).toBeUndefined();
    expect(button(cards[1]!, 'bot-remove')?.attributes.get('aria-label')).toBe('Remove Bot 2');
    button(cards[1]!, 'bot-remove')!.dispatchEvent(new Event('click'));
    expect(extended.removeBot).toHaveBeenCalledWith('bot-1');
    expect(cards.slice(2).every((card) => button(card, 'bot-add')?.textContent === '+ Bot')).toBe(true);
    button(cards[2]!, 'bot-add')!.dispatchEvent(new Event('click'));
    expect(extended.addBot).toHaveBeenCalledOnce();
    expect(element('#start-button').disabled).toBe(false);
    phase('lobby', 'other');
    expect(element('#room-players').children.some((card) => button(card, 'bot-add') || button(card, 'bot-remove')))
      .toBe(false);
    phase('lobby');
    expect(element('#room-players').children.some((card) => button(card, 'bot-remove'))).toBe(true);
    phase('running');
    expect(element('#room-players').children.some((card) => button(card, 'bot-add') || button(card, 'bot-remove')))
      .toBe(false);
  });

  it('fills every open seat at once and lets the host switch a bot to a free Pokémon', () => {
    const { ui, element, actions, phase, click } = setup();
    const extended = actions as typeof actions & { addBot: ReturnType<typeof vi.fn>;
      setBotCharacter: ReturnType<typeof vi.fn> };
    extended.addBot = vi.fn();
    extended.setBotCharacter = vi.fn();
    const players: PlayerPresence[] = [{ ...roster[0]!, character: 'Audino' },
      { id: 'bot-1', name: 'Bot 2', slot: 1, character: 'Chansey', ready: true, connected: true, bot: true }];
    ui.showRoom('ABC234', players, 'host');
    phase('lobby');
    expect(element('#fill-bots').hidden).toBe(false);
    click('#fill-bots');
    expect(extended.addBot).toHaveBeenCalledTimes(2);
    const bot = element('#room-players').children[1]!;
    const control = (className: string) => bot.children.find((child) => child.className === className)!;
    expect(control('bot-cycle is-next').attributes.get('aria-label')).toBe('Switch Bot 2 to Machoke');
    control('bot-cycle is-next').dispatchEvent(new Event('click'));
    expect(extended.setBotCharacter).toHaveBeenLastCalledWith('bot-1', 'Machoke');
    control('bot-cycle is-previous').dispatchEvent(new Event('click'));
    expect(extended.setBotCharacter).toHaveBeenLastCalledWith('bot-1', 'Meowth');
    ui.showRoom('ABC234', [...players,
      { id: 'c', name: 'C', slot: 2, character: 'Machoke', ready: true, connected: true },
      { id: 'd', name: 'D', slot: 3, character: 'Meowth', ready: true, connected: true }], 'host');
    expect(element('#fill-bots').hidden).toBe(true);
    const full = element('#room-players').children[1]!.children.find((child) => child.className === 'bot-cycle is-next')!;
    expect(full.disabled).toBe(true);
    expect(full.attributes.get('aria-label')).toBe('No other Pokémon is free');
    full.dispatchEvent(new Event('click'));
    expect(extended.setBotCharacter).toHaveBeenCalledTimes(2);
    ui.showRoom('ABC234', players, 'host');
    phase('lobby', 'other');
    expect(element('#fill-bots').hidden).toBe(true);
    phase('countdown');
    expect(element('#fill-bots').hidden).toBe(true);
  });

  it('tells the team what it is waiting for and hides the hint outside the lobby', () => {
    const { ui, element, phase } = setup();
    ui.showRoom('ABC234', [{ ...roster[0]!, character: undefined, ready: false }], 'host');
    phase('lobby');
    expect(element('#lobby-hint').textContent).toBe('Pick a Pokémon below to join the shift.');
    expect(element('#lobby-hint').dataset.tone).toBe('action');
    ui.showRoom('ABC234', roster, 'host');
    expect(element('#lobby-hint').textContent).toBe('Waiting for Blue to get ready…');
    phase('running');
    expect(element('#lobby-hint').hidden).toBe(true);
  });

  it('describes every Pokémon specialty on its card and in its accessible name', () => {
    const { ui, characters } = setup();
    ui.showRoom('ABC234', roster, 'host');
    for (const card of characters) {
      const role = (card.querySelector('.character-caption') as Element).children
        .find((child) => child.className === 'character-role');
      expect(role?.children[0]?.textContent).toBeTruthy();
      expect(card.attributes.get('aria-label')).toContain(role!.children[0]!.textContent);
    }
    expect(characters.find((card) => card.value === 'Chansey')!.attributes.get('aria-label')).toContain('Soft-Boiled');
  });

  it('lets a person take a Pokémon from a bot but not from another person', () => {
    const { ui, characters, phase, choose, actions } = setup();
    ui.showRoom('ABC234', [{ ...roster[0]!, character: undefined, ready: false },
      { id: 'bot-1', name: 'Bot 2', slot: 1, character: 'Machoke', ready: true, connected: true, bot: true },
      { id: 'guest', name: 'Blue', slot: 2, character: 'Audino', ready: false, connected: true }], 'host');
    phase('lobby');
    const card = (name: string) => characters.find((entry) => entry.value === name)!;
    expect(card('Machoke').disabled).toBe(false);
    expect(card('Machoke').querySelector('.character-invite').textContent).toBe('Bot 2 · swap');
    expect(card('Machoke').attributes.get('aria-label')).toContain('choosing it swaps the bot');
    expect(card('Audino').disabled).toBe(true);
    choose('Machoke');
    expect(actions.selectCharacter).toHaveBeenCalledWith('Machoke');
  });
});

