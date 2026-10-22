import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LOBBY_PLANTS, PC_CORNER_BOUNDS, WALK_BOUNDS, WAITING_BENCH_OBSTACLE_INDICES, WAITING_SEATS_PER_BENCH } from '@pokecenter/shared';
import { ENTRANCE_3D_POSITION, ENTRANCE_3D_WIDTH, CENTER_3D_FOOTPRINTS, RECEPTION_3D_SLOTS, WAITING_3D_SLOTS,
  type WorldFootprint, worldFootprint, worldPosition } from './center3dLayout.js';

const colors = {
  base: 0x263d49, wall: 0x4e8588, wallLight: 0x76afb0,
  cream: 0xfff4df, coral: 0xe88070, coralLight: 0xffb698,
  teal: 0x408e94, tealLight: 0x9cdddd, aqua: 0x68c9c2,
  wood: 0xa97964, lavender: 0xb7a5cf, green: 0x9bc891, gold: 0xf4cd78,
} as const;

export function fitsStationFootprint(footprint: WorldFootprint, x: number, z: number,
  width: number, depth: number): boolean {
  const epsilon = 0.00001;
  return x - width / 2 >= footprint.x - footprint.width / 2 - epsilon &&
    x + width / 2 <= footprint.x + footprint.width / 2 + epsilon &&
    z - depth / 2 >= footprint.z - footprint.depth / 2 - epsilon &&
    z + depth / 2 <= footprint.z + footprint.depth / 2 + epsilon;
}

export interface Center3DEnvironment {
  room: THREE.Group;
  healingMachines: THREE.Group[];
  medicineTable: THREE.Group;
  receptionCounter: THREE.Group;
  waitingBenches: THREE.Group;
  recoveryArea: THREE.Group;
}

export function createCenter3DEnvironment(scene: THREE.Scene): Center3DEnvironment {
  function shape(x: number, y: number, z: number, width: number, height: number,
    depth: number, color: number, radius = 0.08): THREE.Mesh {
    const geometry = new RoundedBoxGeometry(width, height, depth, 1,
      Math.min(radius, width / 2, height / 2, depth / 2));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    mesh.castShadow = height > 0.2;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function stationShape(index: number, x: number, y: number, z: number, width: number,
    height: number, depth: number, color: number, radius = 0.08): THREE.Mesh {
    if (!fitsStationFootprint(CENTER_3D_FOOTPRINTS[index]!, x, z, width, depth)) {
      throw new Error(`Station ${index} geometry exceeds its collision footprint at ${x},${z}`);
    }
    return shape(x, y, z, width, height, depth, color, radius);
  }

  function disk(x: number, y: number, z: number, radius: number, height: number,
    color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8),
      new THREE.MeshLambertMaterial({ color, flatShading: true }));
    mesh.position.set(x, y, z);
    mesh.castShadow = height > 0.2;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function stationDisk(index: number, x: number, y: number, z: number, radius: number,
    height: number, color: number): THREE.Mesh {
    if (!fitsStationFootprint(CENTER_3D_FOOTPRINTS[index]!, x, z,
      radius * 2, radius * 2)) {
      throw new Error(`Station ${index} decoration exceeds its collision footprint`);
    }
    return disk(x, y, z, radius, height, color);
  }

  function floorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 352;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e2d8c4';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < 11; row += 1) {
      for (let column = 0; column < 20; column += 1) {
        context.fillStyle = (row + column) % 4 === 0 ? '#f7e9d2' : '#f2e5cc';
        context.fillRect(column * 32 + 1, row * 32 + 1, 31, 31);
        if ((row * 7 + column * 3) % 13 === 0) {
          context.fillStyle = '#e4d6bd';
          context.fillRect(column * 32 + 5, row * 32 + 5, 4, 4);
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  }

  function addRoom(): THREE.Group {
    const firstChild = scene.children.length;
    const left = worldPosition({ x: WALK_BOUNDS.left, y: 270 }).x;
    const right = worldPosition({ x: WALK_BOUNDS.right, y: 270 }).x;
    const back = worldPosition({ x: 480, y: WALK_BOUNDS.top }).z;
    const front = worldPosition({ x: 480, y: WALK_BOUNDS.bottom }).z;
    const width = right - left;
    const depth = front - back;
    const centerZ = (back + front) / 2;
    shape(0, -0.2, centerZ, width + 0.34, 0.4, depth + 0.34, colors.base);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
      new THREE.MeshLambertMaterial({ map: floorTexture() }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.012, centerZ);
    floor.receiveShadow = true;
    scene.add(floor);
    shape(0, 1.18, back - 0.1, width + 0.22, 2.36, 0.21, colors.wall, 0.07);
    shape(0, 2.28, back + 0.04, width - 0.25, 0.12, 0.12, colors.wallLight, 0.04);
    for (const side of [-1, 1]) {
      shape(side * (width / 2 + 0.08), 0.74, centerZ, 0.21, 1.48,
        depth + 0.14, colors.wall, 0.06);
      shape(side * (width / 2 - 0.03), 0.13, centerZ, 0.1, 0.21,
        depth - 0.2, colors.wallLight, 0.03);
    }
    const trimWidth = (width - ENTRANCE_3D_WIDTH) / 2;
    for (const side of [-1, 1]) {
      shape(side * (ENTRANCE_3D_WIDTH + trimWidth) / 2, 0.045, front + 0.02,
        trimWidth, 0.09, 0.11, colors.gold, 0.025);
    }
    const step = shape(ENTRANCE_3D_POSITION.x, -0.1, ENTRANCE_3D_POSITION.z,
      ENTRANCE_3D_WIDTH, 0.2, 0.8, colors.base, 0.025);
    step.name = 'EntranceStep';
    for (const x of [-5.15, 5.15]) {
      shape(x, 1.52, back + 0.06, 2.46, 1.31, 0.08, colors.cream, 0.04);
      shape(x, 1.52, back + 0.12, 2.2, 1.05, 0.05, colors.tealLight, 0.02);
    }
    const desk = worldFootprint(PC_CORNER_BOUNDS);
    shape(desk.x, 0.38, desk.z, desk.width - 0.06, 0.76, desk.depth - 0.12, colors.cream);
    shape(desk.x, 0.8, desk.z, desk.width, 0.08, desk.depth, colors.wood, 0.035);
    for (const planter of LOBBY_PLANTS.map(worldFootprint)) {
      disk(planter.x, 0.45, planter.z, 0.5, 0.9, colors.coral);
      disk(planter.x, 1.2, planter.z, 0.55, 0.6, colors.green);
    }
    const room = new THREE.Group();
    room.name = 'CenterRoomFallback';
    room.add(...scene.children.slice(firstChild));
    scene.add(room);
    return room;
  }

  function addReception(): THREE.Group {
    const firstChild = scene.children.length;
    const counter = CENTER_3D_FOOTPRINTS[0]!;
    stationShape(0, counter.x, 0.38, counter.z, counter.width, 0.76,
      counter.depth, colors.wood, 0.13);
    stationShape(0, counter.x, 0.79, counter.z, counter.width, 0.1,
      counter.depth, colors.coral, 0.045);
    stationShape(0, counter.x, 0.19, counter.z + counter.depth / 2 - 0.055,
      counter.width - 0.18, 0.12, 0.1, colors.coralLight, 0.03);
    for (const [index, slot] of RECEPTION_3D_SLOTS.entries()) {
      stationShape(0, slot.x, 0.85, slot.z, 1.25, 0.1, 0.7,
        index === 3 ? colors.green : colors.cream, 0.05);
      stationShape(0, slot.x, 0.91, slot.z - 0.29, 0.61, 0.04, 0.13,
        index === 3 ? colors.gold : colors.tealLight, 0.02);
      stationDisk(0, slot.x, 0.915, slot.z + 0.22, 0.09, 0.03, colors.coral);
    }
    const group = new THREE.Group();
    group.name = 'ReceptionCounterFallback';
    group.add(...scene.children.slice(firstChild));
    scene.add(group);
    return group;
  }

  function addHealingMachine(index: number): THREE.Group {
    const firstChild = scene.children.length;
    const station = CENTER_3D_FOOTPRINTS[index]!;
    stationShape(index, station.x, 0.12, station.z, station.width, 0.24,
      station.depth, colors.base, 0.1);
    stationShape(index, station.x, 0.33, station.z - 0.08, station.width - 0.17,
      0.3, station.depth - 0.22, colors.teal, 0.12);
    stationShape(index, station.x, 0.54, station.z + 0.12, station.width - 0.47,
      0.15, station.depth - 0.56, colors.cream, 0.07);
    stationShape(index, station.x, 0.63, station.z - 0.54, station.width - 0.61,
      0.06, 0.26, colors.aqua, 0.025);
    stationShape(index, station.x, 0.62, station.z + 0.67, station.width - 0.6,
      0.09, 0.25, colors.tealLight, 0.04);
    for (const side of [-1, 1]) {
      stationShape(index, station.x + side * (station.width / 2 - 0.11),
        0.4, station.z, 0.16, 0.26, station.depth - 0.5, colors.aqua, 0.05);
    }
    const light = new THREE.PointLight(colors.aqua, 1.25, 3.1);
    light.position.set(station.x, 0.8, station.z);
    scene.add(light);
    const group = new THREE.Group();
    group.name = `HealingMachineFallback${index}`;
    group.add(...scene.children.slice(firstChild));
    scene.add(group);
    return group;
  }

  function addMedicine(): THREE.Group {
    const firstChild = scene.children.length;
    const table = CENTER_3D_FOOTPRINTS[3]!;
    stationShape(3, table.x, 0.24, table.z, table.width, 0.48,
      table.depth, colors.wood, 0.13);
    stationShape(3, table.x, 0.52, table.z, table.width, 0.09,
      table.depth, colors.cream, 0.04);
    for (const side of [-1, 1]) {
      stationShape(3, table.x + side * 1.38, 0.58, table.z + 0.21,
        2.37, 0.04, 1.15, side < 0 ? colors.coral : colors.lavender, 0.02);
      for (const offset of [-0.6, 0, 0.6]) {
        stationDisk(3, table.x + side * 1.38 + offset, 0.72, table.z - 0.35,
          0.12, 0.23, side < 0 ? colors.coralLight : colors.lavender);
      }
    }
    stationShape(3, table.x, 0.34, table.z + table.depth / 2 - 0.065,
      table.width - 0.2, 0.08, 0.09, colors.base, 0.025);
    const group = new THREE.Group();
    group.name = 'MedicineTableFallback';
    group.add(...scene.children.slice(firstChild));
    scene.add(group);
    return group;
  }

  function addWaitingBenches(): THREE.Group {
    const firstChild = scene.children.length;
    for (const [bench, obstacleIndex] of WAITING_BENCH_OBSTACLE_INDICES.entries()) {
      const waiting = CENTER_3D_FOOTPRINTS[obstacleIndex]!;
      stationShape(obstacleIndex, waiting.x, 0.17, waiting.z, waiting.width, 0.34,
        waiting.depth, colors.base, 0.1);
      stationShape(obstacleIndex, waiting.x, 0.37, waiting.z, waiting.width - 0.17, 0.1,
        waiting.depth - 0.16, colors.lavender, 0.05);
      for (const slot of WAITING_3D_SLOTS.slice(bench * WAITING_SEATS_PER_BENCH,
        (bench + 1) * WAITING_SEATS_PER_BENCH)) {
        stationShape(obstacleIndex, slot.x, 0.45, slot.z, 0.92, 0.07, 0.87,
          colors.cream, 0.035);
        stationShape(obstacleIndex, slot.x, 0.5, slot.z - 0.29, 0.66, 0.06, 0.2,
          colors.tealLight, 0.025);
      }
    }
    const group = new THREE.Group();
    group.name = 'WaitingBenchesFallback';
    group.add(...scene.children.slice(firstChild));
    scene.add(group);
    return group;
  }

  function addRecovery(): THREE.Group {
    const firstChild = scene.children.length;
    const recovery = CENTER_3D_FOOTPRINTS[5]!;
    stationShape(5, recovery.x, 0.18, recovery.z, recovery.width, 0.36,
      recovery.depth, colors.base, 0.1);
    stationShape(5, recovery.x, 0.41, recovery.z, recovery.width - 0.19,
      0.12, recovery.depth - 0.16, colors.green, 0.06);
    stationShape(5, recovery.x, 0.51, recovery.z, 2.45, 0.1,
      recovery.depth - 0.42, colors.cream, 0.05);
    stationShape(5, recovery.x - 0.89, 0.58, recovery.z - 0.35,
      0.48, 0.07, 0.22, colors.tealLight, 0.025);
    const group = new THREE.Group();
    group.name = 'RecoveryAreaFallback';
    group.add(...scene.children.slice(firstChild));
    scene.add(group);
    return group;
  }

  const room = addRoom();
  const receptionCounter = addReception();
  const healingMachines = [addHealingMachine(1), addHealingMachine(2)];
  const medicineTable = addMedicine();
  const waitingBenches = addWaitingBenches();
  const recoveryArea = addRecovery();
  return { room, healingMachines, medicineTable, receptionCounter, waitingBenches, recoveryArea };
}
