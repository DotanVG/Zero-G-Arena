import { Arena } from '../arena/arena';
import { CameraController } from '../camera';
import { InputManager } from '../input';
import { LocalPlayer } from '../player';
import { HUD } from '../render/hud';
import { SceneManager } from '../render/scene';
import { GunViewModel } from '../render/gun';
import { MainMenu } from '../ui/menu';
import { generateArenaLayout } from '../arena/states';
import { FEATURE_FLAGS } from '../featureFlags';
import { GRAB_RADIUS } from '../../../shared/constants';
import type { FullPlayerInfo, EnemyPlayerInfo } from '../../../shared/schema';
import { RoundController } from './roundController';
import { ProjectileSystem } from './projectileSystem';
import { buildShotFromCamera } from './weaponFire';
import { GunTuneOverlay } from './gunTuneOverlay';
import { cameraYawFacingBreachOpening } from './cameraYawFromBreach';

/**
 * Top-level game composition. Owns every subsystem, wires callbacks
 * between them, and runs the per-frame loop. Responsibilities are
 * intentionally thin: anything non-trivial lives in a game/* submodule
 * or one of the domain classes (LocalPlayer, Arena, InputManager, etc.).
 */
export class App {
  private sceneMgr: SceneManager;
  private input: InputManager;
  private cam: CameraController;
  private player: LocalPlayer;
  private arena: Arena;
  private hud: HUD;
  private menu: MainMenu;
  private round = new RoundController();
  private projectiles: ProjectileSystem;
  private gun: GunViewModel;
  private gunTuneOverlay = new GunTuneOverlay();

  private lastTime = 0;
  private thirdPerson = false;

  public constructor() {
    this.sceneMgr = new SceneManager();
    this.input = new InputManager();
    this.cam = new CameraController(this.sceneMgr.getCamera());
    this.arena = new Arena(this.sceneMgr.getScene());
    this.player = new LocalPlayer(this.sceneMgr.getScene());
    this.hud = new HUD();
    this.menu = new MainMenu();
    this.projectiles = new ProjectileSystem(this.sceneMgr.getScene());

    // Camera must be in the scene graph so parented children (gun model) render.
    this.sceneMgr.getScene().add(this.sceneMgr.getCamera());
    this.gun = new GunViewModel(this.sceneMgr.getCamera());

    this.player.onRoundWin = (team) => this.onRoundWin(team);
    this.round.onBeginRound = () => this.beginNewRound();
    this.round.onCountdownEnd = () => this.arena.setPortalDoorsOpen(true);

    this.sceneMgr.getRenderer().domElement.addEventListener('mousedown', () => {
      if (this.round.getPhase() === 'LOBBY' || this.menu.isVisible() || this.input.isLocked()) {
        return;
      }
      this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
    });
  }

  public start(): void {
    this.menu.show();
    this.menu.onPlay = () => {
      this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
      this.beginNewRound();
    };

    requestAnimationFrame((t) => this.loop(t));
  }

  private beginNewRound(): void {
    this.hud.hideRoundEnd();
    this.projectiles.clear();

    const layout = generateArenaLayout();
    this.arena.loadLayout(layout);
    this.player.resetForNewRound(this.arena);

    const openAxis = this.arena.getBreachOpenAxis(this.player.team);
    const openSign = this.arena.getBreachOpenSign(this.player.team);
    // resetForBreachSpawn seeds zeroGQuat so subsequent setZeroGMode(false)
    // calls don't overwrite the correct yaw with stale zero-G orientation.
    this.cam.resetForBreachSpawn(cameraYawFacingBreachOpening(openAxis, openSign));

    this.arena.setPortalDoorsOpen(false);
    this.round.startCountdown();
  }

  private onRoundWin(team: 0 | 1): void {
    if (!this.round.isPlaying()) return;
    const label = team === 0 ? 'CYAN WINS' : 'MAGENTA WINS';
    this.hud.showRoundEnd(label);
    this.round.endRound();
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033);
    this.lastTime = timestamp;

    // CRITICAL ORDER: mode switches must run before consumeMouseDelta so
    // InputManager routes mouse-Y correctly between look and aim.
    this.input.setAimingMode(this.player.phase === 'AIMING');
    this.cam.setZeroGMode(this.player.phase !== 'BREACH');
    this.cam.tickTransition(dt);

    const { dx, dy } = this.input.consumeMouseDelta();
    this.cam.applyMouseDelta(dx, dy, this.input.mouseSensitivity);

    this.round.tick(dt);

    this.input.updateFireCooldown(dt);
    this.player.update(this.input, this.cam, this.arena, dt);
    this.arena.update(dt);

    this.tickWeaponFire();
    this.projectiles.update(
      dt,
      this.arena.getObstacleAABBs(),
      this.arena.getPortalBarrierAABBs(),
      (hitPos) => this.arena.triggerPortalImpact(hitPos),
    );
    this.tickGunTuning();

    if (FEATURE_FLAGS.thirdPersonLookBehind && this.input.consumeThirdPersonToggle()) {
      this.thirdPerson = !this.thirdPerson;
    }
    const isSelfie = FEATURE_FLAGS.thirdPersonLookBehind && this.input.isSelfieHeld();

    this.cam.apply(this.player.getPosition(), this.thirdPerson, isSelfie);
    this.updateGunVisibility(isSelfie);
    this.updateHud();
    this.gunTuneOverlay.render(
      this.player.getThirdPersonGunTuningState(),
      FEATURE_FLAGS.thirdPersonGunTuning,
    );

    this.sceneMgr.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  private tickWeaponFire(): void {
    const inZeroG = this.player.phase === 'FLOATING'
      || this.player.phase === 'GRABBING'
      || this.player.phase === 'AIMING';
    if (!this.round.isPlaying()) return;
    if (!this.input.isLocked() || !inZeroG) return;
    if (!this.player.canFire() || !this.input.consumeFire()) return;

    const useThirdPersonMuzzle = this.thirdPerson
      || (FEATURE_FLAGS.thirdPersonLookBehind && this.input.isSelfieHeld());
    const shot = buildShotFromCamera(this.player, this.cam, this.gun, useThirdPersonMuzzle);
    if (!shot) return;
    this.projectiles.spawn(shot.origin, shot.direction, shot.color);
  }

  private tickGunTuning(): void {
    if (!FEATURE_FLAGS.thirdPersonGunTuning) return;

    if (this.input.consumeGunTuneToggle()) this.player.toggleThirdPersonGunTuning();
    if (this.input.consumeGunTuneReset()) this.player.resetThirdPersonGunTuning();
    if (this.input.consumeGunTunePrint()) this.player.logThirdPersonGunTuning();

    if (this.player.isThirdPersonGunTuningEnabled()) {
      const tuningAxes = this.input.getGunTuneAxes();
      this.player.nudgeThirdPersonGun(
        tuningAxes.position,
        tuningAxes.rotation,
        tuningAxes.fine,
      );
    }
  }

  private updateGunVisibility(isSelfie: boolean): void {
    const phase = this.round.getPhase();
    const playerAlive = this.player.phase !== 'RESPAWNING';
    const roundActive = phase !== 'LOBBY';

    const thirdPersonGunVisible = roundActive && playerAlive && (this.thirdPerson || isSelfie);
    this.player.setThirdPersonGunVisible(thirdPersonGunVisible);

    const firstPersonGunVisible = roundActive && playerAlive && !this.thirdPerson && !isSelfie;
    this.gun.setVisible(firstPersonGunVisible);
  }

  private updateHud(): void {
    let nearBar = this.arena.getNearestBar(this.player.getPosition(), GRAB_RADIUS) !== null;
    if (this.player.phase === 'BREACH' && !this.arena.isGoalDoorOpen(this.player.currentBreachTeam)) {
      nearBar = false;
    }
    const inBreach = this.arena.isInBreachRoom(this.player.getPosition(), this.player.team);

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
      phase: this.round.getPhase(),
      countdown: this.round.getCountdown(),
      playerPhase: this.player.phase,
      launchPower: this.player.launchPower,
      maxLaunchPower: this.player.maxLaunchPower(),
      nearBar,
      inBreach,
      damage: this.player.damage,
      tabHeld: this.input.isTabHeld(),
      ownTeam,
      enemyTeam,
    });
  }
}
