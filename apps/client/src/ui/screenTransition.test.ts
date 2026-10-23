import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenTransition, needsScreenTransition } from './screenTransition.js';

const timing = { closeMs: 100, holdMs: 50, openMs: 200 };

function setup(reduced = false) {
  const root = { hidden: false, dataset: {} as Record<string, string> };
  const motion = { matches: reduced };
  const transition = new ScreenTransition(root as unknown as HTMLElement, motion, timing);
  return { root, motion, transition };
}

describe('needsScreenTransition', () => {
  it('covers real screen swaps but not the countdown inside the staff room or art fixtures', () => {
    expect(needsScreenTransition('menu', 'lobby')).toBe(true);
    expect(needsScreenTransition('countdown', 'running')).toBe(true);
    expect(needsScreenTransition('running', 'results')).toBe(true);
    expect(needsScreenTransition('results', 'lobby')).toBe(true);
    expect(needsScreenTransition('running', 'menu')).toBe(true);
    expect(needsScreenTransition('lobby', 'countdown')).toBe(false);
    expect(needsScreenTransition('countdown', 'lobby')).toBe(false);
    expect(needsScreenTransition('lobby', 'lobby')).toBe(false);
    expect(needsScreenTransition('menu', 'fixture')).toBe(false);
    expect(needsScreenTransition('fixture', 'running')).toBe(false);
  });
});

describe('ScreenTransition', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts hidden and swaps the screen only once the ball has fully closed', () => {
    const { root, transition } = setup();
    expect(root.hidden).toBe(true);
    const apply = vi.fn();
    transition.play(apply);
    expect(root).toMatchObject({ hidden: false, dataset: { stage: 'closing' } });
    vi.advanceTimersByTime(99);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledOnce();
    expect(root.dataset.stage).toBe('holding');
    vi.advanceTimersByTime(50);
    expect(root.dataset.stage).toBe('opening');
    vi.advanceTimersByTime(200);
    expect(root).toMatchObject({ hidden: true, dataset: { stage: 'idle' } });
    expect(apply).toHaveBeenCalledOnce();
  });

  it('runs every swap requested while closing, in order, behind a single close', () => {
    const { transition } = setup();
    const order: string[] = [];
    transition.play(() => order.push('lobby'));
    vi.advanceTimersByTime(60);
    transition.play(() => order.push('countdown'));
    vi.advanceTimersByTime(40);
    expect(order).toEqual(['lobby', 'countdown']);
  });

  it('applies immediately while held closed and closes again when interrupted while opening', () => {
    const { root, transition } = setup();
    transition.play(vi.fn());
    vi.advanceTimersByTime(100);
    const held = vi.fn();
    transition.play(held);
    expect(held).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(80);
    expect(root.dataset.stage).toBe('opening');
    const late = vi.fn();
    transition.play(late);
    expect(root.dataset.stage).toBe('closing');
    vi.advanceTimersByTime(99);
    expect(root.hidden).toBe(false);
    expect(late).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(late).toHaveBeenCalledOnce();
  });

  it('skips the animation for reduced motion, flushing any swap still waiting', () => {
    const { root, motion, transition } = setup();
    const waiting = vi.fn();
    transition.play(waiting);
    motion.matches = true;
    const apply = vi.fn();
    transition.play(apply);
    expect(waiting).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
    vi.runAllTimers();
    expect(root.hidden).toBe(true);
    expect(waiting).toHaveBeenCalledOnce();
  });

  it('applies pending swaps and hides itself when destroyed mid-transition', () => {
    const { root, transition } = setup();
    const apply = vi.fn();
    transition.play(apply);
    transition.destroy();
    expect(apply).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
    vi.runAllTimers();
    expect(apply).toHaveBeenCalledOnce();
  });
});
