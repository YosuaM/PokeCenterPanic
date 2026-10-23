import { CHARACTER_PROFILES, type PlayerCharacter } from '@pokecenter/shared';
import { animationRow, type SpriteManifest } from '../../sprites/pmd.js';
import type { FeedEntry, ScorePopup } from './hudFeed.js';
import type { CrewMember, FocusCard, LocalCard, MachineBadge, PreparationBadge, QueueCard, RoundSummary,
  TreatmentKind, WaitingQueue, WorldPatient } from './hudModel.js';
import { TREATMENT_NAME } from './hudModel.js';
import type { HudAction } from './hudState.js';

const PATHS = {
  healing: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  burnHeal: 'M12 21c-3.9 0-6-2.6-6-5.6 0-3.4 3-5.4 3.6-8.9 2 1.2 3 3 3 4.6.9-.6 1.6-1.6 1.8-3 2.1 1.9 3.6 4.4 3.6 7.3 0 3-2.1 5.6-6 5.6z',
  antidote: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3',
  discharge: 'M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  lost: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM12 7.4l-2 4 3 2-1 4',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.5-.7-.7-2.5z',
  softBoiled: 'M12 3c3.5 0 6 5 6 9.5a6 6 0 0 1-12 0C6 8 8.5 3 12 3z',
  calm: 'M3 10c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0M3 15c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5m0 0V4.5a1.5 1.5 0 0 1 3 0V11m0 0V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 14',
  bot: 'M6 9h12v9H6zM12 5v4M9.5 13.5h.01M14.5 13.5h.01',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  tip: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  seat: 'M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4M3 11a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v6H3zM6 17v3M18 17v3',
  bed: 'M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  porter: 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12',
  speed: 'M13 3 5 14h6l-1 7 8-11h-6z',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): string {
  return `<svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const pct = (ratio: number) => `${Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10}%`;

/** First idle frame facing the camera, cropped to a square box; a letter stands in when sprites are absent. */
export function spriteFrame(manifest: SpriteManifest | null, species: string | undefined, size: number): string {
  const sprite = manifest?.species.find((entry) => entry.name === species)?.idle;
  if (!sprite) return `<span class="hud-sprite is-fallback" style="--size:${size}px">${escapeHtml((species ?? '?').charAt(0))}</span>`;
  // Frames carry transparent padding, so zoom past the box and let it crop the edges.
  const scale = size * 1.35 / Math.max(sprite.frameWidth, sprite.frameHeight);
  const px = (value: number) => `${Math.round(value * scale * 100) / 100}px`;
  const row = animationRow('down', sprite.directions);
  return `<span class="hud-sprite" style="--size:${size}px"><i style="width:${px(sprite.frameWidth)};height:${px(sprite.frameHeight)};` +
    `background-image:url('/assets/external/pmd/${escapeHtml(sprite.image)}');` +
    `background-size:${px(sprite.frameWidth * sprite.durations.length)} ${px(sprite.frameHeight * sprite.directions)};` +
    `background-position:0 -${px(row * sprite.frameHeight)}"></i></span>`;
}

function treatmentChip(kind: TreatmentKind, done = false): string {
  return `<span class="hud-treat is-${kind}${done ? ' is-done' : ''}" title="${TREATMENT_NAME[kind]}">${icon(kind)}</span>`;
}

function ring(progress: number, content: string, className = ''): string {
  return `<span class="hud-ring ${className}" style="--p:${pct(progress)}">${content}</span>`;
}

const ROLE_ICON: Readonly<Record<PlayerCharacter, IconName>> = {
  Chansey: 'softBoiled', Audino: 'calm', Machoke: 'porter', Meowth: 'speed',
};

export function playerCardMarkup(card: LocalCard | null, manifest: SpriteManifest | null): string {
  if (!card) return '';
  const character = card.character ?? 'Staff';
  return `<div class="hud-player" data-character="${escapeHtml(character)}">` +
    ring(card.abilityProgress ?? (card.ability ? 1 : 0), spriteFrame(manifest, card.character, 56), 'hud-player-portrait') +
    `<span class="hud-you">You</span>` +
    `<div class="hud-player-card"><div><b>${escapeHtml(character)}</b><span class="hud-chip is-role">${escapeHtml(card.role)}</span></div>` +
    `<small>${escapeHtml(card.name)}${card.perk ? ` · ${escapeHtml(card.perk)}` : ''}</small></div></div>`;
}

export function shiftMarkup(round: RoundSummary): string {
  const dots = Array.from({ length: round.phase.stages }, (_, index) =>
    `<i class="${index < round.phase.stage ? 'is-on' : ''}"></i>`).join('');
  return `<div class="hud-shift"><div class="hud-shift-card"><b>Pokémon Center</b>` +
    `<div class="hud-phase"><span class="hud-dots">${dots}</span>Stage ${round.phase.stage}/${round.phase.stages}` +
    `<span class="hud-chip is-phase-${round.phase.stage}${round.urgent ? ' is-last' : ''}">${round.phase.label}</span></div></div>` +
    `<div class="hud-timer${round.urgent ? ' is-urgent' : ''}" role="timer" aria-label="Time left ${round.clock}">` +
    `<span class="hud-ball" aria-hidden="true"></span><b>${round.clock}</b></div></div>` +
    `<div class="hud-stats">` +
    `<span class="hud-stat is-score" aria-label="Score">${icon('star')}${round.score}</span>` +
    (round.streak >= 2 ? `<span class="hud-stat is-streak" aria-label="Streak">${icon('burnHeal')}×${round.streak}<small>+${round.streakBonus}</small></span>` : '') +
    `<span class="hud-stat is-discharged" aria-label="Discharged">${icon('discharge')}${round.discharged}</span>` +
    `<span class="hud-stat is-lost${round.lost ? ' has-lost' : ''}" aria-label="Lost">${icon('lost')}${round.lost}</span></div>`;
}

export function crewMarkup(crew: readonly CrewMember[], manifest: SpriteManifest | null): string {
  if (!crew.length) return '';
  return `<ul class="hud-crew" aria-label="Crew">${crew.map((member) =>
    `<li data-character="${escapeHtml(member.character ?? '')}">${ring(1, spriteFrame(manifest, member.character, 26))}` +
    `<div><b>${escapeHtml(member.name)}</b>${member.bot ? `<span class="hud-chip is-bot">${icon('bot')}Bot</span>` : ''}` +
    `<small>${escapeHtml(member.activity || member.role)}</small></div></li>`).join('')}</ul>`;
}

function queueCardMarkup(card: QueueCard, manifest: SpriteManifest | null): string {
  const flag = card.arriving ? '<small class="is-arriving">Arriving</small>' : card.critical ?
    '<small class="is-critical">Urgent</small>' : card.ready ? '<small class="is-ready">Ready</small>' : '';
  return `<li class="hud-patient is-${card.tone}${card.focused ? ' is-focused' : ''}${card.arriving ? ' is-reserved' : ''}" data-patient="${escapeHtml(card.id)}">` +
    ring(card.patience, spriteFrame(manifest, card.species, 22)) +
    `<div><div class="hud-row"><b>${escapeHtml(card.species)}</b><span class="hud-seat">#${card.seat}</span>` +
    `<span class="hud-seconds">${card.seconds}s</span></div>` +
    `<div class="hud-row">${card.ready ? treatmentChipReady() : card.pending.map((kind) => treatmentChip(kind)).join('')}` +
    `${flag}<span class="hud-hp">HP ${card.hp}</span></div></div></li>`;
}

function treatmentChipReady(): string {
  return `<span class="hud-treat is-discharge" title="Discharge">${icon('discharge')}</span>`;
}

export function queueMarkup(queue: WaitingQueue, manifest: SpriteManifest | null): string {
  const full = queue.cards.length >= queue.seats;
  return `<div class="hud-queue"><h2>${icon('seat')}Waiting room<span class="hud-chip is-count">${queue.cards.length}/${queue.seats}</span>` +
    (full ? '<span class="hud-chip is-full">Full</span>' : '') +
    (queue.recovery ? `<span class="hud-chip is-recovery">${icon('bed')}${queue.recovery}</span>` : '') + '</h2>' +
    `<ol>${queue.cards.map((card) => queueCardMarkup(card, manifest)).join('')}</ol>` +
    (queue.free ? `<p class="hud-free">+ ${queue.free} free seat${queue.free === 1 ? '' : 's'}</p>` : '') + '</div>';
}

export function abilityMarkup(card: LocalCard | null, manifest: SpriteManifest | null): string {
  if (!card) return '';
  const character = card.character;
  const passive = character && !card.ability ?
    `<div class="hud-slot is-passive"><span class="hud-slot-name">Passive</span>${ring(1, icon(ROLE_ICON[character]))}` +
    `<small>${escapeHtml(card.perk)}</small></div>` : '';
  const ability = card.ability ? `<div class="hud-slot is-ability${card.abilityProgress !== null ? ' is-active' : ''}">` +
    `<span class="hud-slot-name">${escapeHtml(card.abilityName)}</span>` +
    ring(card.abilityProgress ?? 1, icon(card.ability)) + '<kbd>Q</kbd></div>' : '';
  const carrying = card.carrying;
  const held = carrying?.kind === 'patient' ? spriteFrame(manifest, carrying.species, 34) :
    carrying?.kind === 'medicine' ? treatmentChip(carrying.medicine) : icon('hand');
  const heldName = carrying?.kind === 'patient' ? carrying.species : carrying?.kind === 'medicine' ?
    TREATMENT_NAME[carrying.medicine] : 'Empty hands';
  return `<div class="hud-slots">${ability}${passive}<div class="hud-slot is-carry${carrying ? ' is-full' : ''}">` +
    `<span class="hud-slot-name">Carrying</span><span class="hud-carry">${held}</span><small>${escapeHtml(heldName)}</small></div></div>`;
}

export function actionMarkup(action: HudAction, tip: string, hasAbility: boolean): string {
  const help = tip ? `<p class="hud-tip">${icon('tip')}${escapeHtml(tip)}</p>` :
    `<p class="hud-tip is-controls"><kbd>WASD</kbd> Move <kbd>E</kbd> Interact${hasAbility ? ' <kbd>Q</kbd> Ability' : ''}</p>`;
  const key = action.key ? ring(action.progress, `<kbd>${action.key}</kbd>`, 'hud-key') : '';
  return `<div class="hud-action is-${action.tone}" role="status" aria-live="polite">${help}` +
    `<div class="hud-prompt">${key}<b>${action.tone === 'rejected' ? `${icon('alert')}` : ''}${escapeHtml(action.label)}</b>` +
    (action.ability ? `<span class="hud-also"><kbd>Q</kbd>${escapeHtml(action.ability)}</span>` : '') + '</div></div>';
}

export function feedMarkup(entries: readonly FeedEntry[]): string {
  const icons = { alert: 'alert', good: 'sparkle', ready: 'discharge' } as const;
  return `<ul class="hud-feed" aria-live="polite">${entries.map((entry) =>
    `<li class="is-${entry.tone}" data-feed="${entry.id}">${icon(icons[entry.tone])}${escapeHtml(entry.text)}</li>`).join('')}</ul>`;
}

export function menuMarkup(): string {
  return `<button class="hud-menu" type="button" aria-label="Open room menu" data-hud-menu><kbd>Esc</kbd>${icon('menu')}</button>`;
}

/** World labels, each tied to an anchor the scene projects every frame. */
export function worldMarkup(parts: {
  players: readonly { id: string; name: string; character: string; bot: boolean; local: boolean }[];
  patients: readonly WorldPatient[];
  machines: readonly MachineBadge[];
  preparation: readonly PreparationBadge[];
  focus: FocusCard | null;
  popups: readonly ScorePopup[];
}): string {
  const players = parts.players.map((player) =>
    `<span class="hud-tag${player.local ? ' is-local' : ''}" data-anchor="player:${escapeHtml(player.id)}" data-character="${escapeHtml(player.character)}">` +
    `${player.bot ? icon('bot') : ''}${escapeHtml(player.name)}</span>`).join('');
  const patients = parts.patients.map((patient) =>
    `<span class="hud-marker is-${patient.tone}${patient.ready ? ' is-ready' : ''}" data-anchor="patient:${escapeHtml(patient.id)}">` +
    `<span class="hud-marker-icons">${patient.ready ? treatmentChipReady() : patient.pending.map((kind) => treatmentChip(kind)).join('')}</span>` +
    `<span class="hud-marker-label">${patient.tone === 'critical' ? '! ' : ''}${escapeHtml(patient.label)}</span>` +
    (patient.showBar ? `<span class="hud-marker-bar"><i style="width:${pct(patient.patience)}"></i></span>` : '') + '</span>').join('');
  const machines = parts.machines.map((machine, index) => machine.state === 'idle' ? '' :
    `<span class="hud-station is-${machine.state}" data-anchor="machine:${index}">` +
    (machine.state === 'broken' ? icon('wrench') : machine.state === 'ready' ? icon('check') :
      ring(machine.progress, machine.state === 'repairing' ? icon('wrench') : `<b>${machine.seconds}s</b>`)) + '</span>').join('');
  const preparation = parts.preparation.map((badge, index) => badge.active ?
    `<span class="hud-station is-mixing is-${badge.kind}" data-anchor="prep:${index}">${ring(badge.progress, icon(badge.kind))}</span>` : '').join('');
  const focus = parts.focus;
  const card = focus ? `<div class="hud-focus is-${focus.statusTone}" data-anchor="focus:${escapeHtml(focus.id)}">` +
    `<div class="hud-row"><b>${escapeHtml(focus.species)}</b><span class="hud-hp">HP ${focus.hp}</span></div>` +
    `<span class="hud-chip is-status">${escapeHtml(focus.status)}</span>` +
    `<div class="hud-needs">${focus.needs.length && focus.needs.every((need) => need.done) ? '<span>All treatments complete</span>' :
      `<span>Needs</span>${focus.needs.map((need) => `${treatmentChip(need.kind, need.done)}<span class="${need.done ? 'is-done' : ''}">${TREATMENT_NAME[need.kind]}</span>`).join('')}`}</div>` +
    `<div class="hud-bars"><i class="is-hp" style="width:${focus.hp}%"></i></div>` +
    `<div class="hud-bars"><i class="is-wait" style="width:${pct(focus.patience)}"></i></div>` +
    `<div class="hud-row is-small"><span>HP ${focus.hp}/100</span><span>Wait ${focus.seconds}s · ${Math.ceil(focus.patience * 100)}%</span></div></div>` : '';
  const popups = parts.popups.map((popup) => `<span class="hud-popup" data-anchor="discharge" data-popup="${popup.id}">` +
    `<b>+${popup.points}</b>${popup.streak >= 2 ? `<small>Streak ×${popup.streak}</small>` : ''}</span>`).join('');
  return players + patients + machines + preparation + card + popups;
}

export function hasAbility(character: PlayerCharacter | undefined): boolean {
  return Boolean(character && CHARACTER_PROFILES[character].ability);
}
