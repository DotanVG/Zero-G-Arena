import type { PlayerNetState, DamageState, PlayerPhase } from '../../shared/schema';
import { type Vec3, v3 } from '../../shared/vec3';
import { type SharedPlayerState } from '../../shared/player-logic';
import { RESPAWN_TIME } from '../../shared/constants';
import { BotBrain } from './bot/brain';

let nextId = 1;

export class ServerPlayer implements SharedPlayerState {
  public readonly id: string;
  public name: string;
  public team: 0 | 1;
  public isBot: boolean;
  public connected: boolean;
  public ready: boolean;

  // Physics state
  public pos: Vec3;
  public vel: Vec3;
  public rot: { yaw: number; pitch: number };
  public phase: PlayerPhase;
  public damage: DamageState;
  public launchPower: number;
  public grabbedBarPos: Vec3 | null;
  public grabbedBarNormal: Vec3 | null;
  public currentBreachTeam: 0 | 1;
  public onGround: boolean;

  // Stats
  public kills: number;
  public deaths: number;
  public ping: number;
  public respawnTimer: number;
  public shotCooldown: number;

  // Input tracking
  public lastInput: import('../../shared/schema').ClientInputMsg | null;
  public lastAckSeq: number;
  public lastPingTime: number;

  // AI
  public brain: BotBrain | null;

  public constructor(name: string, team: 0 | 1, isBot = false) {
    this.id            = `p${nextId++}`;
    this.name          = name;
    this.team          = team;
    this.isBot         = isBot;
    this.connected     = true;
    this.ready         = isBot;

    this.pos           = v3.zero();
    this.vel           = v3.zero();
    this.rot           = { yaw: 0, pitch: 0 };
    this.phase         = 'BREACH';
    this.damage        = { frozen: false, rightArm: false, leftArm: false, legs: 0 };
    this.launchPower   = 0;
    this.grabbedBarPos = null;
    this.grabbedBarNormal = null;
    this.currentBreachTeam = team;
    this.onGround      = false;

    this.kills         = 0;
    this.deaths        = 0;
    this.ping          = 0;
    this.respawnTimer  = 0;
    this.shotCooldown  = 0;

    this.lastInput     = null;
    this.lastAckSeq    = 0;
    this.lastPingTime  = 0;

    this.brain = isBot ? new BotBrain() : null;

    void RESPAWN_TIME; // used by sim
  }

  public canGrabBar(): boolean {
    return !this.damage.frozen && !this.damage.leftArm;
  }

  public canFire(): boolean {
    return !this.damage.frozen && !this.damage.rightArm && this.phase !== 'FROZEN' && this.shotCooldown <= 0;
  }

  public resetForNewRound(spawnPos: Vec3): void {
    this.damage        = { frozen: false, rightArm: false, leftArm: false, legs: 0 };
    this.launchPower   = 0;
    this.grabbedBarPos = null;
    this.grabbedBarNormal = null;
    this.currentBreachTeam = this.team;
    this.onGround      = false;
    this.respawnTimer  = 0;
    this.shotCooldown  = 0;
    this.lastInput     = null;
    v3.copyTo(spawnPos, this.pos);
    v3.set(this.vel, 0, 0, 0);
    this.phase = 'BREACH';
    if (!this.isBot) this.ready = false;
  }

  public toNetState(): PlayerNetState {
    return {
      id:        this.id,
      name:      this.name,
      team:      this.team,
      pos:       v3.clone(this.pos),
      vel:       v3.clone(this.vel),
      rot:       { ...this.rot },
      phase:     this.phase,
      damage:    { ...this.damage },
      ping:      this.ping,
      kills:     this.kills,
      deaths:    this.deaths,
      connected: this.connected,
      isBot:     this.isBot,
    };
  }
}
