import * as THREE from "three";
import { BREACH_ROOM_D, BREACH_ROOM_H, BREACH_ROOM_W, PLAYER_RADIUS } from "../../../../shared/constants";
import { computeBreachSpawnPosition } from "../../player/playerSpawn";
import { parsePortalParams, type PortalParams } from "./parsePortalParams";

const OUTBOUND_URL = "https://vibej.am/portal/2026";
const PORTAL_SIZE = { width: 2.3, height: 3.25, depth: 0.35 };
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
  animation: PortalAnimationState;
}

interface PortalAnimationState {
  core: THREE.Mesh;
  halo: THREE.Mesh;
  rim: THREE.Mesh;
  rimBasePositions: Float32Array;
  rimVertexPulse: Float32Array;
  sparks: THREE.Points;
  basePositions: Float32Array;
  phase: number;
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
    color: 0x79ff51,
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
    color: 0x64ff44,
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

export function updateVibeJamPortals(dt: number, elapsedSeconds: number): void {
  if (triggers.length === 0) return;

  for (let i = 0; i < triggers.length; i += 1) {
    const trigger = triggers[i];
    animatePortal(trigger.animation, dt, elapsedSeconds + i * 0.27);
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

  const core = createPortalCore(options.color);
  core.renderOrder = 1;
  group.add(core);

  const halo = createPortalHalo(options.color);
  halo.renderOrder = 2;
  halo.position.z = 0.02;
  group.add(halo);

  const rim = createOrganicRim(options.color);
  rim.renderOrder = 3;
  rim.position.z = 0.04;
  group.add(rim);

  const sparks = createSparkPoints();
  sparks.renderOrder = 4;
  group.add(sparks);

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
    animation: {
      core,
      halo,
      rim,
      rimBasePositions: (rim.geometry.getAttribute("position").array as Float32Array).slice(),
      rimVertexPulse: buildRimPulseOffsets(rim.geometry.getAttribute("position").count),
      sparks,
      basePositions: (sparks.geometry.getAttribute("position").array as Float32Array).slice(),
      phase: Math.random() * Math.PI * 2,
    },
  };
}

function createPortalCore(color: number): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(1, 100);
  geometry.scale(PORTAL_SIZE.width * 0.46, PORTAL_SIZE.height * 0.45, 1);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      tint: { value: new THREE.Color(color) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform vec3 tint;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
        vec2 p = vUv - 0.5;
        p.x *= 0.78;
        float r = length(p);
        if (r > 0.5) discard;

        float a = atan(p.y, p.x);
        float swirl = sin(a * 6.0 + time * 2.1 + r * 16.0) * 0.5 + 0.5;
        float cloud = noise(p * 9.0 + vec2(time * 0.75, -time * 0.4));
        float goo = smoothstep(0.15, 0.95, mix(swirl, cloud, 0.55));
        float edgeFade = smoothstep(0.5, 0.08, r);
        vec3 color = mix(vec3(0.14, 0.45, 0.08), tint, goo);
        color += vec3(0.4, 0.95, 0.35) * pow(1.0 - r * 1.85, 2.0);
        float alpha = edgeFade * (0.45 + goo * 0.42);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function createPortalHalo(color: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(0.85, 1.03, 96);
  geometry.scale(PORTAL_SIZE.width * 0.46, PORTAL_SIZE.height * 0.45, 1);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

function createOrganicRim(color: number): THREE.Mesh {
  const outer = makeOrganicEllipsePath(1.12, 1.44, 0.1, 96, 0.4);
  const inner = makeOrganicEllipsePath(0.88, 1.18, 0.07, 96, 2.4).reverse();
  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i += 1) shape.lineTo(outer[i].x, outer[i].y);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(inner[0].x, inner[0].y);
  for (let i = 1; i < inner.length; i += 1) hole.lineTo(inner[i].x, inner[i].y);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.scale(PORTAL_SIZE.width * 0.43, PORTAL_SIZE.height * 0.38, 1);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geometry, material);
}

function makeOrganicEllipsePath(
  rx: number,
  ry: number,
  jitter: number,
  segments: number,
  seed: number,
): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const wave =
      Math.sin(t * 3 + seed) * 0.5 +
      Math.sin(t * 5 + seed * 2.1) * 0.35 +
      Math.sin(t * 9 + seed * 0.7) * 0.15;
    const radiusJitter = 1 + wave * jitter;
    points.push(new THREE.Vector2(Math.cos(t) * rx * radiusJitter, Math.sin(t) * ry * radiusJitter));
  }
  return points;
}

function buildRimPulseOffsets(vertexCount: number): Float32Array {
  const phases = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    phases[i] = (i / vertexCount) * Math.PI * 2 + Math.random() * 0.8;
  }
  return phases;
}

function createSparkPoints(): THREE.Points {
  const particleCount = 120;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random());
    const x = Math.cos(angle) * radius * (PORTAL_SIZE.width * 0.47);
    const y = Math.sin(angle) * radius * (PORTAL_SIZE.height * 0.45);
    const z = (Math.random() - 0.5) * 0.08;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const sparkTexture = createSparkTexture();
  const material = new THREE.PointsMaterial({
    color: 0x9bff6e,
    size: 0.08,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: sparkTexture,
    alphaTest: 0.25,
  });

  return new THREE.Points(geometry, material);
}

function createSparkTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
    grad.addColorStop(0, "rgba(227, 255, 185, 1)");
    grad.addColorStop(0.45, "rgba(153, 255, 89, 0.95)");
    grad.addColorStop(1, "rgba(76, 255, 51, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function animatePortal(animation: PortalAnimationState, dt: number, elapsedSeconds: number): void {
  animation.phase += dt;
  const wobble = Math.sin(elapsedSeconds * 2.9 + animation.phase) * 0.045;

  const coreMaterial = animation.core.material as THREE.ShaderMaterial;
  coreMaterial.uniforms.time.value = elapsedSeconds + animation.phase * 0.3;
  animation.core.scale.set(1 + wobble, 1 + wobble * 0.35, 1);

  animation.halo.rotation.z -= dt * 0.55;
  const haloMaterial = animation.halo.material as THREE.MeshBasicMaterial;
  haloMaterial.opacity = 0.2 + Math.sin(elapsedSeconds * 4.2 + animation.phase) * 0.07;

  const rimPositions = animation.rim.geometry.getAttribute("position") as THREE.BufferAttribute;
  const rimArray = rimPositions.array as Float32Array;
  for (let i = 0, vertex = 0; i < rimArray.length; i += 3, vertex += 1) {
    const baseX = animation.rimBasePositions[i];
    const baseY = animation.rimBasePositions[i + 1];
    const theta = animation.rimVertexPulse[vertex];
    const pulse = 1 + Math.sin(elapsedSeconds * 3.6 + theta + animation.phase) * 0.05;
    rimArray[i] = baseX * pulse;
    rimArray[i + 1] = baseY * pulse;
  }
  rimPositions.needsUpdate = true;
  animation.rim.rotation.z += dt * 0.14;
  const rimMaterial = animation.rim.material as THREE.MeshBasicMaterial;
  rimMaterial.opacity = 0.75 + Math.sin(elapsedSeconds * 6.4 + animation.phase) * 0.09;

  const positions = animation.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
  const array = positions.array as Float32Array;
  const base = animation.basePositions;
  for (let i = 0; i < array.length; i += 3) {
    const px = base[i];
    const py = base[i + 1];
    const dist = Math.hypot(px / PORTAL_SIZE.width, py / PORTAL_SIZE.height);
    const drift = elapsedSeconds * (2.1 + dist * 3.3) + i * 0.021 + animation.phase;
    array[i] = px + Math.cos(drift) * 0.05;
    array[i + 1] = py + Math.sin(drift * 1.5) * 0.045;
    array[i + 2] = base[i + 2] + Math.sin(drift * 2.6) * 0.05;
  }
  positions.needsUpdate = true;
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
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite) && !(object instanceof THREE.Points)) return;
    const material = object.material;
    if (Array.isArray(material)) {
      for (const mat of material) disposeMaterial(mat);
    } else {
      disposeMaterial(material);
    }
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      object.geometry.dispose();
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  const map = "map" in material ? material.map : null;
  if (map instanceof THREE.Texture) map.dispose();
  material.dispose();
}
