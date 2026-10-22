import * as THREE from 'three';
import { observeRenderSize } from '../renderResolution.js';
import { MEDICINE_SURFACE_POINTS, PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH, PATIENT_ELEVATIONS,
  type Direction, type MedicineDiscardEvent, type MedicineDoseRecord, type HealingMachineSnapshot,
  type Point, type PatientRecord } from '@pokecenter/shared';
import { animationRow, type SpeciesSprite, type SpriteAnimation,
  type SpriteManifest } from '../sprites/pmd.js';
import { MedicineBottleModels, MEDICINE_BOTTLE_SURFACE_HEIGHT,
  MEDICINE_BOTTLE_CARRIED_HEIGHT } from './medicineBottleModels.js';
import { TransportStretcherMotion } from './transportStretcherMotion.js';
import { patientDistress } from './patientDistress.js';
import { TransportStretcherModels, TRANSPORT_STRETCHER_ELEVATION } from './transportStretcherModels.js';
import { RecoveryAreaModel } from './recoveryAreaModel.js';
import { WaitingBenchesModel } from './waitingBenchesModel.js';
import { ReceptionCounterModel } from './receptionCounterModel.js';
import { EntranceDoorModel } from './entranceDoorModel.js';
import { CenterSignModel } from './centerSignModel.js';
import { CenterRoomModel } from './centerRoomModel.js';
import { PcTerminalModel } from './pcTerminalModel.js';
import { MedicineDisposalModel } from './medicineDisposalModel.js';
import { MedicineTableModel } from './medicineTableModel.js';
import { HealingMachineModels } from './healingMachineModels.js';
import { createCenter3DEnvironment } from './center3dEnvironment.js';
import { CAMERA_HALF_HEIGHT, CAMERA_HALF_WIDTH, WORLD_SCALE, cameraPosition,
  worldPosition } from './center3dLayout.js';

export interface Center3DCharacter {
  id: string;
  species: string;
  point: Point;
  elevation: number;
  facing: Direction;
  moving: boolean;
  isPlayer: boolean;
  carried: boolean;
  patienceRatio?: number;
  faintProgress?: number;
}

interface CharacterSprite {
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  shadow: THREE.Mesh;
  locator: THREE.Mesh;
  stretcher: THREE.Group;
  transportMotion: TransportStretcherMotion;
  frameKey: string;
  footOffset: number;
}

const PMD_WORLD_SCALE = 2.5 / 48;

export function spriteWorldSize(width: number, height: number): { width: number; height: number } {
  return { width: width * PMD_WORLD_SCALE, height: height * PMD_WORLD_SCALE };
}

export function visibleBottomPadding(alpha: Uint8ClampedArray, width: number, height: number): number {
  for (let row = height - 1; row >= 0; row -= 1) {
    for (let column = 0; column < width; column += 1) {
      if (alpha[(row * width + column) * 4 + 3]) return height - row - 1;
    }
  }
  return 0;
}

export function characterElevation(location: string): number {
  return PATIENT_ELEVATIONS[location] ?? 0.03;
}

export function characterRenderOrder(point: Point, carried: boolean): number {
  return Math.round((worldPosition(point).z + 6) * 100) + (carried ? 1 : 0);
}

export function createUprightCharacterPlane(texture: THREE.Texture, yaw: number):
  THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true,
    alphaTest: 0.1, depthTest: true, depthWrite: false, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.y = yaw;
  return plane;
}

export class Center3DView {
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-CAMERA_HALF_WIDTH, CAMERA_HALF_WIDTH,
    CAMERA_HALF_HEIGHT, -CAMERA_HALF_HEIGHT, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly stopObservingSize: () => void;
  private readonly characters = new Map<string, CharacterSprite>();
  private readonly discardedMedicines = new Set<string>();
  private readonly medicines = new Map<string, THREE.Group>();
  private readonly images = new Map<string, CanvasImageSource>();
  private readonly marker: THREE.Mesh;
  private readonly healingMachines: HealingMachineModels;
  private readonly entranceDoor: EntranceDoorModel;
  private readonly centerSign: CenterSignModel;
  private readonly room: CenterRoomModel;
  private readonly pcTerminal: PcTerminalModel;
  private readonly medicineDisposal: MedicineDisposalModel;
  private readonly medicineTable: MedicineTableModel;
  private readonly receptionCounter: ReceptionCounterModel;
  private readonly waitingBenches: WaitingBenchesModel;
  private readonly recoveryArea: RecoveryAreaModel;
  private readonly transportStretchers: TransportStretcherModels;
  private readonly medicineBottles: MedicineBottleModels;
  private manifest: SpriteManifest | null = null;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.stopObservingSize = observeRenderSize(mount, ({ width, height }) => {
      this.renderer.setSize(width, height, false);
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'center-3d-canvas';
    this.mount.prepend(this.canvas);
    this.scene.background = new THREE.Color('#12253d');
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    const sunlight = new THREE.DirectionalLight(0xffdfb1, 2.2);
    sunlight.position.set(-6, 13, 9);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -14;
    sunlight.shadow.camera.right = 14;
    sunlight.shadow.camera.top = 14;
    sunlight.shadow.camera.bottom = -14;
    sunlight.shadow.bias = -0.0005;
    this.scene.add(sunlight);
    this.transportStretchers = new TransportStretcherModels();
    this.medicineBottles = new MedicineBottleModels();
    const environment = createCenter3DEnvironment(this.scene);
    this.room = new CenterRoomModel(this.scene, environment.room);
    this.healingMachines = new HealingMachineModels(this.scene, environment.healingMachines);
    this.entranceDoor = new EntranceDoorModel(this.scene);
    this.centerSign = new CenterSignModel(this.scene);
    this.pcTerminal = new PcTerminalModel(this.scene);
    this.medicineDisposal = new MedicineDisposalModel(this.scene);
    this.medicineTable = new MedicineTableModel(this.scene, environment.medicineTable);
    this.receptionCounter = new ReceptionCounterModel(this.scene, environment.receptionCounter);
    this.waitingBenches = new WaitingBenchesModel(this.scene, environment.waitingBenches);
    this.recoveryArea = new RecoveryAreaModel(this.scene, environment.recoveryArea);
    const camera = cameraPosition();
    this.camera.position.set(camera.x, camera.y, camera.z);
    this.camera.lookAt(0, 0.65, 0);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.31, 0.46, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe17c, side: THREE.DoubleSide,
        transparent: true, opacity: 0.9, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.render();
  }

  setManifest(manifest: SpriteManifest | null, images: Map<string, CanvasImageSource>): void {
    this.manifest = manifest;
    this.images.clear();
    for (const [path, image] of images) this.images.set(path, image);
  }

  syncCharacters(entities: Center3DCharacter[], timeMs: number): void {
    this.entranceDoor.update(entities.filter((entity) => entity.faintProgress === undefined &&
      (entity.isPlayer || !entity.carried))
      .map((entity) => entity.point), timeMs);
    const present = new Set<string>();
    for (const entity of entities) {
      present.add(entity.id);
      let visual = this.characters.get(entity.id);
      if (!visual) {
        visual = this.createCharacter(entity);
        this.characters.set(entity.id, visual);
      }
      const position = worldPosition(entity.point);
      visual.sprite.position.set(position.x, entity.elevation - visual.footOffset, position.z);
      visual.sprite.renderOrder = characterRenderOrder(entity.point, entity.carried);
      visual.shadow.position.set(position.x, 0.035, position.z);
      visual.shadow.visible = entity.elevation < 0.1;
      visual.locator.position.set(position.x, 0.05, position.z);
      visual.locator.visible = entity.isPlayer;
      visual.stretcher.visible = entity.carried;
      visual.stretcher.position.set(position.x, TRANSPORT_STRETCHER_ELEVATION, position.z);
      this.drawCharacter(visual, entity, timeMs);
      const motion = visual.transportMotion.update(entity.point, entity.carried, timeMs);
      visual.stretcher.position.y += motion.lift;
      visual.stretcher.rotation.z = motion.roll;
      const distress = patientDistress(entity.patienceRatio ?? 1, timeMs, entity.faintProgress);
      visual.sprite.rotation.z = motion.roll + (entity.carried ? 0 : distress.roll);
      visual.sprite.material.color.setHex(distress.tint);
      visual.sprite.material.opacity = distress.opacity;
      // Rotate the mattress contact point too, after sprite frame padding is updated.
      const contactHeight = entity.carried ? entity.elevation - TRANSPORT_STRETCHER_ELEVATION : 0;
      visual.sprite.position.set(position.x - contactHeight * Math.sin(motion.roll),
        entity.elevation + motion.lift + contactHeight * (Math.cos(motion.roll) - 1), position.z);
      const padding = new THREE.Vector3(0, visual.footOffset, 0).applyQuaternion(visual.sprite.quaternion);
      visual.sprite.position.sub(padding);
      if (!entity.carried) visual.sprite.position.y -= distress.drop;
    }
    for (const [id, visual] of this.characters) {
      if (present.has(id)) continue;
      this.scene.remove(visual.sprite, visual.shadow, visual.locator, visual.stretcher);
      visual.sprite.geometry.dispose();
      visual.sprite.material.dispose();
      visual.texture.dispose();
      visual.shadow.geometry.dispose();
      (visual.shadow.material as THREE.Material).dispose();
      visual.locator.geometry.dispose();
      (visual.locator.material as THREE.Material).dispose();
      this.transportStretchers.release(visual.stretcher);
      this.characters.delete(id);
    }
  }

  syncMedicines(doses: MedicineDoseRecord[], carriers: Map<string, Point>, timeMs = 0): void {
    const present = new Set<string>();
    for (const id of this.discardedMedicines) {
      if (!doses.some((dose) => dose.id === id)) this.discardedMedicines.delete(id);
    }
    for (const dose of doses) {
      if (this.discardedMedicines.has(dose.id)) continue;
      const point = dose.location === 'surface' ? MEDICINE_SURFACE_POINTS[dose.slotIndex] :
        carriers.get(dose.carrierId);
      if (!point) continue;
      present.add(dose.id);
      let group = this.medicines.get(dose.id);
      if (group && group.userData.medicineKind !== dose.kind) {
        this.medicineBottles.release(group);
        group = undefined;
      }
      if (!group) {
        group = this.medicineBottles.create(dose.kind);
        this.scene.add(group);
        this.medicines.set(dose.id, group);
      }
      const position = worldPosition(point);
      group.position.set(position.x, dose.location === 'carrier' ?
        MEDICINE_BOTTLE_CARRIED_HEIGHT : MEDICINE_BOTTLE_SURFACE_HEIGHT, position.z);
      const motion = this.medicineBottles.motion(group, point,
        dose.location === 'carrier' ? dose.carrierId : '', timeMs);
      group.position.y += motion.lift;
      group.rotation.z = motion.roll;
    }
    for (const [id, group] of this.medicines) {
      if (present.has(id)) continue;
      this.medicineBottles.release(group);
      this.medicines.delete(id);
    }
  }

  showMedicineDiscard(event: MedicineDiscardEvent): void {
    this.discardedMedicines.add(event.doseId);
    const held = this.medicines.get(event.doseId);
    if (held) {
      this.medicineBottles.release(held);
      this.medicines.delete(event.doseId);
    }
    this.medicineDisposal.play(event.kind, this.medicineBottles);
  }

  clearMedicineDiscards(): void {
    this.discardedMedicines.clear();
    this.medicineDisposal.clearEffects();
  }

  setTarget(point: Point | null): void {
    this.marker.visible = Boolean(point);
    if (point) {
      const position = worldPosition(point);
      this.marker.position.set(position.x, 0.055, position.z);
    }
  }

  project(point: Point, elevation = 0): Point {
    const position = worldPosition(point);
    const projected = new THREE.Vector3(position.x, elevation, position.z).project(this.camera);
    return { x: (projected.x + 1) * 480, y: (1 - projected.y) * 270 };
  }

  render(timeMs = 0, machineStatus: HealingMachineSnapshot['status'] | readonly HealingMachineSnapshot['status'][] = 'empty',
    medicineOwners: readonly string[] = [], patients: readonly PatientRecord[] = []): void {
    this.healingMachines.update(machineStatus, timeMs);
    this.medicineTable.update(medicineOwners, timeMs);
    this.medicineDisposal.update(timeMs);
    this.centerSign.update(timeMs);
    this.pcTerminal.update(timeMs);
    this.receptionCounter.update(patients, timeMs);
    this.waitingBenches.update(patients, timeMs);
    this.recoveryArea.update(patients, timeMs);
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    this.stopObservingSize();
    this.room.dispose();
    this.healingMachines.dispose();
    this.medicineTable.dispose();
    this.medicineDisposal.dispose();
    this.entranceDoor.dispose();
    this.centerSign.dispose();
    this.pcTerminal.dispose();
    this.receptionCounter.dispose();
    this.waitingBenches.dispose();
    this.recoveryArea.dispose();
    this.syncCharacters([], 0);
    this.transportStretchers.dispose();
    this.syncMedicines([], new Map());
    this.medicineBottles.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments ||
        object instanceof THREE.Sprite)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }

  private createCharacter(entity: Center3DCharacter): CharacterSprite {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const sprite = createUprightCharacterPlane(texture,
      Math.atan2(this.camera.position.x, this.camera.position.z));
    this.scene.add(sprite);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12),
      new THREE.MeshBasicMaterial({ color: 0x26364f, transparent: true, opacity: 0.27,
        depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(shadow);
    const locator = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd674, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85, depthWrite: false }));
    locator.rotation.x = -Math.PI / 2;
    locator.scale.set(PLAYER_HALF_WIDTH / WORLD_SCALE, PLAYER_HALF_HEIGHT / WORLD_SCALE, 1);
    locator.renderOrder = 1;
    this.scene.add(locator);
    const stretcher = this.transportStretchers.create();
    this.scene.add(stretcher);
    const visual = { sprite, texture, canvas, shadow, locator, stretcher,
      transportMotion: new TransportStretcherMotion(),
      frameKey: '', footOffset: 0 };
    this.drawFallback(visual, entity.species);
    return visual;
  }

  private drawFallback(visual: CharacterSprite, species: string): void {
    this.resizeCharacterTexture(visual, 48, 48);
    const context = visual.canvas.getContext('2d')!;
    context.clearRect(0, 0, visual.canvas.width, visual.canvas.height);
    context.fillStyle = '#4f98a7';
    context.fillRect(7, 8, 34, 38);
    context.fillStyle = '#fff2d5';
    context.font = 'bold 23px monospace';
    context.textAlign = 'center';
    context.fillText(species.charAt(0), 24, 36);
    visual.sprite.scale.set(2.5, 2.5, 1);
    visual.footOffset = 0;
    visual.texture.needsUpdate = true;
  }

  private drawCharacter(visual: CharacterSprite, entity: Center3DCharacter, timeMs: number): void {
    const species = this.manifest?.species.find((entry) => entry.name === entity.species);
    const animation = this.pickAnimation(species, entity.moving);
    const image = animation && this.images.get(animation.image);
    if (!animation || !image) {
      if (visual.frameKey !== `${entity.species}:fallback`) {
        this.drawFallback(visual, entity.species);
        visual.frameKey = `${entity.species}:fallback`;
      }
      return;
    }
    const frame = this.frameAtTime(animation, timeMs);
    const row = animationRow(entity.facing, animation.directions);
    const key = `${animation.image}:${row}:${frame}`;
    if (visual.frameKey === key) return;
    this.resizeCharacterTexture(visual, animation.frameWidth, animation.frameHeight);
    const context = visual.canvas.getContext('2d')!;
    context.clearRect(0, 0, animation.frameWidth, animation.frameHeight);
    context.drawImage(image, frame * animation.frameWidth,
      row * animation.frameHeight, animation.frameWidth, animation.frameHeight,
      0, 0, animation.frameWidth, animation.frameHeight);
    const pixels = context.getImageData(0, 0, animation.frameWidth, animation.frameHeight).data;
    visual.footOffset = visibleBottomPadding(pixels, animation.frameWidth,
      animation.frameHeight) * PMD_WORLD_SCALE;
    visual.sprite.position.y = entity.elevation - visual.footOffset;
    const size = spriteWorldSize(animation.frameWidth, animation.frameHeight);
    visual.sprite.scale.set(size.width, size.height, 1);
    visual.texture.needsUpdate = true;
    visual.frameKey = key;
  }

  private resizeCharacterTexture(visual: CharacterSprite, width: number, height: number): void {
    if (visual.canvas.width === width && visual.canvas.height === height) return;
    visual.canvas.width = width;
    visual.canvas.height = height;
    const previous = visual.texture;
    visual.texture = new THREE.CanvasTexture(visual.canvas);
    visual.texture.colorSpace = THREE.SRGBColorSpace;
    visual.texture.magFilter = THREE.NearestFilter;
    visual.texture.minFilter = THREE.NearestFilter;
    visual.sprite.material.map = visual.texture;
    visual.sprite.material.needsUpdate = true;
    previous.dispose();
  }

  private pickAnimation(species: SpeciesSprite | undefined, moving: boolean): SpriteAnimation | undefined {
    return moving && species?.walk && this.images.has(species.walk.image) ? species.walk : species?.idle;
  }

  private frameAtTime(animation: SpriteAnimation, timeMs: number): number {
    const durations = animation.durations.map((duration) => duration * 1000 / 60);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    let elapsed = timeMs % total;
    for (const [index, duration] of durations.entries()) {
      if (elapsed < duration) return index;
      elapsed -= duration;
    }
    return 0;
  }
}
