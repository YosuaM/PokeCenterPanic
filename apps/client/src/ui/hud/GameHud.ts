import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../renderResolution.js';
import { HudFeed } from './hudFeed.js';
import { crewMembers, focusCard, localCard, machineBadge, preparationBadges, roundSummary, waitingQueue,
  worldPatients } from './hudModel.js';
import { abilityMarkup, actionMarkup, crewMarkup, feedMarkup, hasAbility, menuMarkup, playerCardMarkup,
  queueMarkup, shiftMarkup, worldMarkup } from './hudMarkup.js';
import type { HudAnchors, HudSink, HudState } from './hudState.js';

const SECTIONS = ['world', 'player', 'shift', 'side', 'queue', 'slots', 'action', 'feed'] as const;
type Section = (typeof SECTIONS)[number];

export const MENU_OPEN_CLASS = 'hud-menu-open';
const FOCUS_MIN_X = 90;
const FOCUS_MAX_X = LOGICAL_WIDTH - 90;

/** Scale that fits the logical HUD stage inside the mount, matching both letterboxed renderers. */
export function hudScale(width: number, height: number): number {
  const fit = Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT);
  return Number.isFinite(fit) && fit > 0 ? fit : 1;
}

/** DOM overlay for the in-game HUD; only changed sections are rewritten. */
export class GameHud implements HudSink {
  private readonly root: HTMLElement;
  private readonly sections = new Map<Section, HTMLElement>();
  private readonly markup = new Map<Section, string>();
  private readonly feed = new HudFeed();
  private state: HudState | null = null;
  private anchors: HudAnchors | null = null;
  private stopObserving = () => {};

  constructor(private readonly mount: HTMLElement, private readonly document: Document) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    const stage = document.createElement('div');
    stage.className = 'hud-stage';
    for (const section of SECTIONS) {
      const element = document.createElement('div');
      element.className = `hud-area-${section}`;
      stage.append(element);
      this.sections.set(section, element);
    }
    this.root.append(stage);
    mount.append(this.root);
    this.root.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown);
    const view = document.defaultView;
    if (view && typeof view.ResizeObserver === 'function') {
      const resize = () => {
        const bounds = mount.getBoundingClientRect();
        this.root.style.setProperty('--hud-scale', String(hudScale(bounds.width, bounds.height)));
      };
      const observer = new view.ResizeObserver(resize);
      observer.observe(mount);
      resize();
      this.stopObserving = () => observer.disconnect();
    }
  }

  render(state: HudState, timeMs: number): void {
    this.state = state;
    this.feed.sync(state, timeMs);
    this.root.hidden = !state.active;
    if (!state.active) {
      this.document.body?.classList.remove(MENU_OPEN_CLASS);
      return;
    }
    const local = localCard(state);
    this.write('player', playerCardMarkup(local, state.manifest));
    this.write('shift', shiftMarkup(roundSummary(state)));
    this.write('side', menuMarkup() + crewMarkup(crewMembers(state), state.manifest));
    this.write('queue', queueMarkup(waitingQueue(state), state.manifest));
    this.write('slots', abilityMarkup(local, state.manifest));
    this.write('action', actionMarkup(state.action, state.tip, hasAbility(local?.character)));
    this.refresh(timeMs);
  }

  place(anchors: HudAnchors, timeMs: number): void {
    this.anchors = anchors;
    if (this.state?.active) this.refresh(timeMs);
    this.position();
  }

  destroy(): void {
    this.stopObserving();
    this.root.removeEventListener('click', this.onClick);
    this.document.removeEventListener('keydown', this.onKeyDown);
    this.document.body?.classList.remove(MENU_OPEN_CLASS);
    this.root.remove();
  }

  private refresh(timeMs: number): void {
    const state = this.state!;
    this.write('feed', feedMarkup(this.feed.entries(timeMs)));
    const changed = this.write('world', worldMarkup({
      players: state.players.map((player) => ({ id: player.id, name: player.name, character: player.character ?? '',
        bot: Boolean(player.bot), local: player.id === state.localId })),
      patients: worldPatients(state),
      machines: state.machines.map((machine) => machineBadge(machine, state)),
      preparation: preparationBadges(state),
      focus: focusCard(state),
      popups: this.feed.popups(timeMs),
    }));
    if (changed) this.position();
  }

  private write(section: Section, markup: string): boolean {
    if (this.markup.get(section) === markup) return false;
    this.markup.set(section, markup);
    this.sections.get(section)!.innerHTML = markup;
    return true;
  }

  private position(): void {
    const anchors = this.anchors;
    for (const element of this.sections.get('world')!.querySelectorAll<HTMLElement>('[data-anchor]')) {
      const point = anchors ? anchorPoint(anchors, element.dataset.anchor ?? '') : undefined;
      element.style.visibility = point ? '' : 'hidden';
      if (!point) continue;
      // Keep the focus card fully on the stage even for patients at the edges of the room.
      const x = element.dataset.anchor?.startsWith('focus:') ? Math.min(FOCUS_MAX_X, Math.max(FOCUS_MIN_X, point.x)) : point.x;
      element.style.transform = `translate(${x.toFixed(1)}px, ${point.y.toFixed(1)}px)`;
    }
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (target?.closest?.('[data-hud-menu]')) this.document.body?.classList.toggle(MENU_OPEN_CLASS);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' || !this.state?.active) return;
    this.document.body?.classList.toggle(MENU_OPEN_CLASS);
  };
}

export function anchorPoint(anchors: HudAnchors, anchor: string): { x: number; y: number } | undefined {
  if (anchor === 'discharge') return anchors.discharge;
  const split = anchor.indexOf(':');
  const kind = anchor.slice(0, Math.max(0, split));
  const id = anchor.slice(split + 1);
  if (kind === 'player') return anchors.players.get(id);
  if (kind === 'patient' || kind === 'focus') return anchors.patients.get(id);
  if (kind === 'machine') return anchors.machines[Number(id)];
  if (kind === 'prep') return anchors.preparation[Number(id)];
  return undefined;
}
