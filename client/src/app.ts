import * as THREE from 'three';
import { Arena } from './arena/arena';
import { CameraController } from './camera';
import { InputManager } from './input';
import { LocalPlayer } from './player';
import { HUD, type GamePhase } from './render/hud';
import { SceneManager } from './render/scene';
import { generateArenaLayout } from './arena/states';
import { COUNTDOWN_SECONDS, ROUND_END_DELAY, GRAB_RADIUS } from '../../shared/constants';
import type { FullPlayerInfo, EnemyPlayerInfo } from '../../shared/schema';

void THREE;

export class App {
  private sceneMgr: SceneManager;
  private input: InputManager;
  private cam: CameraController;
  private player: LocalPlayer;
  private arena: Arena;
  private hud: HUD;

  private phase: GamePhase = 'LOBBY';
  private countdownTimer = COUNTDOWN_SECONDS;
  private lastTime = 0;

  public constructor() {
    this.sceneMgr = new SceneManager();
    this.input = new InputManager();
    this.cam = new CameraController(this.sceneMgr.getCamera());
    this.arena = new Arena(this.sceneMgr.getScene());
    this.player = new LocalPlayer(this.sceneMgr.getScene());
    this.hud = new HUD();

    // Wire round-win callback
    this.player.onRoundWin = (team) => this.onRoundWin(team);
  }

  public start(): void {
    this.hud.showStart();

    document.addEventListener('click', () => {
      if (!this.input.isLocked()) {
        this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
        this.hud.hideStart();
        this.beginNewRound();
      }
    });

    requestAnimationFrame((t) => this.loop(t));
  }

  // ── Round flow ────────────────────────────────────────────────────

  private beginNewRound(): void {
    this.hud.hideRoundEnd();
    const layout = generateArenaLayout();
    this.arena.loadLayout(layout);

    this.player.resetForNewRound(this.arena);

    this.phase = 'COUNTDOWN';
    this.countdownTimer = COUNTDOWN_SECONDS;
  }

  private onRoundWin(team: 0 | 1): void {
    if (this.phase !== 'PLAYING') {
      return;
    }
    this.phase = 'ROUND_END';
    const label = team === 0 ? 'CYAN WINS' : 'MAGENTA WINS';
    this.hud.showRoundEnd(label);
    setTimeout(() => this.beginNewRound(), ROUND_END_DELAY * 1000);
  }

  // ── Game loop ─────────────────────────────────────────────────────

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033); // cap at ~30fps min
    this.lastTime = timestamp;

    if (this.input.isLocked()) {
      // ── CRITICAL ORDER: setAimingMode BEFORE consumeMouseDelta ──
      this.input.setAimingMode(this.player.phase === 'AIMING');

      const { dx, dy } = this.input.consumeMouseDelta();
      // dy will be 0 when aiming (InputManager routes it to aimDy instead)
      this.cam.applyMouseDelta(dx, dy, this.input.mouseSensitivity);

      // Countdown
      if (this.phase === 'COUNTDOWN') {
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 0) {
          this.countdownTimer = 0;
          this.phase = 'PLAYING';
        }
      }

      // Player + arena update (runs during countdown too — players can move in breach room)
      this.input.updateFireCooldown(dt);
      this.player.update(this.input, this.cam, this.arena, dt);
      this.arena.update(dt);

      // Camera follows player
      this.cam.apply(this.player.getPosition());

      // HUD update
      const nearBar = this.arena.getNearestBar(this.player.getPosition(), GRAB_RADIUS) !== null;
      const inBreach = this.arena.isInBreachRoom(this.player.getPosition(), this.player.team);
      const maxPower = this.player.maxLaunchPower();

      // Solo mode: build mock scoreboard data (will be replaced by server data in Phase 2)
      const ownTeam: FullPlayerInfo[] = [{
        id: 'local',
        name: 'You',
        frozen: this.player.damage.frozen,
        kills: this.player.kills,
        deaths: this.player.deaths,
        ping: 0,
      }];
      const enemyTeam: EnemyPlayerInfo[] = [];

      this.hud.update({
        score: { team0: this.player.kills, team1: 0 },
        phase: this.phase,
        countdown: this.countdownTimer,
        playerPhase: this.player.phase,
        launchPower: this.player.launchPower,
        maxLaunchPower: maxPower,
        nearBar,
        inBreach,
        damage: this.player.damage,
        tabHeld: this.input.isTabHeld(),
        ownTeam,
        enemyTeam,
      });
    }

    this.sceneMgr.render();
    requestAnimationFrame((t) => this.loop(t));
  }
}
