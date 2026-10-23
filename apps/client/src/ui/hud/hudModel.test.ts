import { describe, expect, it } from 'vitest';
import { TREATMENT, type PatientRecord } from '@pokecenter/shared';
import { crewMembers, focusCard, localCard, machineBadge, patientVitals, playerActivity, preparationBadges,
  roundSummary, shiftPhase, treatmentNeeds, waitingQueue, worldPatients } from './hudModel.js';
import { IDLE_ACTION, type HudState } from './hudState.js';

function patient(overrides: Partial<PatientRecord> = {}): PatientRecord {
  return { id: 'p1', species: 'Pikachu', requiredTreatments: TREATMENT.healing, completedTreatments: 0,
    initialPatienceMs: 90_000, remainingPatienceMs: 90_000, lifecycle: 'active', location: 'waiting',
    slotIndex: 0, carrierId: '', ...overrides };
}

function state(overrides: Partial<HudState> = {}): HudState {
  return { active: true, localId: 'red', players: [], positions: [], patients: [],
    machines: [{ patientId: '', status: 'empty', remainingMs: 0 }, { patientId: '', status: 'empty', remainingMs: 0 }],
    doses: [], medicineOwners: ['', ''], medicineRemainingMs: [0, 0], remainingMs: 360_000, score: 0, streak: 0,
    discharged: 0, lost: 0, focusedPatientId: '', action: IDLE_ACTION, tip: '', notice: '', manifest: null,
    ...overrides };
}

describe('shift phase', () => {
  it.each([
    [360_000, 1, 'Calm'], [240_001, 1, 'Calm'], [240_000, 2, 'Busy'], [120_000, 3, 'Rush'],
    [30_000, 3, 'Last call'], [0, 3, 'Last call'], [Number.NaN, 1, 'Calm'],
  ])('labels %s ms left as stage %s (%s)', (remainingMs, stage, label) => {
    expect(shiftPhase(remainingMs)).toEqual({ stage, stages: 3, label });
  });
});

describe('patient vitals and treatments', () => {
  it('lists required care in a fixed order with completion', () => {
    expect(treatmentNeeds({ requiredTreatments: TREATMENT.antidote | TREATMENT.healing,
      completedTreatments: TREATMENT.healing })).toEqual([
      { kind: 'healing', done: true }, { kind: 'antidote', done: false }]);
  });

  it('marks warning at half patience and critical at a quarter, with critical taking priority over ready', () => {
    expect(patientVitals(patient({ remainingPatienceMs: 45_001 })).tone).toBe('normal');
    expect(patientVitals(patient({ remainingPatienceMs: 45_000 })).tone).toBe('warning');
    expect(patientVitals(patient({ remainingPatienceMs: 22_501 }))).toMatchObject({ tone: 'warning', critical: false });
    expect(patientVitals(patient({ remainingPatienceMs: 22_500 }))).toMatchObject({ tone: 'critical', seconds: 23 });
    expect(patientVitals(patient({ completedTreatments: TREATMENT.healing }))).toMatchObject({ tone: 'ready', ready: true });
    expect(patientVitals(patient({ completedTreatments: TREATMENT.healing, remainingPatienceMs: 9_000 })))
      .toMatchObject({ tone: 'critical', ready: true });
    expect(patientVitals(patient({ remainingPatienceMs: Number.NaN })).seconds).toBe(0);
  });
});

describe('waiting queue', () => {
  it('orders seated and reserved patients by urgency and collapses empty seats into a count', () => {
    const queue = waitingQueue(state({ focusedPatientId: 'b', patients: [
      patient({ id: 'a', slotIndex: 3, remainingPatienceMs: 60_000 }),
      patient({ id: 'b', slotIndex: 5, remainingPatienceMs: 20_000, requiredTreatments: TREATMENT.healing | TREATMENT.burnHeal,
        completedTreatments: TREATMENT.healing }),
      patient({ id: 'c', slotIndex: 1, remainingPatienceMs: 60_000, travelKind: 'arriving' }),
      patient({ id: 'gone', lifecycle: 'discharged', slotIndex: 2 }),
      patient({ id: 'machine', location: 'healingMachine' }),
      patient({ id: 'rest', location: 'recovery' }),
    ] }));
    expect(queue.cards.map((card) => [card.id, card.seat])).toEqual([['b', 6], ['c', 2], ['a', 4]]);
    expect(queue.cards[0]).toMatchObject({ focused: true, critical: true, pending: ['burnHeal'] });
    expect(queue.cards[1]).toMatchObject({ arriving: true, focused: false });
    expect(queue).toMatchObject({ seats: 8, free: 5, recovery: 1 });
  });

  it('reports no free seats when all eight are occupied or reserved', () => {
    const patients = Array.from({ length: 8 }, (_, slotIndex) => patient({ id: `p${slotIndex}`, slotIndex,
      travelKind: slotIndex === 7 ? 'arriving' : '' }));
    expect(waitingQueue(state({ patients })).free).toBe(0);
  });
});

describe('focus card', () => {
  const machines = (status: 'treating' | 'empty') => [{ patientId: 'p1', status, remainingMs: 1_000 },
    { patientId: '', status: 'empty' as const, remainingMs: 0 }];

  it('explains paused healing, readiness, urgency and remaining care', () => {
    expect(focusCard(state())).toBeNull();
    expect(focusCard(state({ focusedPatientId: 'p1', patients: [patient({ location: 'healingMachine' })],
      machines: machines('treating') }))).toMatchObject({ status: 'Healing · wait paused', statusTone: 'paused', tone: 'paused' });
    expect(focusCard(state({ focusedPatientId: 'p1', patients: [patient({ completedTreatments: TREATMENT.healing })] })))
      .toMatchObject({ status: 'Ready for discharge', statusTone: 'ready', needs: [{ kind: 'healing', done: true }] });
    expect(focusCard(state({ focusedPatientId: 'p1', patients: [patient({ completedTreatments: TREATMENT.healing,
      remainingPatienceMs: 9_000 })] }))).toMatchObject({ status: 'Critical · discharge now', statusTone: 'critical' });
    expect(focusCard(state({ focusedPatientId: 'p1', patients: [patient({ remainingPatienceMs: 9_000 })] }))?.status)
      .toBe('Critical');
    expect(focusCard(state({ focusedPatientId: 'p1', patients: [patient({ remainingPatienceMs: 40_000 })] }))?.status)
      .toBe('Losing patience');
    expect(focusCard(state({ focusedPatientId: 'p1', patients: [patient()] }))).toMatchObject({
      species: 'Pikachu', hp: 50, status: 'Awaiting care', statusTone: 'normal' });
    expect(focusCard(state({ focusedPatientId: 'p1', patients: [patient({ lifecycle: 'lost' })] }))).toBeNull();
  });
});

describe('crew and local player', () => {
  const players = [
    { id: 'red', name: 'Red', slot: 0, character: 'Chansey' as const },
    { id: 'bot-2', name: 'Bot 3', slot: 2, character: 'Machoke' as const, bot: true },
    { id: 'bot-1', name: 'Bot 2', slot: 1, character: 'Audino' as const, bot: true },
  ];

  it('describes what each teammate is doing from synchronized state', () => {
    const base = state({ players, patients: [patient({ id: 'carried', species: 'Eevee', location: 'carrier' })],
      doses: [{ id: 'dose', kind: 'antidote', location: 'carrier', carrierId: 'bot-1', slotIndex: -1 }] });
    const at = (id: string, extra: object) => ({ id, x: 0, y: 0, facing: 'down' as const, carriedPatientId: '', ...extra });
    expect(playerActivity({ ...base, positions: [at('bot-2', { carriedPatientId: 'carried' })] }, 'bot-2')).toBe('Carrying Eevee');
    expect(playerActivity({ ...base, positions: [at('bot-1', { carriedMedicineId: 'dose' })] }, 'bot-1')).toBe('Carrying Antidote');
    expect(playerActivity({ ...base, medicineOwners: ['', 'bot-1'] }, 'bot-1')).toBe('Mixing Antidote…');
    expect(playerActivity({ ...base, medicineOwners: ['bot-1', ''] }, 'bot-1')).toBe('Mixing Burn Heal…');
    expect(playerActivity({ ...base, machines: [{ patientId: '', status: 'broken', remainingMs: 0, repairOwnerId: 'bot-2' }] },
      'bot-2')).toBe('Repairing machine');
    expect(playerActivity({ ...base, positions: [at('red', { abilityRemainingMs: 500 })] }, 'red')).toBe('Using Soft-Boiled');
    expect(playerActivity({ ...base, positions: [at('bot-2', { abilityRemainingMs: 500 })] }, 'bot-2')).toBe('');
    expect(playerActivity({ ...base, players: [{ ...players[1]!, connected: false }] }, 'bot-2')).toBe('Reconnecting…');
  });

  it('lists teammates by seat without the local player', () => {
    expect(crewMembers(state({ players })).map(({ name, role, bot, activity }) => ({ name, role, bot, activity }))).toEqual([
      { name: 'Bot 2', role: 'Pharmacy', bot: true, activity: '' },
      { name: 'Bot 3', role: 'Porter', bot: true, activity: '' },
    ]);
    expect(crewMembers(state({ players: [{ id: 'x', name: 'New', slot: 1 }] }))[0]?.role).toBe('Staff');
  });

  it('shows the local role, ability progress and what the player carries', () => {
    expect(localCard(state())).toBeNull();
    const position = { id: 'red', x: 0, y: 0, facing: 'down' as const, carriedPatientId: '' };
    expect(localCard(state({ players, positions: [position] }))).toEqual({ name: 'Red', character: 'Chansey',
      role: 'Nurse', perk: 'Machines heal 40% faster', ability: 'softBoiled', abilityName: 'Soft-Boiled',
      abilityProgress: null, carrying: null });
    expect(localCard(state({ players, positions: [{ ...position, abilityRemainingMs: 750 }] }))?.abilityProgress).toBe(0.75);
    expect(localCard(state({ players, positions: [{ ...position, carriedPatientId: 'p1' }], patients: [patient()] }))?.carrying)
      .toEqual({ kind: 'patient', species: 'Pikachu' });
    expect(localCard(state({ players, positions: [{ ...position, carriedMedicineId: 'dose' }],
      doses: [{ id: 'dose', kind: 'burnHeal', location: 'carrier', carrierId: 'red', slotIndex: -1 }] }))?.carrying)
      .toEqual({ kind: 'medicine', medicine: 'burnHeal' });
    expect(localCard(state({ localId: 'bot-2', players }))).toMatchObject({ ability: null, abilityName: '', perk: 'Carries patients 20% faster' });
  });
});

describe('stations', () => {
  const players = [{ id: 'mac', name: 'Mac', slot: 0, character: 'Machoke' as const },
    { id: 'aud', name: 'Aud', slot: 1, character: 'Audino' as const }];

  it('turns machine snapshots into timed, ready, broken and repair badges', () => {
    expect(machineBadge({ patientId: '', status: 'empty', remainingMs: 0 }, state())).toEqual({ state: 'idle', progress: 0, seconds: 0 });
    expect(machineBadge({ patientId: 'p', status: 'treating', remainingMs: 1_000 }, state()))
      .toEqual({ state: 'treating', progress: 0.75, seconds: 1 });
    expect(machineBadge({ patientId: 'p', status: 'treating', remainingMs: 1_000, durationMs: 2_000 }, state()).progress).toBe(0.5);
    expect(machineBadge({ patientId: 'p', status: 'completed', remainingMs: 0 }, state()).state).toBe('ready');
    expect(machineBadge({ patientId: 'p', status: 'broken', remainingMs: 2_400 }, state()))
      .toEqual({ state: 'broken', progress: 0, seconds: 3 });
    expect(machineBadge({ patientId: '', status: 'broken', remainingMs: 0, repairOwnerId: 'mac', repairRemainingMs: 250 },
      state({ players }))).toEqual({ state: 'repairing', progress: 0.75, seconds: 1 });
  });

  it('shows medicine mixing progress at the preparing character pace', () => {
    expect(preparationBadges(state({ players, medicineOwners: ['', 'aud'], medicineRemainingMs: [0, 250] }))).toEqual([
      { kind: 'burnHeal', active: false, progress: 0 }, { kind: 'antidote', active: true, progress: 0.75 }]);
  });
});

describe('world patients and round summary', () => {
  it('labels seats, travel and status compactly', () => {
    const markers = worldPatients(state({ patients: [
      patient({ id: 'seat', slotIndex: 2, remainingPatienceMs: 9_000 }),
      patient({ id: 'arrive', travelKind: 'arriving' }),
      patient({ id: 'bye', lifecycle: 'discharged', travelKind: 'leaving' }),
      patient({ id: 'faint', lifecycle: 'lost', travelKind: 'fainting' }),
      patient({ id: 'machine', location: 'healingMachine', completedTreatments: TREATMENT.healing }),
      patient({ id: 'carried', location: 'carrier', requiredTreatments: TREATMENT.antidote }),
      patient({ id: 'hidden', lifecycle: 'unfinished' }),
    ] }));
    expect(markers.map((marker) => [marker.id, marker.label])).toEqual([['seat', '#3'], ['arrive', 'Arriving'],
      ['bye', 'Bye!'], ['faint', 'Fainted'], ['machine', 'Ready'], ['carried', 'HP 100']]);
    expect(markers[0]).toMatchObject({ tone: 'critical', pending: ['healing'], showBar: true });
    expect(markers[1]?.showBar).toBe(false);
    expect(markers[2]).toMatchObject({ pending: [], ready: false, tone: 'normal', showBar: false });
    expect(markers[4]).toMatchObject({ ready: true, pending: [] });
  });

  it('summarizes the clock, streak bonus and final-call urgency', () => {
    expect(roundSummary(state({ remainingMs: 61_000, score: 120, streak: 1, discharged: 2, lost: 1 }))).toMatchObject({
      clock: '1:01', urgent: false, score: 120, streak: 1, streakBonus: 0, discharged: 2, lost: 1 });
    expect(roundSummary(state({ remainingMs: 30_000, streak: 4 }))).toMatchObject({ clock: '0:30', urgent: true,
      streakBonus: 30, phase: { label: 'Last call' } });
  });
});
