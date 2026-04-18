import { GRAB_RADIUS, PLAYER_RADIUS } from "../../../shared/constants";
import { generateArenaLayout } from "../../../shared/arena-gen";
import type { MultiplayerRoomSnapshot } from "../../../shared/multiplayer";
import { Arena } from "../arena/arena";
import { CameraController } from "../camera";
import { FEATURE_FLAGS } from "../featureFlags";
import { InputManager } from "../input";
import { LocalMatch } from "../match/localMatch";
import { OnlineMatch } from "../match/onlineMatch";
import type { ProjectileHitEvent } from "../match/localMatch";
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
import { NetClient } from "../net/client";
import { MultiplayerLobby } from "../ui/multiplayerLobby";
import type { PlaySelection } from "../ui/menu";

const PLAYER_UPDATE_RATE = 0.05; // 20hz

export class App {
  private appMode: "menu" | "solo" | "online" = "menu";
  private onlineGameActive = false;
  private playerUpdateTimer = 0;
  private latestOnlineSnapshot: MultiplayerRoomSnapshot | null = null;
  private previousOnlinePhase: MultiplayerRoomSnapshot["phase"] | null = null;
  private onlinePlayerName = "Pilot";

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
  private multiplayer = new MultiplayerLobby();
  private onlineMatch: OnlineMatch;
  private readonly mobile = isTouchDevice();
  private mobileControls: MobileControls | null = null;
  private net = new NetClient();
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
    this.onlineMatch = new OnlineMatch(this.sceneMgr.getScene());
    this.hud.setVisible(false);
    this.killFeed.setVisible(false);

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

    this.net.onStateChange = (snapshot) => {
      this.latestOnlineSnapshot = snapshot;

      const prev = this.previousOnlinePhase;
      this.previousOnlinePhase = snapshot.phase;

      if (!this.onlineGameActive) {
        this.multiplayer.render(snapshot);
      }

      if (prev !== "PLAYING" && snapshot.phase === "PLAYING") {
        this.startOnlineGame(snapshot);
        return;
      }

      if (this.onlineGameActive) {
        if (snapshot.phase === "LOBBY") {
          this.endOnlineGame();
          return;
        }
        this.onlineMatch.applySnapshot(snapshot.actors, snapshot.sessionId);
      }
    };

    this.net.onLobbyEvent = (event) => {
      this.multiplayer.setStatus(event.text, event.type);
    };

    this.net.onFreezeEvent = (event) => {
      const sessionId = this.net.getSessionId();
      this.killFeed.addKill(event.killerName, event.killerTeam, event.victimName, event.victimTeam);

      if (this.onlineGameActive && sessionId && event.targetId === sessionId) {
        this.player.damage.frozen = true;
        this.player.phase = "FROZEN";
        this.player.deaths += 1;
      }
    };

    this.net.onRoundWinEvent = (event) => {
      if (this.onlineGameActive) {
        this.projectiles.clear();
        if (event.winningTeam === 0) {
          this.hud.showRoundEnd("CYAN WINS");
        } else {
          this.hud.showRoundEnd("MAGENTA WINS");
        }
        this.killFeed.addScore(event.scorerName, event.winningTeam);
      }
    };

    this.net.onLeave = () => {
      if (this.appMode === "online") {
        void this.returnToMenuFromOnline();
      }
    };

    this.multiplayer.onLeaveLobby = () => {
      void this.returnToMenuFromOnline();
    };
    this.multiplayer.onReadyChange = (ready) => {
      this.net.setReady(ready);
    };
    this.multiplayer.onSwitchTeam = (team) => {
      this.net.switchTeam(team);
    };
    this.multiplayer.onFillBots = (fill) => {
      this.net.fillBots(fill);
    };
    this.multiplayer.onTeamSizeChange = (teamSize) => {
      this.net.setTeamSize(teamSize);
    };

    if (this.mobile) {
      this.mobileControls = new MobileControls(this.input);
      this.mobileControls.mount();
      this.mobileControls.hide();
      this.mobileControls.onViewToggle = () => {
        this.thirdPerson = !this.thirdPerson;
      };
    } else {
      this.sceneMgr.getRenderer().domElement.addEventListener("mousedown", () => {
        if (this.menu.isVisible() || this.input.isLocked()) return;
        if (this.appMode === "solo" && this.round.getPhase() === "LOBBY") return;
        if (this.appMode === "online" && !this.onlineGameActive) return;
        this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
      });
    }
  }

  public start(): void {
    this.menu.show();
    this.menu.onPlaySolo = (selection) => {
      this.startSoloMatch(selection);
    };
    this.menu.onPlayOnline = (selection) => {
      void this.startOnlineLobby(selection);
    };

    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  // ── Main loop ───────────────────────────────────────────────────────────────

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033);
    this.lastTime = timestamp;

    if (this.appMode === "solo") {
      this.tickSoloGame(dt);
    } else if (this.appMode === "online" && this.onlineGameActive) {
      this.tickOnlineGame(dt);
    }

    this.sceneMgr.render();
    requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }

  // ── Solo game tick ──────────────────────────────────────────────────────────

  private tickSoloGame(dt: number): void {
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
    this.updateSoloHud(dt);
    this.renderDebugTuningOverlay();
  }

  // ── Online game tick ────────────────────────────────────────────────────────

  private tickOnlineGame(dt: number): void {
    this.input.setAimingMode(this.player.phase === "AIMING");
    this.cam.setZeroGMode(this.player.phase !== "BREACH");
    this.cam.tickTransition(dt);

    const { dx, dy } = this.input.consumeMouseDelta();
    this.cam.applyMouseDelta(dx, dy, this.input.mouseSensitivity);

    this.input.updateFireCooldown(dt);
    this.player.update(this.input, this.cam, this.arena, dt);
    this.arena.update(dt);

    this.onlineMatch.update(dt);

    this.tickOnlineWeaponFire();

    const localTarget = {
      active: this.player.phase !== "RESPAWNING" && !this.player.damage.frozen,
      id: "local-player",
      pos: this.player.getPosition().clone(),
      radius: PLAYER_RADIUS,
      team: this.player.team,
    };
    const allTargets = [localTarget, ...this.onlineMatch.getProjectileTargets()];

    this.projectiles.update(
      dt,
      this.arena.getObstacleAABBs(),
      this.arena.getPortalBarrierAABBs(),
      allTargets,
      (hitPos, color) => this.arena.triggerPortalImpact(hitPos, color),
      (hit) => this.handleOnlineProjectileHit(hit),
    );

    this.checkOnlineBreachScore();

    this.playerUpdateTimer -= dt;
    if (this.playerUpdateTimer <= 0) {
      this.playerUpdateTimer = PLAYER_UPDATE_RATE;
      this.sendOnlinePlayerUpdate();
    }

    const isSelfie = false;
    this.cam.apply(this.player.getPosition(), this.thirdPerson, isSelfie);
    this.updateGunVisibility(isSelfie);
    this.updateOnlineHud(dt);
  }

  private tickOnlineWeaponFire(): void {
    const inZeroG = this.player.phase === "FLOATING"
      || this.player.phase === "GRABBING"
      || this.player.phase === "AIMING";

    if (!this.onlineGameActive) return;
    if (!this.input.canControlGame() || !inZeroG) return;
    if (!this.player.canFire() || !this.input.consumeFire()) return;

    const shot = buildShotFromCamera(this.player, this.cam, this.gun, false);
    if (!shot) return;

    this.projectiles.spawn(shot.origin, shot.direction, this.player.team, "local-player");
    this.player.triggerArmRecoil();
  }

  private handleOnlineProjectileHit(hit: ProjectileHitEvent): void {
    if (hit.targetId === "local-player") {
      if (hit.ownerId !== "local-player") {
        const zone = LocalPlayer.classifyHitZone(
          hit.impactPoint,
          this.player.getPosition(),
          this.cam.getForward(),
        );
        this.player.applyHit(zone, hit.direction.clone().normalize().multiplyScalar(3));
      }
      return;
    }

    if (hit.ownerId === "local-player") {
      const impulse = hit.direction.clone().normalize().multiplyScalar(3);
      this.net.sendHitReport({
        targetId: hit.targetId,
        impX: impulse.x,
        impY: impulse.y,
        impZ: impulse.z,
      });
      this.hud.triggerHitConfirm(this.player.team);
    }
  }

  private checkOnlineBreachScore(): void {
    if (!this.onlineGameActive) return;
    if (this.player.phase !== "FLOATING" || this.player.damage.frozen) return;

    const enemyTeam = (1 - this.player.team) as 0 | 1;
    if (!this.arena.isGoalDoorOpen(enemyTeam)) return;
    if (!this.arena.isDeepInBreachRoom(this.player.getPosition(), enemyTeam, 1.0)) return;

    this.player.currentBreachTeam = enemyTeam;
    this.player.phase = "BREACH";
    this.player.phys.vel.y = 0;
    this.player.kills += 1;

    this.net.sendBreachReport({
      scorerTeam: this.player.team,
      scorerName: this.onlinePlayerName,
    });
  }

  private sendOnlinePlayerUpdate(): void {
    const pos = this.player.getPosition();
    const vel = this.player.phys.vel;
    this.net.sendPlayerUpdate({
      posX: pos.x,
      posY: pos.y,
      posZ: pos.z,
      velX: vel.x,
      velY: vel.y,
      velZ: vel.z,
      yaw: this.cam.getYaw(),
      phase: this.player.phase,
      frozen: this.player.damage.frozen,
      leftArm: this.player.damage.leftArm,
      rightArm: this.player.damage.rightArm,
      legs: this.player.damage.legs,
      kills: this.player.kills,
      deaths: this.player.deaths,
    });
  }

  // ── Online game lifecycle ───────────────────────────────────────────────────

  private startOnlineGame(snapshot: MultiplayerRoomSnapshot): void {
    this.onlineGameActive = true;
    this.playerUpdateTimer = 0;

    this.multiplayer.hide();
    this.hud.setVisible(true);
    this.killFeed.setVisible(true);

    const layout = generateArenaLayout(snapshot.roundNumber);
    this.arena.loadLayout(layout);
    this.projectiles.clear();

    this.player.team = snapshot.selfTeam;
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.resetForNewRound(this.arena);

    const openAxis = this.arena.getBreachOpenAxis(this.player.team);
    const openSign = this.arena.getBreachOpenSign(this.player.team);
    this.cam.resetForBreachSpawn(cameraYawFacingBreachOpening(openAxis, openSign));

    this.arena.setPortalDoorsOpen(true);

    this.onlineMatch.applySnapshot(snapshot.actors, snapshot.sessionId);

    if (this.mobile) {
      this.input.setMobileControlsActive(true);
      this.mobileControls?.show();
    }
    // Pointer lock is acquired on the first canvas click (mousedown handler),
    // not here — requestPointerLock() requires a direct user gesture.
  }

  private endOnlineGame(): void {
    this.onlineGameActive = false;

    this.onlineMatch.dispose();
    this.projectiles.clear();
    this.hud.setVisible(false);
    this.hud.hideRoundEnd();
    this.killFeed.setVisible(false);
    this.input.exitPointerLock();
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);

    const snap = this.latestOnlineSnapshot;
    if (snap) {
      this.multiplayer.render(snap);
    }
  }

  // ── HUD updates ─────────────────────────────────────────────────────────────

  private updateSoloHud(dt: number): void {
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

  private updateOnlineHud(dt: number): void {
    const snap = this.latestOnlineSnapshot;
    if (!snap) return;

    const sessionId = this.net.getSessionId() ?? "local-player";

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
    }

    const rosters = this.onlineMatch.getHudRosters(
      sessionId,
      this.onlinePlayerName,
      this.player.team,
      this.player.kills,
      this.player.deaths,
      this.player.damage.frozen,
      this.player.phase,
    );

    this.hud.update({
      score: snap.score,
      phase: "PLAYING",
      countdown: 0,
      roundTimeRemaining: snap.roundTimeRemaining,
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

  // ── Solo round lifecycle ────────────────────────────────────────────────────

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

  // ── Solo match start ────────────────────────────────────────────────────────

  private startSoloMatch(selection: PlaySelection): void {
    this.appMode = "solo";
    this.multiplayer.hide();
    this.hud.setVisible(true);
    this.killFeed.setVisible(true);

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
  }

  // ── Online lobby start ──────────────────────────────────────────────────────

  private async startOnlineLobby(selection: PlaySelection): Promise<void> {
    this.appMode = "online";
    this.onlinePlayerName = selection.name;
    this.onlineGameActive = false;
    this.previousOnlinePhase = null;
    this.projectiles.clear();
    this.hud.setVisible(false);
    this.killFeed.setVisible(false);
    this.input.exitPointerLock();
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);
    this.multiplayer.showConnecting(selection.name);

    try {
      const snapshot = await this.net.connect({ name: selection.name });
      this.latestOnlineSnapshot = snapshot;
      this.previousOnlinePhase = snapshot.phase;
      this.multiplayer.render(snapshot);
    } catch (error) {
      console.error("Failed to connect to the multiplayer room.", error);
      this.multiplayer.setStatus("Could not reach the Colyseus server. Check that the server is running.", "error");
    }
  }

  private async returnToMenuFromOnline(): Promise<void> {
    this.appMode = "menu";
    this.onlineGameActive = false;
    this.onlineMatch.dispose();
    this.multiplayer.hide();
    this.hud.setVisible(false);
    this.hud.hideRoundEnd();
    this.killFeed.setVisible(false);
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);
    this.input.exitPointerLock();

    try {
      await this.net.disconnect();
    } catch (error) {
      console.warn("Multiplayer disconnect raised an error.", error);
    }

    this.menu.show();
  }

  // ── Weapon fire (solo) ──────────────────────────────────────────────────────

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

  // ── Gun tuning overlays ─────────────────────────────────────────────────────

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

  // ── Shared helpers ──────────────────────────────────────────────────────────

  private updateGunVisibility(isSelfie: boolean): void {
    const phase = this.round.getPhase();
    const playerAlive = this.player.phase !== "RESPAWNING";
    const roundActive = this.appMode === "online" ? this.onlineGameActive : phase !== "LOBBY";

    this.player.setThirdPersonGunVisible(
      roundActive && playerAlive && (this.thirdPerson || isSelfie),
    );
    this.gun.setVisible(roundActive && playerAlive && !this.thirdPerson && !isSelfie);
  }
}
