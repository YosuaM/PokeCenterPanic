import { describe, expect, it } from 'vitest';
import type { SpriteManifest } from '../../sprites/pmd.js';
import { abilityMarkup, actionMarkup, crewMarkup, escapeHtml, feedMarkup, hasAbility, icon, playerCardMarkup,
  queueMarkup, shiftMarkup, spriteFrame, worldMarkup } from './hudMarkup.js';
import { roundSummary, type LocalCard, type QueueCard } from './hudModel.js';
import { IDLE_ACTION } from './hudState.js';

const manifest: SpriteManifest = { source: 'fixture', species: [{ id: '0025', name: 'Pikachu', credits: 'Artist',
  idle: { frameWidth: 40, frameHeight: 56, durations: [4, 8, 4], directions: 8, image: '0025/Idle-Anim.png' } }] };
const HOSTILE = '<img src=x onerror="alert(1)">';

const local: LocalCard = { name: 'Red', character: 'Chansey', role: 'Nurse', perk: 'Machines heal 40% faster',
  ability: 'softBoiled', abilityName: 'Soft-Boiled', abilityProgress: null, carrying: null };

function card(overrides: Partial<QueueCard> = {}): QueueCard {
  return { id: 'p1', species: 'Pikachu', seat: 3, hp: 50, patience: 0.5, seconds: 45, tone: 'normal', ready: false,
    critical: false, arriving: false, focused: false, pending: ['healing'], ...overrides };
}

describe('HUD markup primitives', () => {
  it('escapes player-controlled text', () => {
    expect(escapeHtml(`a&b<c>"d"'e'`)).toBe('a&#38;b&#60;c&#62;&#34;d&#34;&#39;e&#39;');
    const markup = crewMarkup([{ id: 'x', name: HOSTILE, character: 'Audino', role: 'Pharmacy', bot: false, activity: '' }], null);
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&#60;img');
  });

  it('crops the first camera-facing idle frame and falls back to an initial without sprites', () => {
    const frame = spriteFrame(manifest, 'Pikachu', 40);
    expect(frame).toContain("url('/assets/external/pmd/0025/Idle-Anim.png')");
    expect(frame).toContain('width:38.57px;height:54px');
    expect(frame).toContain('background-size:115.71px 432px');
    expect(frame).toContain('background-position:0 -0px');
    expect(spriteFrame(manifest, 'Eevee', 40)).toBe('<span class="hud-sprite is-fallback" style="--size:40px">E</span>');
    expect(spriteFrame(null, undefined, 20)).toContain('>?</span>');
  });

  it('draws inline icons and knows which characters have an ability', () => {
    expect(icon('healing')).toMatch(/^<svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s/);
    expect(hasAbility('Chansey')).toBe(true);
    expect(hasAbility('Meowth')).toBe(false);
    expect(hasAbility(undefined)).toBe(false);
  });
});

describe('HUD panels', () => {
  it('shows the local character, role and perk, escaping the player name', () => {
    expect(playerCardMarkup(null, null)).toBe('');
    const markup = playerCardMarkup({ ...local, name: HOSTILE }, manifest);
    expect(markup).toContain('data-character="Chansey"');
    expect(markup).toContain('<b>Chansey</b><span class="hud-chip is-role">Nurse</span>');
    expect(markup).toContain('· Machines heal 40% faster');
    expect(markup).not.toContain('<img');
  });

  it('shows the clock, phase, score and the streak only from two discharges', () => {
    const calm = shiftMarkup(roundSummary({ remainingMs: 300_000, score: 40, streak: 1, discharged: 1, lost: 0 }));
    expect(calm).toContain('<b>5:00</b>');
    expect(calm).toContain('Stage 1/3<span class="hud-chip is-phase-1">Calm</span>');
    expect(calm).not.toContain('is-streak');
    expect(calm).toContain('class="hud-stat is-lost"');
    const late = shiftMarkup(roundSummary({ remainingMs: 20_000, score: 400, streak: 6, discharged: 9, lost: 2 }));
    expect(late).toContain('hud-timer is-urgent');
    expect(late).toContain('×6<small>+50</small>');
    expect(late).toContain('is-lost has-lost');
    expect(late).toContain('is-last">Last call');
  });

  it('lists teammates with bot badges and their current activity or role', () => {
    const markup = crewMarkup([
      { id: 'b', name: 'Bot 2', character: 'Audino', role: 'Pharmacy', bot: true, activity: 'Mixing Antidote…' },
      { id: 'c', name: 'Blue', character: 'Meowth', role: 'All-rounder', bot: false, activity: '' },
    ], null);
    expect(markup).toContain('Bot</span><small>Mixing Antidote…</small>');
    expect(markup).toContain('<b>Blue</b><small>All-rounder</small>');
    expect(crewMarkup([], null)).toBe('');
  });

  it('shows queue cards with their seat, care, urgency and free seats', () => {
    const markup = queueMarkup({ seats: 8, free: 1, recovery: 2, cards: [
      card({ id: 'a', tone: 'critical', critical: true, focused: true, pending: ['healing', 'antidote'] }),
      card({ id: 'b', tone: 'ready', ready: true, pending: [] }),
      card({ id: 'c', arriving: true }),
    ] }, null);
    expect(markup).toContain('Waiting room<span class="hud-chip is-count">3/8</span>');
    expect(markup).toContain('hud-patient is-critical is-focused');
    expect(markup).toContain('<small class="is-critical">Urgent</small>');
    expect(markup).toContain('hud-treat is-antidote');
    expect(markup).toContain('hud-treat is-discharge');
    expect(markup).toContain('is-reserved');
    expect(markup).toContain('+ 1 free seat</p>');
    expect(markup).toContain('hud-chip is-recovery');
    const full = queueMarkup({ seats: 2, free: 0, recovery: 0, cards: [card(), card({ id: 'z' })] }, null);
    expect(full).toContain('is-full">Full');
    expect(full).not.toContain('free seat');
    expect(queueMarkup({ seats: 8, free: 8, recovery: 0, cards: [] }, null)).toContain('+ 8 free seats');
  });

  it('shows the ability or passive slot and what the player carries', () => {
    expect(abilityMarkup(null, null)).toBe('');
    const idle = abilityMarkup(local, null);
    expect(idle).toContain('Soft-Boiled</span>');
    expect(idle).toContain('<kbd>Q</kbd>');
    expect(idle).toContain('<small>Empty hands</small>');
    expect(abilityMarkup({ ...local, abilityProgress: 0.5 }, null)).toContain('is-ability is-active');
    const porter = abilityMarkup({ ...local, character: 'Machoke', ability: null, abilityName: '', perk: 'Repairs in 1 s',
      carrying: { kind: 'patient', species: 'Pikachu' } }, manifest);
    expect(porter).toContain('Passive</span>');
    expect(porter).not.toContain('<kbd>Q</kbd>');
    expect(porter).toContain('is-carry is-full');
    expect(porter).toContain('<small>Pikachu</small>');
    expect(abilityMarkup({ ...local, carrying: { kind: 'medicine', medicine: 'burnHeal' } }, null))
      .toContain('<small>Burn Heal</small>');
  });

  it('shows the action prompt with its key, hold progress, ability hint and help line', () => {
    const idle = actionMarkup(IDLE_ACTION, '', false);
    expect(idle).toContain('hud-action is-idle');
    expect(idle).toContain('<kbd>E</kbd> Interact</p>');
    expect(idle).not.toContain('hud-key');
    expect(actionMarkup(IDLE_ACTION, '', true)).toContain('<kbd>Q</kbd> Ability');
    const hold = actionMarkup({ key: 'E', label: 'Repair outage', tone: 'hold', progress: 0.25, ability: 'Calm' },
      'Hold E with empty hands', false);
    expect(hold).toContain('hud-ring hud-key" style="--p:25%"');
    expect(hold).toContain('<p class="hud-tip">');
    expect(hold).toContain('Hold E with empty hands</p>');
    expect(hold).toContain('<span class="hud-also"><kbd>Q</kbd>Calm</span>');
    const rejected = actionMarkup({ key: null, label: HOSTILE, tone: 'rejected', progress: 0, ability: '' }, '', false);
    expect(rejected).toContain('hud-action is-rejected');
    expect(rejected).not.toContain('<img');
  });

  it('shows event toasts by tone', () => {
    const markup = feedMarkup([{ id: 1, text: 'Left machine broke down', tone: 'alert', at: 0 },
      { id: 2, text: HOSTILE, tone: 'good', at: 0 }]);
    expect(markup).toContain('<li class="is-alert" data-feed="1">');
    expect(markup).toContain('Left machine broke down</li>');
    expect(markup).not.toContain('<img');
  });
});

describe('HUD world labels', () => {
  it('ties every label to the anchor the scene projects', () => {
    const markup = worldMarkup({
      players: [{ id: 'red', name: 'Red', character: 'Chansey', bot: false, local: true },
        { id: 'bot', name: 'Bot 2', character: 'Audino', bot: true, local: false }],
      patients: [
        { id: 'p1', label: '#1', pending: ['healing', 'burnHeal'], ready: false, tone: 'critical', patience: 0.2, showBar: true },
        { id: 'p2', label: 'Ready', pending: [], ready: true, tone: 'ready', patience: 1, showBar: false },
      ],
      machines: [{ state: 'idle', progress: 0, seconds: 0 }, { state: 'broken', progress: 0, seconds: 0 }],
      preparation: [{ kind: 'burnHeal', active: false, progress: 0 }, { kind: 'antidote', active: true, progress: 0.5 }],
      focus: { id: 'p1', species: 'Pikachu', hp: 10, patience: 0.2, seconds: 18, tone: 'critical', ready: false,
        critical: true, needs: [{ kind: 'healing', done: true }, { kind: 'burnHeal', done: false }], status: 'Critical',
        statusTone: 'critical' },
      popups: [{ id: 7, points: 80, streak: 3, at: 0 }],
    });
    expect(markup).toContain('class="hud-tag is-local" data-anchor="player:red"');
    expect(markup).toMatch(/data-anchor="player:bot" data-character="Audino"><svg/);
    expect(markup).toContain('hud-marker is-critical" data-anchor="patient:p1"');
    expect(markup).toContain('<span class="hud-marker-label">! #1</span>');
    expect(markup).toContain('<i style="width:20%"></i>');
    expect(markup).toContain('hud-marker is-ready is-ready" data-anchor="patient:p2"');
    expect(markup).not.toContain('machine:0');
    expect(markup).toContain('hud-station is-broken" data-anchor="machine:1"');
    expect(markup).not.toContain('prep:0');
    expect(markup).toContain('is-mixing is-antidote" data-anchor="prep:1"><span class="hud-ring " style="--p:50%"');
    expect(markup).toContain('hud-focus is-critical" data-anchor="focus:p1"');
    expect(markup).toContain('<span class="is-done">Healing</span>');
    expect(markup).toContain('Wait 18s · 20%');
    expect(markup).toContain('data-anchor="discharge" data-popup="7"><b>+80</b><small>Streak ×3</small>');
  });

  it('shows timed and finished machines and a fully treated focus card', () => {
    const markup = worldMarkup({ players: [], patients: [], preparation: [], popups: [],
      machines: [{ state: 'treating', progress: 0.5, seconds: 2 }, { state: 'ready', progress: 0, seconds: 0 }],
      focus: { id: 'p', species: 'Eevee', hp: 100, patience: 1, seconds: 90, tone: 'ready', ready: true, critical: false,
        needs: [{ kind: 'healing', done: true }], status: 'Ready for discharge', statusTone: 'ready' } });
    expect(markup).toContain('data-anchor="machine:0"><span class="hud-ring " style="--p:50%"><b>2s</b>');
    expect(markup).toContain('hud-station is-ready" data-anchor="machine:1"');
    expect(markup).toContain('All treatments complete');
  });
});
