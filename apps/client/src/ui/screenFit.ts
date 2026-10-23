export interface Size { width: number; height: number }

/** Below this the menus stop shrinking and the stage scrolls instead of becoming unreadable. */
export const MIN_SCREEN_SCALE = 0.5;

/** Uniform shrink that fits content into the stage; never enlarges. */
export function fitScale(available: Size, natural: Size, minimum = MIN_SCREEN_SCALE): number {
  const values = [available.width, available.height, natural.width, natural.height];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return 1;
  const scale = Math.min(1, available.width / natural.width, available.height / natural.height);
  return Math.max(minimum, Math.floor(scale * 1000) / 1000);
}

/**
 * Keeps the visible menu screen inside the viewport, like a game title screen, by scaling it down.
 * Transforms do not change layout size, so observing the content never feeds back into itself.
 */
export class ScreenFit {
  private readonly observer: ResizeObserver | undefined;

  constructor(private readonly stage: HTMLElement, view: (Window & typeof globalThis) | null) {
    const Observer = view?.ResizeObserver;
    this.observer = Observer ? new Observer(() => this.update()) : undefined;
    this.observer?.observe(stage);
    for (const child of stage.children) this.observer?.observe(child);
    this.update();
  }

  update(): void {
    const content = [...this.stage.children].find((child) => !(child as HTMLElement).hidden) as HTMLElement | undefined;
    const natural = { width: content?.offsetWidth ?? 0, height: content?.offsetHeight ?? 0 };
    const available = { width: this.stage.clientWidth, height: this.stage.clientHeight };
    const scale = fitScale(available, natural);
    this.stage.style.setProperty('--fit-scale', String(scale));
    this.stage.classList.toggle('is-overflowing', natural.height * scale > available.height + 1);
  }

  destroy(): void {
    this.observer?.disconnect();
  }
}
