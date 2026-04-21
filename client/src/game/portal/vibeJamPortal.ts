import * as THREE from "three";
import { BREACH_ROOM_D, BREACH_ROOM_H, BREACH_ROOM_W, PLAYER_RADIUS } from "../../../../shared/constants";
import { computeBreachSpawnPosition } from "../../player/playerSpawn";
import { parsePortalParams, type PortalParams } from "./parsePortalParams";

const OUTBOUND_URL = "https://vibej.am/portal/2026";
const PORTAL_SIZE = { width: 2, height: 3, depth: 0.35 };
const TRIGGER_DEPTH = 1.2;
const DEFAULT_ARRIVAL_CENTER = new THREE.Vector3(0, 0, -23);

export const PORTAL_ARRIVAL_SPAWN = new THREE.Vector3(
  computeBreachSpawnPosition(DEFAULT_ARRIVAL_CENTER, "z", 1).x,
  computeBreachSpawnPosition(DEFAULT_ARRIVAL_CENTER, "z", 1).y,
  computeBreachSpawnPosition(DEFAULT_ARRIVAL_CENTER, "z", 1).z,
);

interface PortalTrigger {
  box: THREE.Box3;
  group: THREE.Group;
  targetUrl: string;
  type: "return" | "outbound";
}

let cachedParams: PortalParams | null = null;
let sceneRef: THREE.Scene | null = null;
let redirected = false;
let arrivalSpawnConfigured = false;
let arrivalOpenAxis: "x" | "y" | "z" = "z";
let arrivalOpenSign: 1 | -1 = 1;
let arrivalCenter = DEFAULT_ARRIVAL_CENTER.clone();
let outboundTransform:
  | { center: THREE.Vector3; openAxis: "x" | "y" | "z"; openSign: 1 | -1 }
  | null = null;
const triggers: PortalTrigger[] = [];

export function getPortalParams(): PortalParams {
  cachedParams ??= parsePortalParams();
  return cachedParams;
}

export function isPortalArrival(): boolean {
  return getPortalParams().portal === true;
}

export function configurePortalArrivalSpawn(
  center: THREE.Vector3,
  openAxis: "x" | "y" | "z",
  openSign: 1 | -1,
): void {
  const spawn = computeBreachSpawnPosition(center, openAxis, openSign);
  PORTAL_ARRIVAL_SPAWN.set(spawn.x, spawn.y, spawn.z);
  arrivalCenter = center.clone();
  arrivalOpenAxis = openAxis;
  arrivalOpenSign = openSign;
  arrivalSpawnConfigured = true;
}

export function configureOutboundPortal(
  center: THREE.Vector3,
  openAxis: "x" | "y" | "z",
  openSign: 1 | -1,
): void {
  outboundTransform = { center: center.clone(), openAxis, openSign };
}

export function initVibeJamPortal(scene: THREE.Scene, params: PortalParams): void {
  cachedParams = params;
  sceneRef = scene;
  clearTriggers("return");

  if (params.portal !== true) return;

  if (import.meta.env.DEV) {
    console.log("[VibeJam] portal arrival detected, params:", params);
    if (params.ref) console.log("[VibeJam] ref detected:", params.ref);
  }

  if (!params.ref) return;

  const transform = buildReturnPortalTransform();
  const targetUrl = buildRedirectUrl(params.ref, params, false);
  const trigger = createPortal(scene, {
    ...transform,
    color: 0x00d9ff,
    label: "Return Portal",
    targetUrl,
    type: "return",
  });
  triggers.push(trigger);
}

export function addOutboundVibeJamPortal(scene: THREE.Scene, params: PortalParams): void {
  cachedParams = params;
  sceneRef = scene;
  clearTriggers("outbound");

  const transform = buildOutboundPortalTransform();
  const targetUrl = buildRedirectUrl(OUTBOUND_URL, params, true);
  const trigger = createPortal(scene, {
    ...transform,
    color: 0xc050ff,
    label: "Exit to Vibe Jam 2026",
    targetUrl,
    type: "outbound",
  });
  triggers.push(trigger);
}

export function checkPortalCollisions(playerPos: THREE.Vector3): void {
  if (redirected) return;

  for (const trigger of triggers) {
    if (!trigger.box.containsPoint(playerPos)) continue;

    redirected = true;
    if (import.meta.env.DEV && trigger.type === "outbound") {
      console.log("[VibeJam] outbound redirect URL:", trigger.targetUrl);
    }
    window.location.href = trigger.targetUrl;
    return;
  }
}

export function clearVibeJamPortals(): void {
  clearTriggers();
}

function clearTriggers(type?: PortalTrigger["type"]): void {
  for (let i = triggers.length - 1; i >= 0; i--) {
    const trigger = triggers[i];
    if (type && trigger.type !== type) continue;
    sceneRef?.remove(trigger.group);
    disposeObject(trigger.group);
    triggers.splice(i, 1);
  }
}

function buildReturnPortalTransform(): { normal: THREE.Vector3; position: THREE.Vector3 } {
  if (!arrivalSpawnConfigured) {
    return {
      normal: new THREE.Vector3(0, 0, 1),
      position: PORTAL_ARRIVAL_SPAWN.clone().add(new THREE.Vector3(2.5, 1.2, 1.3)),
    };
  }

  const sideAxis: "x" | "z" = arrivalOpenAxis === "x" ? "z" : "x";
  const normal = new THREE.Vector3();
  normal[sideAxis] = -1;

  const position = PORTAL_ARRIVAL_SPAWN.clone();
  position[sideAxis] = arrivalCenter[sideAxis] + BREACH_ROOM_W / 2 - 0.08;
  position[arrivalOpenAxis] += arrivalOpenSign * 1.2;
  position.y = arrivalCenter.y + 0.2;

  return { normal, position };
}

function buildOutboundPortalTransform(): { normal: THREE.Vector3; position: THREE.Vector3 } {
  const transform = outboundTransform ?? {
    center: new THREE.Vector3(0, 0, 23),
    openAxis: "z" as const,
    openSign: -1 as const,
  };

  const { center, openAxis, openSign } = transform;
  const normal = new THREE.Vector3();
  normal[openAxis] = openSign;

  const position = center.clone();
  position[openAxis] = center[openAxis] - openSign * (BREACH_ROOM_D / 2 - 0.08);
  position.y = center.y + 0.2;
  return { normal, position };
}

function createPortal(
  scene: THREE.Scene,
  options: {
    color: number;
    label: string;
    normal: THREE.Vector3;
    position: THREE.Vector3;
    targetUrl: string;
    type: PortalTrigger["type"];
  },
): PortalTrigger {
  const group = new THREE.Group();
  group.position.copy(options.position);
  group.quaternion.copy(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), options.normal.clone().normalize()),
  );

  const material = new THREE.MeshBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const panelMaterial = new THREE.MeshBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  });

  const thickness = 0.12;
  const halfW = PORTAL_SIZE.width / 2;
  const halfH = PORTAL_SIZE.height / 2;
  const bars = [
    { size: [PORTAL_SIZE.width + thickness * 2, thickness, thickness], pos: [0, halfH, 0] },
    { size: [PORTAL_SIZE.width + thickness * 2, thickness, thickness], pos: [0, -halfH, 0] },
    { size: [thickness, PORTAL_SIZE.height, thickness], pos: [-halfW, 0, 0] },
    { size: [thickness, PORTAL_SIZE.height, thickness], pos: [halfW, 0, 0] },
  ] as const;

  for (const bar of bars) {
    const [width, height, depth] = bar.size;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    const [x, y, z] = bar.pos;
    mesh.position.set(x, y, z);
    group.add(mesh);
  }

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL_SIZE.width, PORTAL_SIZE.height), panelMaterial);
  group.add(panel);

  const label = createLabelSprite(options.label, options.color);
  label.position.set(0, PORTAL_SIZE.height / 2 + 0.55, 0.03);
  group.add(label);

  scene.add(group);

  const triggerCenter = options.position.clone().addScaledVector(options.normal, PLAYER_RADIUS * 0.4);
  const halfSize = new THREE.Vector3(
    PORTAL_SIZE.width / 2 + PLAYER_RADIUS,
    PORTAL_SIZE.height / 2 + PLAYER_RADIUS,
    TRIGGER_DEPTH / 2,
  );
  const box = boxFromOrientedPortal(triggerCenter, options.normal, halfSize);

  return {
    box,
    group,
    targetUrl: options.targetUrl,
    type: options.type,
  };
}

function boxFromOrientedPortal(
  center: THREE.Vector3,
  normal: THREE.Vector3,
  halfSize: THREE.Vector3,
): THREE.Box3 {
  const axis = dominantAxis(normal);
  const min = center.clone();
  const max = center.clone();
  const sideAxis: "x" | "z" = axis === "x" ? "z" : "x";

  min[sideAxis] -= halfSize.x;
  max[sideAxis] += halfSize.x;
  min.y -= halfSize.y;
  max.y += halfSize.y;
  min[axis] -= halfSize.z;
  max[axis] += halfSize.z;

  return new THREE.Box3(min, max);
}

function dominantAxis(v: THREE.Vector3): "x" | "y" | "z" {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= ax && ay >= az) return "y";
  return "z";
}

function createLabelSprite(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    roundRect(ctx, 20, 34, canvas.width - 40, 104, 18);
    ctx.fill();
    ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 52px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, 86);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.8, 0.95, 1);
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function buildRedirectUrl(baseUrl: string, params: PortalParams, includeRef: boolean): string {
  const base = typeof window !== "undefined" ? window.location.origin : "https://example.com";
  const url = new URL(baseUrl, base);
  url.searchParams.set("portal", "true");
  if (includeRef && typeof window !== "undefined") {
    url.searchParams.set("ref", window.location.origin);
  }

  appendString(url, "username", params.username);
  appendString(url, "color", params.color);
  appendString(url, "team", params.team);
  appendNumber(url, "hp", params.hp);
  appendNumber(url, "speed", params.speed);
  appendNumber(url, "speed_x", params.speed_x);
  appendNumber(url, "speed_y", params.speed_y);
  appendNumber(url, "speed_z", params.speed_z);
  appendNumber(url, "rotation_x", params.rotation_x);
  appendNumber(url, "rotation_y", params.rotation_y);
  appendNumber(url, "rotation_z", params.rotation_z);

  return url.toString();
}

function appendString(url: URL, key: string, value: string | undefined): void {
  if (value !== undefined) url.searchParams.set(key, value);
}

function appendNumber(url: URL, key: string, value: number | undefined): void {
  if (value !== undefined && Number.isFinite(value)) url.searchParams.set(key, String(value));
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
    const material = object.material;
    if (Array.isArray(material)) {
      for (const mat of material) disposeMaterial(mat);
    } else {
      disposeMaterial(material);
    }
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  const map = "map" in material ? material.map : null;
  if (map instanceof THREE.Texture) map.dispose();
  material.dispose();
}
