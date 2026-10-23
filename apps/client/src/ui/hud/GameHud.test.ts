import { describe, expect, it, vi } from 'vitest';
import { GameHud, MENU_OPEN_CLASS, anchorPoint, hudScale } from './GameHud.js';
import { IDLE_ACTION, type HudAnchors, type HudState } from './hudState.js';

class FakeStyle {
  transform = '';
  visibility = '';
  readonly properties = new Map<string, string>();
  setProperty(name: string, value: string) { this.properties.set(name, value); }
}

class FakeElement extends EventTarget {
  className = '';
  hidden = false;
  readonly style = new FakeStyle();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  writes = 0;
  removed = false;
  private html = '';
  private anchored: FakeElement[] = [];
  set innerHTML(value: string) {
    this.html = value;
    this.writes += 1;
    this.anchored = [...value.matchAll(/data-anchor="([^"]+)"/g)].map(([, anchor]) => {
      const element = new FakeElement();
      element.dataset.anchor = anchor!;
      return element;
    });
  }
  get innerHTML() { return this.html; }
  append(child: FakeElement) { this.children.push(child); }
  remove() { this.removed = true; }
  querySelectorAll() { return this.anchored; }
  getBoundingClientRect() { return { width: 1920, height: 1080 }; }
  closest(selector: string) { return selector === '[data-hud-menu]' && this.dataset.menu ? this : null; }
}

function setup(withObserver = true) {
  const classes = new Set<string>();
  const body = { classList: { remove: (name: string) => classes.delete(name),
    toggle: (name: string) => classes.has(name) ? classes.delete(name) : classes.add(name) } };
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  const disconnect = vi.fn();
  let resize = () => {};
  const document = {
    body,
    createElement: () => new FakeElement(),
    addEventListener: vi.fn((type: string, listener: (event: KeyboardEvent) => void) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    defaultView: withObserver ? { ResizeObserver: class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    } } : null,
  };
  const mount = new FakeElement();
  const hud = new GameHud(mount as unknown as HTMLElement, document as unknown as Document);
  const root = mount.children[0]!;
  const section = (name: string) => root.children[0]!.children.find((child) => child.className === `hud-area-${name}`)!;
  return { hud, mount, root, section, classes, listeners, document, disconnect, resize: () => resize() };
}

function state(overrides: Partial<HudState> = {}): HudState {
  return { active: true, localId: 'red', players: [{ id: 'red', name: 'Red', slot: 0, character: 'Chansey' }],
    positions: [], patients: [{ id: 'p1', species: 'Eevee', requiredTreatments: 1, completedTreatments: 0,
      initialPatienceMs: 90_000, remainingPatienceMs: 60_000, lifecycle: 'active', location: 'waiting', slotIndex: 0,
      carrierId: '' }],
    machines: [{ patientId: '', status: 'empty', remainingMs: 0 }, { patientId: '', status: 'empty', remainingMs: 0 }],
    doses: [], medicineOwners: ['', ''], medicineRemainingMs: [0, 0], remainingMs: 300_000, score: 0, streak: 0,
    discharged: 0, lost: 0, focusedPatientId: 'p1', action: IDLE_ACTION, tip: '', notice: '', manifest: null, ...overrides };
}

const anchors: HudAnchors = { players: new Map([['red', { x: 100, y: 50 }]]), patients: new Map([['p1', { x: 20.04, y: 30 }]]),
  machines: [{ x: 1, y: 2 }, { x: 3, y: 4 }], preparation: [{ x: 5, y: 6 }], discharge: { x: 7, y: 8 } };

describe('HUD layout helpers', () => {
  it('fits the logical stage inside the mount with a safe fallback', () => {
    expect(hudScale(1920, 1080)).toBe(2);
    expect(hudScale(1920, 540)).toBe(1);
    expect(hudScale(0, 540)).toBe(1);
    expect(hudScale(Number.NaN, 540)).toBe(1);
  });

  it('resolves label anchors, including the focus card over its patient', () => {
    expect(anchorPoint(anchors, 'player:red')).toEqual({ x: 100, y: 50 });
    expect(anchorPoint(anchors, 'patient:p1')).toEqual({ x: 20.04, y: 30 });
    expect(anchorPoint(anchors, 'focus:p1')).toEqual({ x: 20.04, y: 30 });
    expect(anchorPoint(anchors, 'machine:1')).toEqual({ x: 3, y: 4 });
    expect(anchorPoint(anchors, 'prep:0')).toEqual({ x: 5, y: 6 });
    expect(anchorPoint(anchors, 'discharge')).toEqual({ x: 7, y: 8 });
    expect(anchorPoint(anchors, 'player:nobody')).toBeUndefined();
    expect(anchorPoint(anchors, 'unknown')).toBeUndefined();
  });
});

describe('GameHud', () => {
  it('mounts a hidden overlay and scales it with the mount', () => {
    const { root, resize, hud, disconnect } = setup();
    expect(root.className).toBe('hud');
    expect(root.hidden).toBe(true);
    resize();
    expect(root.style.properties.get('--hud-scale')).toBe('2');
    hud.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(setup(false).root.style.properties.size).toBe(0);
  });

  it('renders active play and only rewrites sections whose content changed', () => {
    const { hud, root, section } = setup();
    hud.render(state(), 0);
    expect(root.hidden).toBe(false);
    expect(section('shift').innerHTML).toContain('<b>5:00</b>');
    expect(section('queue').innerHTML).toContain('Eevee');
    expect(section('player').innerHTML).toContain('Chansey');
    expect(section('world').innerHTML).toContain('data-anchor="focus:p1"');
    const writes = () => ['player', 'shift', 'queue', 'world'].map((name) => section(name).writes);
    const before = writes();
    hud.render(state(), 50);
    expect(writes()).toEqual(before);
    hud.render(state({ remainingMs: 299_000 }), 100);
    expect(writes()).toEqual([before[0], before[1]! + 1, before[2], before[3]]);
  });

  it('positions world labels from the latest anchors, keeps the focus card on stage and hides labels without one', () => {
    const { hud, section } = setup();
    hud.render(state({ players: [...state().players, { id: 'gone', name: 'Gone', slot: 1 }] }), 0);
    hud.place(anchors, 0);
    const [red, gone, patient, focus] = section('world').querySelectorAll();
    expect(red!.style.transform).toBe('translate(100.0px, 50.0px)');
    expect(gone!.style.visibility).toBe('hidden');
    expect(patient!.style.transform).toBe('translate(20.0px, 30.0px)');
    expect(focus!.style.transform).toBe('translate(90.0px, 30.0px)');
    hud.render(state({ focusedPatientId: '' }), 10);
    expect(section('world').querySelectorAll().every((element) => element.dataset.anchor === 'player:red' ||
      element.style.transform)).toBe(true);
  });

  it('shows and expires the event feed and score popups as time passes', () => {
    const { hud, section } = setup();
    hud.render(state(), 0);
    hud.render(state({ score: 60, discharged: 1 }), 100);
    expect(section('feed').innerHTML).toContain('1 discharged');
    expect(section('world').innerHTML).toContain('<b>+60</b>');
    hud.place(anchors, 2_000);
    expect(section('world').innerHTML).not.toContain('+60');
    hud.place(anchors, 4_200);
    expect(section('feed').innerHTML).not.toContain('discharged');
  });

  it('toggles the room menu with Escape or its button during play and closes it when play stops', () => {
    const { hud, root, classes, listeners } = setup();
    listeners.get('keydown')!({ code: 'Escape' } as KeyboardEvent);
    expect(classes.has(MENU_OPEN_CLASS)).toBe(false);
    hud.render(state(), 0);
    listeners.get('keydown')!({ code: 'KeyE' } as KeyboardEvent);
    expect(classes.has(MENU_OPEN_CLASS)).toBe(false);
    listeners.get('keydown')!({ code: 'Escape' } as KeyboardEvent);
    expect(classes.has(MENU_OPEN_CLASS)).toBe(true);
    const button = new FakeElement();
    button.dataset.menu = 'true';
    const click = new Event('click');
    Object.defineProperty(click, 'target', { value: button });
    root.dispatchEvent(click);
    expect(classes.has(MENU_OPEN_CLASS)).toBe(false);
    const elsewhere = new Event('click');
    Object.defineProperty(elsewhere, 'target', { value: new FakeElement() });
    root.dispatchEvent(elsewhere);
    expect(classes.has(MENU_OPEN_CLASS)).toBe(false);
    root.dispatchEvent(click);
    hud.render(state({ active: false }), 10);
    expect(root.hidden).toBe(true);
    expect(classes.has(MENU_OPEN_CLASS)).toBe(false);
  });

  it('removes its overlay and listeners when destroyed', () => {
    const { hud, root, listeners, classes } = setup();
    hud.render(state(), 0);
    listeners.get('keydown')!({ code: 'Escape' } as KeyboardEvent);
    hud.destroy();
    expect(root.removed).toBe(true);
    expect(listeners.has('keydown')).toBe(false);
    expect(classes.has(MENU_OPEN_CLASS)).toBe(false);
  });
});
