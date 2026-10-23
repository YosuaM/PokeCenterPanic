import { describe, expect, it } from 'vitest';
import { type PatientRecord } from '@pokecenter/shared';
import { PatientReadyAlerts } from './patientIndicatorAlerts.js';

const patient: PatientRecord = { id: 'p1', species: 'Pikachu', requiredTreatments: 3,
  completedTreatments: 1, lifecycle: 'active', location: 'waiting', slotIndex: 0,
  carrierId: '', initialPatienceMs: 90000, remainingPatienceMs: 45000 };
const ready = { ...patient, completedTreatments: 3 };

describe('ready patient notices', () => {
  it('announces completion once, without replaying on duplicate snapshots or extending the notice', () => {
    const alerts = new PatientReadyAlerts();
    alerts.sync([patient], 0);
    expect(alerts.at(0)).toBeNull();
    alerts.sync([ready], 1000);
    expect(alerts.at(1000)).toEqual({ text: 'Pikachu #1 is ready for discharge', alpha: 1 });
    alerts.sync([{ ...ready }], 2000);
    expect(alerts.at(3800)?.alpha).toBeCloseTo(0.5);
    expect(alerts.at(4200)).toBeNull();
    alerts.sync([ready], 5000);
    expect(alerts.at(5000)).toBeNull();
  });

  it('keeps initial/reconnected ready patients quiet and requires every treatment and remaining patience', () => {
    const alerts = new PatientReadyAlerts();
    alerts.sync([ready], 0);
    expect(alerts.at(0)).toBeNull();
    alerts.clear();
    alerts.sync([patient], 0);
    alerts.sync([{ ...ready, remainingPatienceMs: 0 }], 1000);
    expect(alerts.at(1000)).toBeNull();
    alerts.clear();
    alerts.sync([ready], 2000);
    expect(alerts.at(2000)).toBeNull();
  });

  it('groups simultaneous completions and removes notices for patients who leave or expire', () => {
    const alerts = new PatientReadyAlerts();
    const second = { ...patient, id: 'p2', species: 'Squirtle' as const };
    alerts.sync([patient, second], 0);
    alerts.sync([ready, { ...second, completedTreatments: 3 }], 1000);
    expect(alerts.at(1000)?.text).toBe('2 Pokémon ready for discharge');
    alerts.sync([ready, { ...second, lifecycle: 'discharged' }], 1100);
    expect(alerts.at(1100)?.text).toBe('Pikachu #1 is ready for discharge');
    alerts.sync([{ ...ready, lifecycle: 'lost' }], 1200);
    expect(alerts.at(1200)).toBeNull();
  });

  it('shows static notices with reduced motion and clears all state when gameplay ends', () => {
    const alerts = new PatientReadyAlerts();
    alerts.sync([patient], 0);
    alerts.sync([ready], 1000);
    expect(alerts.at(3800, true)?.alpha).toBe(1);
    alerts.clear();
    expect(alerts.at(3800)).toBeNull();
  });

  it('updates a notice when its patient leaves the seat and groups a later completion', () => {
    const alerts = new PatientReadyAlerts();
    const second = { ...patient, id: 'p2', slotIndex: 1 };
    alerts.sync([patient, second], 0);
    alerts.sync([ready, second], 1000);
    expect(alerts.at(1000)?.text).toBe('Pikachu #1 is ready for discharge');
    const carried = { ...ready, location: 'carrier' as const, slotIndex: -1, carrierId: 'staff' };
    alerts.sync([carried, second], 1500);
    expect(alerts.at(1500)?.text).toBe('Pikachu is ready for discharge');
    alerts.sync([carried, { ...second, completedTreatments: 3 }], 2000);
    expect(alerts.at(2000)?.text).toBe('2 Pokémon ready for discharge');
  });
});
