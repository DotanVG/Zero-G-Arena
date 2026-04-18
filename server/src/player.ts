import type { ClientInputMsg, DamageState, PlayerNetState } from "../../shared/schema";
import { FREEZE_TIME, INVULN_TIME, RESPAWN_TIME } from "../../shared/constants";

type Vec3 = { x: number; y: number; z: number };
type Rot3 = { yaw: number; pitch: number; roll: number };

export default class ServerPlayer {
  public readonly id: string;
  public readonly name: string;
  public readonly team: 0 | 1;
  public pos: Vec3;
  public vel: Vec3;
  public rot: Rot3;
  public state: "ACTIVE" | "FROZEN" | "RESPAWNING" = "ACTIVE";
  public frozenTimer = 0;
  public respawnTimer = 0;
  public invulnTimer = 0;
  public lastInput: ClientInputMsg | null = null;
  public seq = 0;
  public kills = 0;
  public deaths = 0;
  public ping = 0;
  public damage: DamageState = { frozen: false, rightArm: false, leftArm: false, leftLeg: false, rightLeg: false };

  public constructor(name: string, team: 0 | 1) {
    this.id = Math.random().toString(36).slice(2, 10);
    this.name = name;
    this.team = team;
    this.pos = team === 0 ? { x: 0, y: 0, z: -15 } : { x: 0, y: 0, z: 15 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.rot = { yaw: 0, pitch: 0, roll: 0 };
    void FREEZE_TIME;
    void RESPAWN_TIME;
    void INVULN_TIME;
  }

  public toNetState(): PlayerNetState {
    return {
      id:        this.id,
      name:      this.name,
      team:      this.team,
      pos:       { ...this.pos },
      vel:       { ...this.vel },
      rot:       { yaw: this.rot.yaw, pitch: this.rot.pitch },
      phase:     this.state === "FROZEN" ? "FROZEN"
                 : this.state === "RESPAWNING" ? "RESPAWNING"
                 : "FLOATING",
      damage:    { ...this.damage },
      ping:      this.ping,
      kills:     this.kills,
      deaths:    this.deaths,
      connected: true,
    };
  }
}
