import * as THREE from 'three';
import { observeRenderSize } from '../renderResolution.js';
import { parseSpriteManifest } from '../sprites/pmd.js';
import { CAMERA_ELEVATION, CAMERA_HALF_HEIGHT, CAMERA_HALF_WIDTH, CAMERA_YAW,
  CENTER_3D_ROSTER, cameraPosition, orbitFromDrag } from './center3dLayout.js';
import { RecoveryAreaModel } from './recoveryAreaModel.js';
import { WaitingBenchesModel } from './waitingBenchesModel.js';
import { ReceptionCounterModel } from './receptionCounterModel.js';
import { MedicineTableModel } from './medicineTableModel.js';
import { HealingMachineModels } from './healingMachineModels.js';
import { createCenter3DEnvironment } from './center3dEnvironment.js';
import { CenterRoomModel } from './centerRoomModel.js';
import { createUprightCharacterPlane, spriteWorldSize,
  visibleBottomPadding } from './center3dView.js';

const mount = document.querySelector<HTMLElement>('#scene')!;
const status = document.querySelector<HTMLElement>('#status')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#12253d');
const camera = new THREE.OrthographicCamera(-CAMERA_HALF_WIDTH, CAMERA_HALF_WIDTH,
  CAMERA_HALF_HEIGHT, -CAMERA_HALF_HEIGHT, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const characterPlanes: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>> = [];
const stopObservingSize = observeRenderSize(mount, ({ width, height }) => {
  renderer.setSize(width, height, false);
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.append(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.55));
const sunlight = new THREE.DirectionalLight(0xffdfb1, 2.2);
sunlight.position.set(-6, 13, 9);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.left = -14;
sunlight.shadow.camera.right = 14;
sunlight.shadow.camera.top = 14;
sunlight.shadow.camera.bottom = -14;
sunlight.shadow.bias = -0.0005;
scene.add(sunlight);

interface PreviewSpriteTexture {
  texture: THREE.CanvasTexture;
  footOffset: number;
}

function textureFromFrame(canvas: HTMLCanvasElement): PreviewSpriteTexture {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  const footOffset = visibleBottomPadding(pixels, canvas.width,
    canvas.height) * spriteWorldSize(1, 1).height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return { texture, footOffset };
}

function fallbackSprite(name: string): PreviewSpriteTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 40;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#4f98a7';
  context.fillRect(5, 9, 22, 28);
  context.fillStyle = '#fff2d5';
  context.font = 'bold 17px monospace';
  context.textAlign = 'center';
  context.fillText(name.charAt(0), 16, 30);
  return textureFromFrame(canvas);
}

async function spriteTexture(imagePath: string, frameWidth: number,
  frameHeight: number): Promise<PreviewSpriteTexture> {
  const image = new Image();
  image.src = `/assets/external/pmd/${imagePath}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
  return textureFromFrame(canvas);
}

function placeSprite(texture: THREE.Texture, width: number, height: number,
  x: number, y: number, z: number, footOffset: number): void {
  const sprite = createUprightCharacterPlane(texture,
    Math.atan2(camera.position.x, camera.position.z));
  const size = spriteWorldSize(width, height);
  sprite.scale.set(size.width, size.height, 1);
  sprite.position.set(x, y - footOffset, z);
  scene.add(sprite);
  characterPlanes.push(sprite);
  if (y < 0.1) {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12),
      new THREE.MeshBasicMaterial({ color: 0x26364f, transparent: true, opacity: 0.24,
        depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, 0.03, z);
    scene.add(shadow);
  }
}

async function addPmdSprites(): Promise<void> {
  let manifest;
  try {
    const response = await fetch('/assets/external/pmd/manifest.json');
    if (!response.ok) throw new Error('Local PMD cache unavailable');
    manifest = parseSpriteManifest(await response.json());
  } catch {
    manifest = null;
  }
  let loaded = 0;
  for (const { name, point, elevation } of CENTER_3D_ROSTER) {
    const species = manifest?.species.find((entry) => entry.name === name);
    let { texture, footOffset } = fallbackSprite(name);
    let width = 32;
    let height = 40;
    if (species?.idle) {
      try {
        ({ texture, footOffset } = await spriteTexture(species.idle.image,
          species.idle.frameWidth, species.idle.frameHeight));
        width = species.idle.frameWidth;
        height = species.idle.frameHeight;
        loaded += 1;
      } catch {
        // A missing local sheet only affects this preview sprite.
      }
    }
    placeSprite(texture, width, height, point.x, elevation, point.z, footOffset);
  }
  status.textContent = loaded === CENTER_3D_ROSTER.length ?
    '3D scene + 10 local PMD sprites' :
    `3D scene · ${loaded}/${CENTER_3D_ROSTER.length} local PMD sprites`;
}

const environment = createCenter3DEnvironment(scene);
const room = new CenterRoomModel(scene, environment.room);
const healingMachines = new HealingMachineModels(scene, environment.healingMachines);
const medicineTable = new MedicineTableModel(scene, environment.medicineTable);
const receptionCounter = new ReceptionCounterModel(scene, environment.receptionCounter);
const waitingBenches = new WaitingBenchesModel(scene, environment.waitingBenches);
const recoveryArea = new RecoveryAreaModel(scene, environment.recoveryArea);
window.addEventListener('beforeunload', () => {
  stopObservingSize();
  room.dispose();
  healingMachines.dispose();
  medicineTable.dispose();
  receptionCounter.dispose();
  waitingBenches.dispose();
  recoveryArea.dispose();
}, { once: true });
void addPmdSprites();

let yaw = CAMERA_YAW;
let elevation = CAMERA_ELEVATION;
let pointerX: number | null = null;
let pointerY: number | null = null;
function updateCamera(): void {
  const position = cameraPosition(yaw, elevation);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(0, 0.65, 0);
  for (const plane of characterPlanes) plane.rotation.y = yaw;
}
updateCamera();
renderer.domElement.addEventListener('pointerdown', (event) => {
  renderer.domElement.setPointerCapture(event.pointerId);
  pointerX = event.clientX;
  pointerY = event.clientY;
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (pointerX === null || pointerY === null) return;
  ({ yaw, elevation } = orbitFromDrag(yaw, elevation,
    event.clientX - pointerX, event.clientY - pointerY));
  pointerX = event.clientX;
  pointerY = event.clientY;
  updateCamera();
});
renderer.domElement.addEventListener('pointerup', () => { pointerX = null; pointerY = null; });
renderer.domElement.addEventListener('pointercancel', () => { pointerX = null; pointerY = null; });

function render(): void {
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
