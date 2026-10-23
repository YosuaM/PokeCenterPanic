export interface ScreenTransitionTiming {
  closeMs: number;
  holdMs: number;
  openMs: number;
}

export const POKEBALL_TIMING: ScreenTransitionTiming = { closeMs: 560, holdMs: 460, openMs: 560 };

type Stage = 'idle' | 'closing' | 'holding' | 'opening';

const SCREEN_GROUPS: Record<string, string> = { lobby: 'room', countdown: 'room' };

/** The countdown is drawn inside the staff room, so only real screen swaps get the Pokéball. */
export function needsScreenTransition(from: string, to: string): boolean {
  if (from === to || from === 'fixture' || to === 'fixture') return false;
  return (SCREEN_GROUPS[from] ?? from) !== (SCREEN_GROUPS[to] ?? to);
}

type TransitionRoot = Pick<HTMLElement, 'hidden' | 'dataset'>;

export class ScreenTransition {
  private stage: Stage = 'idle';
  private pending: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly root: TransitionRoot,
    private readonly reducedMotion: Pick<MediaQueryList, 'matches'> = { matches: false },
    private readonly timing = POKEBALL_TIMING) {
    this.setStage('idle');
  }

  /** Covers the screen, runs `apply` while it is hidden, then reveals the result. */
  play(apply: () => void): void {
    if (this.reducedMotion.matches) {
      this.destroy();
      apply();
      return;
    }
    if (this.stage === 'holding') { apply(); return; }
    this.pending.push(apply);
    if (this.stage === 'closing') return;
    this.close();
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.flush();
    this.setStage('idle');
  }

  private close(): void {
    clearTimeout(this.timer);
    this.setStage('closing');
    this.timer = setTimeout(() => {
      this.setStage('holding');
      this.flush();
      this.timer = setTimeout(() => this.open(), this.timing.holdMs);
    }, this.timing.closeMs);
  }

  private open(): void {
    this.setStage('opening');
    this.timer = setTimeout(() => this.setStage('idle'), this.timing.openMs);
  }

  private flush(): void {
    const pending = this.pending;
    this.pending = [];
    for (const apply of pending) apply();
  }

  private setStage(stage: Stage): void {
    this.stage = stage;
    this.root.hidden = stage === 'idle';
    this.root.dataset.stage = stage;
  }
}
