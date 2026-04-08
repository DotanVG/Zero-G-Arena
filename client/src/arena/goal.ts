import * as THREE from 'three';
import { ARENA_SIZE, BREACH_ROOM_W, BREACH_ROOM_H } from '../../../shared/constants';

export interface GoalDef {
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
  team: 0 | 1;
}

// Portal frame matches breach room opening
const FRAME_W = BREACH_ROOM_W;   // 8
const FRAME_H = BREACH_ROOM_H;   // 6
const FRAME_T = 0.35;            // frame bar thickness
const FRAME_D = 0.18;            // frame bar depth
const FRAME_LAYER_OFFSET = 0.34; // one frame on each side of the door cavity
const DOOR_D  = 0.4;             // door panel depth (thicker than frame)
const DOOR_SPEED = 1.2;          // panels travel from closed→open in ~0.83s (easing visible)

export class GoalPlane {
  private group: THREE.Group;
  private doorTop:     THREE.Mesh;
  private doorBottom:  THREE.Mesh;
  private doorOpen     = false;
  private doorProgress = 0;      // 0 = closed, 1 = fully open

  public constructor(
    private config: GoalDef,
    private scene: THREE.Scene,
  ) {
    this.group = new THREE.Group();

    // Position at arena face
    const pos = new THREE.Vector3();
    pos[config.axis] = config.sign * (ARENA_SIZE / 2);
    this.group.position.copy(pos);

    // Rotate so the frame sits flush on the arena wall
    if (config.axis === 'x') {
      this.group.rotation.y = config.sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else if (config.axis === 'y') {
      this.group.rotation.x = config.sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      this.group.rotation.y = config.sign === 1 ? Math.PI : 0;
    }

    this.buildNeonFrame(config.team, -FRAME_LAYER_OFFSET);
    this.buildNeonFrame(config.team, FRAME_LAYER_OFFSET);
    const [top, bot] = this.buildDoors(config.team);
    this.doorTop    = top;
    this.doorBottom = bot;

    scene.add(this.group);
  }

  // ── Neon frame ────────────────────────────────────────────────────

  private buildNeonFrame(team: 0 | 1, zOffset: number): void {
    const fw  = FRAME_W;
    const fh  = FRAME_H;
    const t   = FRAME_T;
    const d   = FRAME_D;
    const hw  = fw / 2;
    const hh  = fh / 2;
    const col = team === 0 ? 0x00ffff : 0xff00ff;

    // [sw, sh, sd, px, py, isHorizontal]
    // Top and bottom span full width; glow spreads vertically.
    // Left and right fill height; glow spreads horizontally.
    const segs: [number, number, number, number, number, boolean][] = [
      [fw + t * 2, t,  d,  0,   hh, true],
      [fw + t * 2, t,  d,  0,  -hh, true],
      [t,          fh, d, -hw,  0,  false],
      [t,          fh, d,  hw,  0,  false],
    ];

    for (const [sw, sh, sd, px, py, horiz] of segs) {
      // Core — solid neon colour
      this.group.add(this.makeMesh(sw, sh, sd, px, py, zOffset,
        new THREE.MeshBasicMaterial({ color: col })));

      // Inner glow — spreads 2.5× across the bar
      const g1w = horiz ? sw : sw * 2.5;
      const g1h = horiz ? sh * 2.5 : sh;
      this.group.add(this.makeMesh(g1w, g1h, sd, px, py, zOffset,
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.28,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })));

      // Outer glow — spreads 5× across the bar (faint halo)
      const g2w = horiz ? sw : sw * 5;
      const g2h = horiz ? sh * 5 : sh;
      this.group.add(this.makeMesh(g2w, g2h, sd, px, py, zOffset,
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.09,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })));
    }
  }

  // ── Portal door panels ────────────────────────────────────────────

  private buildDoors(team: 0 | 1): [THREE.Mesh, THREE.Mesh] {
    const fw       = FRAME_W;
    const fh       = FRAME_H;
    const panelH   = fh / 2;                   // 3 units tall each
    const col      = team === 0 ? 0x001a2e : 0x1a001a;   // dark opaque team colour
    const mat      = () => new THREE.MeshBasicMaterial({ color: col });

    // Keep the sliding panels centered between the two visible frame layers.
    const zOff = 0;

    const top = this.makeMesh(fw, panelH, DOOR_D, 0, fh / 4, zOff, mat());
    this.group.add(top);

    const bot = this.makeMesh(fw, panelH, DOOR_D, 0, -fh / 4, zOff, mat());
    this.group.add(bot);

    return [top, bot];
  }

  // ── Public API ────────────────────────────────────────────────────

  public setDoorOpen(open: boolean): void {
    this.doorOpen = open;
  }

  public getTeam(): 0 | 1 {
    return this.config.team;
  }

  public isDoorOpen(): boolean {
    return this.doorProgress >= 0.5;
  }

  /** Call once per frame from Arena.update(). */
  public update(dt: number): void {
    const target = this.doorOpen ? 1 : 0;
    if (target > this.doorProgress) {
      this.doorProgress = Math.min(1, this.doorProgress + DOOR_SPEED * dt);
    } else if (target < this.doorProgress) {
      this.doorProgress = Math.max(0, this.doorProgress - DOOR_SPEED * dt);
    }

    const fh      = FRAME_H;
    const panelH  = fh / 2;
    const closedY = fh / 4;               // 1.5  — center of top panel when closed
    const openY   = fh / 2 + panelH + 0.1; // 6.1 — above frame, fully hidden

    const p = this.easeInOut(this.doorProgress);
    this.doorTop.position.y    =  closedY + (openY - closedY) * p;
    this.doorBottom.position.y = -closedY - (openY - closedY) * p;

    // Hide meshes once fully open to avoid invisible collisions
    this.doorTop.visible    = this.doorProgress < 0.99;
    this.doorBottom.visible = this.doorProgress < 0.99;
  }

  /**
   * Returns true when an UNFROZEN player from the opposite team crosses the portal.
   * Caller must verify !player.damage.frozen before calling.
   */
  public checkEntry(playerPos: THREE.Vector3, playerTeam: 0 | 1): boolean {
    if (playerTeam === this.config.team) return false;
    // Doors closed → portal is blocked
    if (this.doorProgress < 0.5) return false;

    const target = this.config.sign * (ARENA_SIZE / 2);
    if (Math.abs(playerPos[this.config.axis] - target) > 1.5) return false;

    const axes = (['x', 'y', 'z'] as const).filter(a => a !== this.config.axis);
    return axes.every(a => Math.abs(playerPos[a]) < 10);
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private makeMesh(
    w: number, h: number, d: number,
    px: number, py: number, pz: number,
    mat: THREE.Material,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(px, py, pz);
    return mesh;
  }

  /** Cubic easeInOut — slow start, fast middle, slow end (mechanical door feel). */
  private easeInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}
