import { GRAB_RADIUS } from "../../../shared/constants";
import { generateArenaLayout } from "../arena/states";
import { Arena } from "../arena/arena";
import { CameraController } from "../camera";
import { FEATURE_FLAGS } from "../featureFlags";
import { InputManager } from "../input";
import { LocalMatch } from "../match/localMatch";
import { isTouchDevice } from "../platform";
import { LocalPlayer } from "../player";
import { GunViewModel } from "../render/gun";
import { HUD } from "../render/hud";
import { SceneManager } from "../render/scene";
import { KillFeed } from "../ui/kill-feed";
import { MainMenu } from "../ui/menu";
import { MobileControls } from "../ui/mobileControls";
import { cameraYawFacingBreachOpening } from "./cameraYawFromBreach";
import { FloatArmTuneOverlay } from "./floatArmTuneOverlay";
import { ProjectileSystem } from "./projectileSystem";
import { RoundController } from "./roundController";
import { GunTuneOverlay } from "./gunTuneOverlay";
import { buildShotFromCamera } from "./weaponFire";

export class App {
  private arena: Arena;
  private cam: CameraController;
  private floatArmTuneOverlay = new FloatArmTuneOverlay();
  private gun: GunViewModel;
  private gunTuneOverlay = new GunTuneOverlay();
  private hud: HUD;
  private input: InputManager;
  private killFeed = new KillFeed();
  private lastTime = 0;
  private match: LocalMatch;
  private menu: MainMenu;
  private readonly mobile = isTouchDevice();
  private mobileControls: MobileControls | null = null;
  private player: LocalPlayer;
  private projectiles: ProjectileSystem;
  private round = new RoundController();
  private sceneMgr: SceneManager;
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
    this.match = new LocalMatch(this.sceneMgr.getScene());

    this.sceneMgr.getScene().add(this.sceneMgr.getCamera());
    this.gun = new GunViewModel(this.sceneMgr.getCamera());

    this.match.onEvent = (event) => {
      switch (event.type) {
        case "hitConfirm":
          this.hud.triggerHitConfirm(event.team);
          break;
        case "freeze":
          this.killFeed.addKill(
            event.killerName,
            event.killerTeam,
            event.victimName,
            event.victimTeam,
          );
          break;
        case "score":
          this.killFeed.addScore(event.scorerName, event.scorerTeam);
          break;
        case "roundWin":
          this.onRoundWin(event.winningTeam);
          break;
        case "roundTie":
          this.onRoundTie();
          break;
      }
    };
    this.round.onBeginRound = () => this.beginNewRound();
    this.round.onCountdownEnd = () => this.arena.setPortalDoorsOpen(true);
    this.round.onRoundTimeout = () => this.match.handleRoundTimeout();

    if (this.mobile) {
      this.mobileControls = new MobileControls(this.input);
      this.mobileControls.mount();
      this.mobileControls.hide();
      this.mobileControls.onViewToggle = () => {
        this.thirdPerson = !this.thirdPerson;
      };
    } else {
      this.sceneMgr.getRenderer().domElement.addEventListener("mousedown", () => {
        if (this.round.getPhase() === "LOBBY" || this.menu.isVisible() || this.input.isLocked()) {
          return;
        }
        this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
      });
    }
  }

  public start(): void {
    this.menu.show();
    this.menu.onPlay = (selection) => {
      this.match.startNewGame({
        humanName: selection.name,
        humanTeam: 0,
        teamSize: selection.teamSize,
      });

      if (this.mobile) {
        this.input.setMobileControlsActive(true);
        this.mobileControls?.show();
      } else {
        this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
      }

      this.beginNewRound();
    };

    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  private beginNewRound(): void {
    this.hud.hideRoundEnd();
    this.projectiles.clear();

    const layout = generateArenaLayout();
    this.arena.loadLayout(layout);
    this.match.resetForRound(this.arena, this.player);

    const openAxis = this.arena.getBreachOpenAxis(this.player.team);
    const openSign = this.arena.getBreachOpenSign(this.player.team);
    this.cam.resetForBreachSpawn(cameraYawFacingBreachOpening(openAxis, openSign));

    this.arena.setPortalDoorsOpen(false);
    this.round.startCountdown();
  }

  private onRoundWin(team: 0 | 1): void {
    if (!this.round.isPlaying()) return;
    this.projectiles.clear();
    this.hud.showRoundEnd(team === 0 ? "CYAN WINS" : "MAGENTA WINS");
    this.round.endRound();
  }

  private onRoundTie(): void {
    if (!this.round.isPlaying()) return;
    this.projectiles.clear();
    this.hud.showRoundEnd("TIE");
    this.round.endRound();
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033);
    this.lastTime = timestamp;

    this.input.setAimingMode(this.player.phase === "AIMING");
    this.cam.setZeroGMode(this.player.phase !== "BREACH");
    this.cam.tickTransition(dt);

    const { dx, dy } = this.input.consumeMouseDelta();
    this.cam.applyMouseDelta(dx, dy, this.input.mouseSensitivity);

    this.round.tick(dt);

    this.input.updateFireCooldown(dt);
    this.player.update(this.input, this.cam, this.arena, dt);
    this.arena.update(dt);

    const botShots = this.match.tick(dt, this.arena, this.player, this.round.isPlaying());
    for (const shot of botShots) {
      this.projectiles.spawn(shot.origin, shot.direction, shot.team, shot.ownerId);
    }

    this.tickWeaponFire();
    this.projectiles.update(
      dt,
      this.arena.getObstacleAABBs(),
      this.arena.getPortalBarrierAABBs(),
      this.match.getProjectileTargets(this.player),
      (hitPos, color) => this.arena.triggerPortalImpact(hitPos, color),
      (hit) => this.match.handleProjectileHit(hit, this.player, this.cam),
    );
    this.tickGunTuning();

    if (FEATURE_FLAGS.thirdPersonLookBehind && this.input.consumeThirdPersonToggle()) {
      this.thirdPerson = !this.thirdPerson;
    }
    const isSelfie = FEATURE_FLAGS.thirdPersonLookBehind && this.input.isSelfieHeld();

    this.cam.apply(this.player.getPosition(), this.thirdPerson, isSelfie);
    this.updateGunVisibility(isSelfie);
    this.updateHud(dt);
    this.renderDebugTuningOverlay();

    this.sceneMgr.render();
    requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }

  private tickWeaponFire(): void {
    const inZeroG = this.player.phase === "FLOATING"
      || this.player.phase === "GRABBING"
      || this.player.phase === "AIMING";

    if (!this.round.isPlaying()) return;
    if (!this.input.canControlGame() || !inZeroG) return;
    if (!this.player.canFire() || !this.input.consumeFire()) return;

    const useThirdPersonMuzzle = this.thirdPerson
      || (FEATURE_FLAGS.thirdPersonLookBehind && this.input.isSelfieHeld());
    const shot = buildShotFromCamera(this.player, this.cam, this.gun, useThirdPersonMuzzle);
    if (!shot) return;

    this.projectiles.spawn(shot.origin, shot.direction, this.player.team, "local-player");
    this.player.triggerArmRecoil();
  }

  private tickGunTuning(): void {
    const tuning = FEATURE_FLAGS.debugTuning;
    if (!tuning.enabled) return;

    if (tuning.target === "Pistol") {
      if (this.input.consumeGunTuneToggle()) this.player.toggleThirdPersonGunTuning();
      if (this.input.consumeGunTuneReset()) this.player.resetThirdPersonGunTuning();
      if (this.input.consumeGunTunePrint()) {
        void this.copyDebugTuningToClipboard(this.player.logThirdPersonGunTuning());
      }

      if (this.player.isThirdPersonGunTuningEnabled()) {
        const tuningAxes = this.input.getGunTuneAxes();
        this.player.nudgeThirdPersonGun(
          tuningAxes.position,
          tuningAxes.rotation,
          tuningAxes.fine,
        );
      }
      return;
    }

    if (!this.player.isFloatLimbTarget(tuning.target)) return;

    if (this.input.consumeGunTuneToggle()) this.player.toggleFloatArmTuning();
    if (this.input.consumeGunTuneReset()) this.player.resetFloatLimbTuning(tuning.target);
    if (this.input.consumeGunTunePrint()) {
      void this.copyDebugTuningToClipboard(this.player.logFloatLimbTuning(tuning.target));
    }

    if (this.player.isFloatLimbTuningEnabled()) {
      const tuningAxes = this.input.getGunTuneAxes();
      this.player.nudgeFloatLimbRotation(
        tuning.target,
        tuningAxes.rotation,
        tuningAxes.fine,
      );
    }
  }

  private renderDebugTuningOverlay(): void {
    const tuning = FEATURE_FLAGS.debugTuning;

    this.gunTuneOverlay.render(
      this.player.getThirdPersonGunTuningState(),
      tuning.enabled && tuning.target === "Pistol",
    );

    if (!this.player.isFloatLimbTarget(tuning.target)) {
      this.floatArmTuneOverlay.render(
        { target: "FloatRightArm", rotation: this.player.getFloatLimbTuningState("FloatRightArm").rotation },
        false,
        false,
      );
      return;
    }

    this.floatArmTuneOverlay.render(
      this.player.getFloatLimbTuningState(tuning.target),
      this.player.isFloatLimbTuningEnabled(),
      tuning.enabled,
    );
  }

  private async copyDebugTuningToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        console.info("[DebugTuning] Copied tuning values to clipboard.");
        return;
      }
    } catch (error) {
      console.warn("[DebugTuning] Clipboard API failed, trying fallback copy.", error);
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      const copied = document.execCommand("copy");
      if (copied) {
        console.info("[DebugTuning] Copied tuning values to clipboard.");
      } else {
        console.warn("[DebugTuning] Clipboard copy failed; value is still in the console.");
      }
    } catch (error) {
      console.warn("[DebugTuning] Clipboard fallback failed; value is still in the console.", error);
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private updateGunVisibility(isSelfie: boolean): void {
    const phase = this.round.getPhase();
    const playerAlive = this.player.phase !== "RESPAWNING";
    const roundActive = phase !== "LOBBY";

    this.player.setThirdPersonGunVisible(
      roundActive && playerAlive && (this.thirdPerson || isSelfie),
    );
    this.gun.setVisible(roundActive && playerAlive && !this.thirdPerson && !isSelfie);
  }

  private updateHud(dt: number): void {
    let nearBar = this.arena.getNearestBar(this.player.getPosition(), GRAB_RADIUS) !== null;
    if (this.player.phase === "BREACH" && !this.arena.isGoalDoorOpen(this.player.currentBreachTeam)) {
      nearBar = false;
    }
    const inBreach = this.arena.isInBreachRoom(this.player.getPosition(), this.player.team);

    if (this.mobile && this.mobileControls) {
      const canGrab = !this.player.damage.leftArm && !this.player.damage.frozen;
      this.mobileControls.setPhase(this.player.phase);
      this.mobileControls.setNearBar(nearBar, canGrab);
      const showPower = this.player.phase === "GRABBING" || this.player.phase === "AIMING";
      const max = this.player.maxLaunchPower();
      const pct = max > 0 ? this.player.launchPower / max : 0;
      this.mobileControls.setPowerLevel(pct, showPower);
      this.mobileControls.setViewMode(this.thirdPerson);
    }

    const rosters = this.match.getHudRosters(this.player);
    this.hud.update({
      score: this.match.getScore(),
      phase: this.round.getPhase(),
      countdown: this.round.getCountdown(),
      roundTimeRemaining: this.round.getRoundTimeRemaining(),
      playerPhase: this.player.phase,
      launchPower: this.player.launchPower,
      maxLaunchPower: this.player.maxLaunchPower(),
      nearBar,
      inBreach,
      damage: this.player.damage,
      tabHeld: this.input.isTabHeld(),
      ownTeam: rosters.ownTeam,
      enemyTeam: rosters.enemyTeam,
      dt,
      team: this.player.team,
    });
  }
}
