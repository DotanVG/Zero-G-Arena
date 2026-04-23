import * as THREE from "three";
import { BREACH_ROOM_D, BREACH_ROOM_W, PLAYER_RADIUS } from "../../../../shared/constants";
import { computeBreachSpawnPosition } from "../../player/playerSpawn";
import { parsePortalParams, type PortalParams } from "./parsePortalParams";

const OUTBOUND_URL = "https://vibej.am/portal/2026";
const PORTAL_RADIUS = 1.3;
const TRIGGER_DEPTH = 1.2;
const JUMP_VEL_THRESHOLD = 0.2;
const DEFAULT_ARRIVAL_CENTER = new THREE.Vector3(0, 0, -23);

export const PORTAL_ARRIVAL_SPAWN = new THREE.Vector3(
  computeBreachSpawnPosition(DEFAULT_ARRIVAL_CENTER, "z", 1).x,
  computeBreachSpawnPosition(DEFAULT_ARRIVAL_CENTER, "z", 1).y,
  computeBreachSpawnPosition(DEFAULT_ARRIVAL_CENTER, "z", 1).z,
);

interface PortalTrigger {
  box: THREE.Box3;
  group: THREE.Group;
  label: THREE.Mesh;
  shaderMat: THREE.ShaderMaterial;
  targetUrl: string;
  type: "return" | "outbound";
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const PORTAL_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PORTAL_FRAG = /* glsl */`
uniform float time;
varying vec2 vUv;
#define TAU 6.28318530718

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r >= 1.0) discard;
  float a = atan(p.y, p.x);

  // Spinning spiral arms
  float swirl = fract(a / TAU + r * 2.5 - time * 0.45);
  float arms  = pow(abs(sin(swirl * TAU * 4.5)), 2.0);

  // Concentric energy rings
  float rings = smoothstep(0.3, 0.7, sin(r * 20.0 - time * 5.0) * 0.5 + 0.5);

  // Outer neon glow rim
  float glowRim = exp(-pow((r - 0.82) / 0.09, 2.0));

  // Inner core
  float core = exp(-r * r * 6.0) * 0.5;

  float edgeFade = 1.0 - smoothstep(0.80, 1.0, r);
  float voidFade = smoothstep(0.0, 0.25, r);

  float intensity = (arms * rings * 0.6 + glowRim * 1.5 + core) * voidFade;
  intensity = clamp(intensity, 0.0, 1.5);

  // Rick & Morty green/cyan/magenta palette
  vec3 green   = vec3(0.05, 1.0,  0.35);
  vec3 cyan    = vec3(0.0,  0.85, 1.0);
  vec3 magenta = vec3(0.9,  0.1,  0.85);

  float swt = fract(a / TAU + r * 3.0 - time * 0.3);
  vec3 swColor = swt < 0.5
    ? mix(green, cyan,    smoothstep(0.0, 0.5, swt))
    : mix(cyan,  magenta, smoothstep(0.5, 1.0, swt));

  vec3 color = swColor * intensity;
  color += vec3(0.9, 1.0, 0.88) * (glowRim + core) * 0.5;

  float pulse = 0.88 + 0.12 * sin(time * 2.8);
  color *= pulse;

  float alpha = edgeFade * clamp(intensity * 0.8 + 0.35 * voidFade * edgeFade, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}`;

// ── Module state ─────────────────────────────────────────────────────────────

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

// ── Public API ────────────────────────────────────────────────────────────────

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

export function checkPortalCollisions(playerPos: THREE.Vector3, velY: number): void {
  if (redirected) return;
  if (velY < JUMP_VEL_THRESHOLD) return;

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

export function updateVibeJamPortals(cameraPos: THREE.Vector3, dt: number): void {
  for (const trigger of triggers) {
    trigger.shaderMat.uniforms["time"].value += dt;

    // Y-axis-only billboard: rotate label to face camera without tilting into wall
    const dx = cameraPos.x - trigger.label.position.x;
    const dz = cameraPos.z - trigger.label.position.z;
    trigger.label.rotation.y = Math.atan2(dx, dz);
  }
}

export function clearVibeJamPortals(): void {
  clearTriggers();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function clearTriggers(type?: PortalTrigger["type"]): void {
  for (let i = triggers.length - 1; i >= 0; i--) {
    const trigger = triggers[i];
    if (type && trigger.type !== type) continue;
    sceneRef?.remove(trigger.group);
    sceneRef?.remove(trigger.label);
    disposeObject(trigger.group);
    disposeObject(trigger.label);
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
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      options.normal.clone().normalize(),
    ),
  );

  // Animated shader disc
  const shaderMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: PORTAL_VERT,
    fragmentShader: PORTAL_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PORTAL_RADIUS, 64), shaderMat);
  group.add(disc);

  // Neon ring (portal-specific color)
  const ringMat = new THREE.MeshBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(PORTAL_RADIUS, 0.1, 16, 64), ringMat);
  group.add(ring);

  // Outer halo (soft glow)
  const haloMat = new THREE.MeshBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(PORTAL_RADIUS + 0.1, 0.22, 16, 64),
    haloMat,
  );
  group.add(halo);

  scene.add(group);

  // Label lives in world space so we can Y-billboard it independently
  const labelWorldPos = new THREE.Vector3(
    options.position.x,
    options.position.y + PORTAL_RADIUS + 0.65,
    options.position.z,
  );
  const label = createLabelMesh(options.label, options.color, labelWorldPos);
  scene.add(label);

  // Box collider sized to the disc
  const triggerCenter = options.position
    .clone()
    .addScaledVector(options.normal, PLAYER_RADIUS * 0.4);
  const halfSize = new THREE.Vector3(
    PORTAL_RADIUS + PLAYER_RADIUS,
    PORTAL_RADIUS + PLAYER_RADIUS,
    TRIGGER_DEPTH / 2,
  );
  const box = boxFromOrientedPortal(triggerCenter, options.normal, halfSize);

  return { box, group, label, shaderMat, targetUrl: options.targetUrl, type: options.type };
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

function createLabelMesh(text: string, color: number, worldPos: THREE.Vector3): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    roundRect(ctx, 20, 34, canvas.width - 40, 104, 18);
    ctx.fill();
    const hex = `#${color.toString(16).padStart(6, "0")}`;
    ctx.strokeStyle = hex;
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
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.95), mat);
  mesh.position.copy(worldPos);
  return mesh;
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
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (Array.isArray(material)) {
      for (const mat of material) disposeMaterial(mat);
    } else {
      disposeMaterial(material);
    }
    object.geometry.dispose();
  });
}

function disposeMaterial(material: THREE.Material): void {
  const map = "map" in material ? material.map : null;
  if (map instanceof THREE.Texture) map.dispose();
  material.dispose();
}
