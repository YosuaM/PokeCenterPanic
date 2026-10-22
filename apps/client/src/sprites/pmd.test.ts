import { describe, expect, it } from 'vitest';
import { animationRow, parseAnimationXml, parseSpriteManifest, patientRenderPosition,
  playerSpriteSpecies, pngDimensions, spriteMotion, validateAnimation, PATIENT_SPRITES,
  type SpriteManifest } from './pmd.js';
import type { PatientRecord } from '@pokecenter/shared';

const xml = `<AnimData><Anims><Anim><Name>Idle</Name><FrameWidth>16</FrameWidth>
<FrameHeight>24</FrameHeight><Durations><Duration>4</Duration><Duration>8</Duration></Durations>
</Anim><Anim><Name>Walk</Name><FrameWidth>16</FrameWidth><FrameHeight>24</FrameHeight>
<Durations><Duration>3</Duration><Duration>6</Duration></Durations></Anim></Anims></AnimData>`;

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('PMD sprite metadata', () => {
  it('accepts optional Dance or Rotate selection sheets while keeping old manifests compatible', () => {
    for (const name of ['Dance', 'Rotate'] as const) {
      const selectionXml = xml.replace('<Name>Idle</Name>', `<Name>${name}</Name>`);
      const selection = validateAnimation(selectionXml, name, png(32, 24), `0113/${name}-Anim.png`)!;
      const idle = { ...selection, image: '0113/Idle-Anim.png' };
      const species = { name: 'Chansey', id: '0113', credits: 'Fixture artist', idle };
      expect(parseSpriteManifest({ source: 'fixture', species: [species] }).species[0]!.selection).toBeUndefined();
      expect(parseSpriteManifest({ source: 'fixture', species: [{ ...species, selection }] }).species[0]!.selection).toEqual(selection);
      for (const invalid of [{ ...selection, image: '0113/Hop-Anim.png' },
        { ...selection, image: 'https://example.test/Rotate-Anim.png' }, { ...selection, directions: 2 }]) {
        expect(() => parseSpriteManifest({ source: 'fixture', species: [{ ...species, selection: invalid }] }))
          .toThrow('Malformed PMD sprite manifest entry');
      }
    }
  });

  it('supports all six patient species and maps the four player slots deterministically', () => {
    expect(Object.keys(PATIENT_SPRITES)).toEqual([
      'Pikachu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Eevee', 'Psyduck',
    ]);
    expect([0, 1, 2, 3].map((slot) => playerSpriteSpecies({ id: String(slot),
      name: 'Player', slot }))).toEqual(['Chansey', 'Audino', 'Machoke', 'Meowth']);
  });

  it('preserves frame sizes, durations, and direction rows from XML and PNG', () => {
    expect(parseAnimationXml(xml, 'Idle')).toEqual({
      frameWidth: 16, frameHeight: 24, durations: [4, 8],
    });
    expect(pngDimensions(png(32, 192))).toEqual({ width: 32, height: 192 });
    expect(validateAnimation(xml, 'Idle', png(32, 192), 'sprite.png')).toEqual({
      frameWidth: 16, frameHeight: 24, durations: [4, 8], directions: 8, image: 'sprite.png',
    });
    expect(['down', 'right', 'up', 'left'].map((direction) =>
      animationRow(direction as 'down' | 'right' | 'up' | 'left', 8))).toEqual([0, 2, 4, 6]);
    expect(animationRow('left', 1)).toBe(0);
  });

  it('rejects malformed sheets and metadata with recoverable errors', () => {
    expect(() => validateAnimation(xml, 'Walk', png(16, 192), 'bad.png'))
      .toThrow('dimensions do not match XML');
    expect(() => pngDimensions(new Uint8Array(24))).toThrow('Malformed PMD PNG');
    expect(() => parseAnimationXml(xml.replace('<Duration>4</Duration>', '<Duration>0</Duration>'),
      'Idle')).toThrow('Malformed PMD Idle');
    expect(() => animationRow('up', 3)).toThrow('Unsupported PMD direction count');
    expect(parseAnimationXml('<AnimData/>', 'Walk')).toBeUndefined();
  });

  it('validates manifests and refuses entries without matching credits', () => {
    const manifest: SpriteManifest = { source: 'source', species: [{
      name: 'Pikachu', id: '0025', credits: 'Artist',
      idle: { frameWidth: 16, frameHeight: 24, durations: [4], directions: 8,
        image: '0025/Idle-Anim.png' },
    }] };
    expect(parseSpriteManifest(manifest)).toEqual(manifest);
    expect(() => parseSpriteManifest({ ...manifest, species: [{ ...manifest.species[0], credits: '' }] }))
      .toThrow('Malformed PMD sprite manifest entry');
    expect(() => parseSpriteManifest({ ...manifest, species: [{ ...manifest.species[0],
      idle: { ...manifest.species[0]!.idle, directions: 3 } }] }))
      .toThrow('Malformed PMD sprite manifest entry');
    expect(() => parseSpriteManifest(undefined)).toThrow('Missing PMD sprite manifest');
  });
});

describe('sprite placement', () => {
  const stations = { reception: [{ x: 1, y: 2 }], waiting: [{ x: 3, y: 4 }],
    recovery: { x: 5, y: 6 }, healingMachine: { x: 7, y: 8 } };
  const patient: PatientRecord = { id: 'patient', species: 'Pikachu', requiredTreatments: 1,
    completedTreatments: 0, initialPatienceMs: 100, remainingPatienceMs: 100,
    lifecycle: 'active', location: 'reception', slotIndex: 0, carrierId: '' };

  it('places patients by their authoritative machine index and rejects nonexistent machine slots', () => {
    const machines = [{ x: 7, y: 8 }, { x: 70, y: 80 }];
    for (const slotIndex of [0, 1]) {
      expect(patientRenderPosition({ ...patient, location: 'healingMachine', slotIndex },
        { ...stations, healingMachines: machines })).toEqual(machines[slotIndex]);
    }
    expect(patientRenderPosition({ ...patient, location: 'healingMachine', slotIndex: 2 },
      { ...stations, healingMachines: machines })).toBeUndefined();
  });

  it('uses synchronized stations and carrier positions without rendering queued or departed patients', () => {
    expect(patientRenderPosition(patient, stations)).toEqual({ x: 1, y: 2 });
    expect(patientRenderPosition({ ...patient, location: 'waiting' }, stations)).toEqual({ x: 3, y: 4 });
    expect(patientRenderPosition({ ...patient, location: 'healingMachine' }, stations))
      .toEqual({ x: 7, y: 8 });
    expect(patientRenderPosition({ ...patient, location: 'carrier' }, stations, { x: 9, y: 10 }))
      .toEqual({ x: 9, y: 10 });
    expect(patientRenderPosition({ ...patient, location: 'recovery', slotIndex: 1 }, stations))
      .toBeUndefined();
    expect(patientRenderPosition({ ...patient, lifecycle: 'discharged' }, stations)).toBeUndefined();
  });

  it('derives animation direction and walking from authoritative movement targets', () => {
    expect(spriteMotion({ id: 'red', x: 10, y: 10, facing: 'left', carriedPatientId: '' },
      { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ facing: 'left', moving: true });
    expect(spriteMotion(undefined, { x: 10, y: 0 }, { x: 10, y: 0 }))
      .toEqual({ facing: 'down', moving: false });
  });
});
