import * as THREE from "three";
import { GRAB_RADIUS, HITBOX_OFFSET_Y, HITBOX_RADIUS } from "../../../shared/constants";
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
import { FirstTimeTutorial } from "../render/hud/tutorial";
import { SceneManager } from "../render/scene";
import { KillFeed } from "../ui/kill-feed";
import { MainMenu } from "../ui/menu";
import { MobileControls } from "../ui/mobileControls";
import { SessionMenu, type SessionSettings } from "../ui/sessionMenu";
import { SoundEngine } from "../audio/SoundEngine";
import { cameraYawFacingBreachOpening } from "./cameraYawFromBreach";
import { FloatArmTuneOverlay } from "./floatArmTuneOverlay";
import { ProjectileSystem } from "./projectileSystem";
import { RoundController } from "./roundController";
import { GunTuneOverlay } from "./gunTuneOverlay";
import { buildShotFromCamera } from "./weaponFire";
import { NetClient } from "../net/client";
import { MultiplayerLobby } from "../ui/multiplayerLobby";
import type { PlaySelection } from "../ui/menu";
import { DebriefScreen, type DebriefData, type DebriefPlayer } from "../ui/debrief";
import { showConfirmDialog } from "../ui/confirmDialog";
import {
  PORTAL_ARRIVAL_SPAWN,
  checkPortalCollisions,
  clearVibeJamPortals,
  configureOutboundPortal,
  configurePortalArrivalSpawn,
  getPortalParams,
  initVibeJamPortal,
  isPortalArrival,
  updateVibeJamPortals,
} from "./portal/vibeJamPortal";
import type { PortalParams } from "./portal/parsePortalParams";

const PLAYER_UPDATE_RATE = 0.05; // 20hz

export class App {
  private appMode: "menu" | "solo" | "online" = "menu";
  private onlineGameActive = false;
  private onlineSessionToken = 0;
  private isUserExitingOnline = false;
  private matchOver = false;
  private helpVisible = false;
  private lastSoloSelection: PlaySelection | null = null;
  private matchEndHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingOnlineDebrief: DebriefData | null = null;
  private playerUpdateTimer = 0;
  private latestOnlineSnapshot: MultiplayerRoomSnapshot | null = null;
  private previousOnlinePhase: MultiplayerRoomSnapshot["phase"] | null = null;
  private onlinePlayerName = "Pilot";
  private onlineBreachReported = false;
  private portalArrivalPending = false;
  private portalUrlCleaned = false;

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
  private debrief = new DebriefScreen();
  private multiplayer = new MultiplayerLobby();
  private onlineMatch: OnlineMatch;
  private readonly mobile = isTouchDevice();
  private mobileControls: MobileControls | null = null;
  private net = new NetClient();
  private portalParams: PortalParams;
  private player: LocalPlayer;
  private projectiles: ProjectileSystem;
  private round = new RoundController();
  private sceneMgr: SceneManager;
  private sessionMenu = new SessionMenu();
  private sound!: SoundEngine;
  private thirdPerson = false;
  private tutorial = new FirstTimeTutorial();

  public constructor() {
    this.portalParams = getPortalParams();
    this.portalArrivalPending = isPortalArrival();
    this.sceneMgr = new SceneManager();
    this.sound = new SoundEngine(this.sceneMgr.getCamera(), this.sceneMgr.getScene());
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
    this.sessionMenu.setLauncherVisible(false);
    this.applySessionSettings(this.sessionMenu.getSettings());

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
        case "matchEnd":
          this.onMatchEnd(event.winningTeam, event.finalScore);
          break;
      }
    };
    this.round.onBeginRound = () => this.beginNewRound();
    this.round.onCountdownEnd = () => this.arena.setPortalDoorsOpen(true);
    this.round.onRoundTimeout = () => this.match.handleRoundTimeout();
    this.sessionMenu.onLauncherRequest = () => this.openSessionMenu();
    this.sessionMenu.onResume = () => this.closeSessionMenu();
    this.sessionMenu.onMainMenu = () => {
      void this.handleSessionMenuMainMenu();
    };
    this.sessionMenu.onSettingsChange = (settings) => {
      this.applySessionSettings(settings);
    };

    this.debrief.onMainMenu = () => {
      if (this.appMode === "online") {
        void this.forceLeaveOnline();
        return;
      }
      this.returnToMenuFromSolo();
    };
    this.debrief.onPlayAgain = () => {
      if (this.appMode === "online") {
        this.returnToOnlineLobbyFromDebrief();
        return;
      }
      if (this.lastSoloSelection) {
        this.startSoloMatch(this.lastSoloSelection);
      } else {
        this.returnToMenuFromSolo();
      }
    };

    this.net.onStateChange = (snapshot) => {
      if (this.isUserExitingOnline || this.appMode !== "online") return;
      this.latestOnlineSnapshot = snapshot;

      const prev = this.previousOnlinePhase;
      this.previousOnlinePhase = snapshot.phase;

      if (!this.onlineGameActive || snapshot.phase === "LOBBY") {
        this.multiplayer.render(snapshot);
      }

      const shouldBeginOnlineRound =
        snapshot.phase === "COUNTDOWN"
        && prev !== "COUNTDOWN"
        && prev !== "PLAYING";
      const joinedLiveRound = !this.onlineGameActive && snapshot.phase === "PLAYING";

      if (shouldBeginOnlineRound || joinedLiveRound) {
        this.beginOnlineRound(snapshot);
        if (shouldBeginOnlineRound) {
          this.sound.playCountdown();
        }
      }

      if (snapshot.phase === "LOBBY") {
        if (this.onlineGameActive) {
          this.endOnlineGame();
        }
        return;
      }

      if (this.onlineGameActive) {
        this.arena.setPortalDoorsOpen(snapshot.phase === "PLAYING");
        this.onlineMatch.applySnapshot(snapshot.actors, snapshot.sessionId);
      }
    };

    this.net.onLobbyEvent = (event) => {
      if (this.isUserExitingOnline || this.appMode !== "online") return;
      this.multiplayer.setStatus(event.text, event.type);
    };

    this.net.onFreezeEvent = (event) => {
      if (this.isUserExitingOnline || this.appMode !== "online") return;
      const sessionId = this.net.getSessionId();
      this.killFeed.addKill(event.killerName, event.killerTeam, event.victimName, event.victimTeam);

      if (this.onlineGameActive && sessionId && event.targetId === sessionId) {
        this.player.damage.frozen = true;
        this.player.phase = "FROZEN";
        this.player.deaths += 1;
      }
    };

    this.net.onRoundResultEvent = (event) => {
      if (this.isUserExitingOnline || this.appMode !== "online") return;
      if (!this.onlineGameActive) return;

      this.projectiles.clear();
      this.onlineBreachReported = false;

      if (event.outcome === "tie") {
        this.hud.showRoundEnd("TIE");
        return;
      }

      if (event.reason === "breach" && event.winningTeam !== null) {
        this.killFeed.addScore(event.scorerName, event.winningTeam);
      }

      if (event.matchWinner !== null && event.finalScore) {
        const label = event.matchWinner === 0 ? "CYAN" : "MAGENTA";
        this.hud.showRoundEnd(
          `${label} WINS THE MATCH  ${event.finalScore.team0} - ${event.finalScore.team1}`,
        );
        this.pendingOnlineDebrief = this.buildOnlineDebrief(event.matchWinner, event.finalScore);
        return;
      }

      this.hud.showRoundEnd(event.winningTeam === 0 ? "CYAN WINS" : "MAGENTA WINS");
    };

    this.net.onShotEvent = (event) => {
      if (this.isUserExitingOnline || this.appMode !== "online") return;
      if (!this.onlineGameActive) return;
      if (event.ownerId === this.getOnlineLocalActorId()) return;

      this.projectiles.spawn(
        new THREE.Vector3(event.originX, event.originY, event.originZ),
        new THREE.Vector3(event.dirX, event.dirY, event.dirZ),
        event.team,
        event.ownerId,
      );
      this.onlineMatch.triggerRemoteShot(event.ownerId);
      this.sound.playRemoteShot(new THREE.Vector3(event.originX, event.originY, event.originZ));
    };

    this.net.onLeave = () => {
      if (this.isUserExitingOnline) return;
      if (this.appMode !== "online") return;
      void this.requestLeaveOnline("server_disconnect");
    };

    this.multiplayer.onLeaveLobby = () => {
      void this.requestLeaveOnline("user_exit");
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
    this.multiplayer.onOpenSettings = () => {
      this.openSessionMenu();
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
        if (this.menu.isVisible() || this.input.isLocked() || this.sessionMenu.isOpen()) return;
        if (this.appMode === "solo" && this.round.getPhase() === "LOBBY") return;
        if (this.appMode === "online" && !this.onlineGameActive) return;
        this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
      });
    }
  }

  public start(): void {
    this.menu.onPlaySolo = (selection) => {
      this.startSoloMatch(selection);
    };
    this.menu.onPlayOnline = (selection) => {
      void this.startOnlineLobby(selection);
    };
    this.menu.onOpenSettings = () => {
      this.openSessionMenu();
    };
    this.menu.onPlayTutorial = (selection) => {
      this.startTutorialMatch(selection);
    };

    if (this.portalArrivalPending) {
      this.startSoloMatch({
        name: this.portalParams.username?.trim() || "Portal Pilot",
        teamSize: 1,
        noBots: true,
      });
    } else {
      this.menu.show();
    }

    const unlockAudio = (): void => {
      void this.sound.unlock().then(() => { this.sound.startMusic(); });
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  // ── Main loop ───────────────────────────────────────────────────────────────

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033);
    this.lastTime = timestamp;

    if (this.input.consumeMenuToggle()) {
      if (this.sessionMenu.isOpen()) {
        this.closeSessionMenu();
      } else if (this.appMode !== "menu") {
        this.openSessionMenu();
      }
    }

    if (this.input.consumeHelpPressed() && this.appMode !== "menu") {
      this.helpVisible = !this.helpVisible;
    }

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
      this.sound.playRemoteShot(shot.origin);
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

    checkPortalCollisions(this.player.getPosition(), this.player.phys.vel.y);
    updateVibeJamPortals(this.sceneMgr.getCamera().position, dt);

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

    const localActorId = this.getOnlineLocalActorId();
    const localCentre = this.player.getPosition().clone();
    localCentre.y += HITBOX_OFFSET_Y;
    const localTarget = {
      active: this.player.phase !== "RESPAWNING" && !this.player.damage.frozen,
      id: localActorId,
      pos: localCentre,
      radius: HITBOX_RADIUS,
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

    const localActorId = this.getOnlineLocalActorId();
    this.projectiles.spawn(shot.origin, shot.direction, this.player.team, localActorId);
    this.sound.playLocalShot();
    this.net.sendShot({
      ownerId: localActorId,
      team: this.player.team,
      originX: shot.origin.x,
      originY: shot.origin.y,
      originZ: shot.origin.z,
      dirX: shot.direction.x,
      dirY: shot.direction.y,
      dirZ: shot.direction.z,
    });
    this.player.triggerArmRecoil();
    this.tutorial.noteShotFired();
  }

  private handleOnlineProjectileHit(hit: ProjectileHitEvent): void {
    const localActorId = this.getOnlineLocalActorId();
    if (hit.targetId === localActorId) {
      return;
    }

    if (hit.ownerId === localActorId) {
      this.net.sendHitReport({
        targetId: hit.targetId,
        impX: 0,
        impY: 0,
        impZ: 0,
      });
      this.hud.triggerHitConfirm(this.player.team);
      return;
    }

    if (hit.targetId === localActorId) {
      if (hit.ownerId !== "local-player") {
        const zone = LocalPlayer.classifyHitZone(
          hit.impactPoint,
          this.player.getPosition(),
          this.cam.getForward(),
          HITBOX_OFFSET_Y,
          HITBOX_RADIUS,
        );
        // Zero impulse — shots freeze but do not push. See localMatch.ts.
        this.player.applyHit(zone, hit.direction.clone().normalize().multiplyScalar(0));
      }
      return;
    }

    if (hit.ownerId === "local-player") {
      this.net.sendHitReport({
        targetId: hit.targetId,
        impX: 0,
        impY: 0,
        impZ: 0,
      });
      this.hud.triggerHitConfirm(this.player.team);
    }
  }

  private checkOnlineBreachScore(): void {
    if (!this.onlineGameActive) return;
    if (this.onlineBreachReported || this.player.damage.frozen) return;
    if (this.player.phase !== "FLOATING" && this.player.phase !== "BREACH") return;

    const enemyTeam = (1 - this.player.team) as 0 | 1;
    if (!this.arena.isGoalDoorOpen(enemyTeam)) return;
    const reachedEnemyBreach = this.player.phase === "BREACH"
      ? this.arena.isInBreachRoom(this.player.getPosition(), enemyTeam)
      : this.arena.isDeepInBreachRoom(this.player.getPosition(), enemyTeam, 1.0);
    if (!reachedEnemyBreach) return;

    this.player.currentBreachTeam = enemyTeam;
    this.player.phase = "BREACH";
    this.onlineBreachReported = true;

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
      leftLeg: this.player.damage.leftLeg,
      rightLeg: this.player.damage.rightLeg,
      kills: this.player.kills,
      deaths: this.player.deaths,
    });
  }

  // ── Online game lifecycle ───────────────────────────────────────────────────

  private beginOnlineRound(snapshot: MultiplayerRoomSnapshot): void {
    this.onlineGameActive = true;
    this.onlineBreachReported = false;
    this.playerUpdateTimer = 0;
    this.tutorial.beginRun();

    this.multiplayer.hide();
    this.hud.setVisible(true);
    this.killFeed.setVisible(true);
    this.hud.hideRoundEnd();

    const layout = generateArenaLayout(snapshot.roundNumber);
    this.arena.loadLayout(layout);
    this.projectiles.clear();

    this.player.team = snapshot.selfTeam;
    const selfActor = snapshot.actors.find((actor) => actor.id === snapshot.sessionId);
    this.player.kills = selfActor?.kills ?? 0;
    this.player.deaths = selfActor?.deaths ?? 0;
    this.player.resetForNewRound(
      this.arena,
      selfActor
        ? { x: selfActor.posX, y: selfActor.posY, z: selfActor.posZ }
        : undefined,
    );

    const openAxis = this.arena.getBreachOpenAxis(this.player.team);
    const openSign = this.arena.getBreachOpenSign(this.player.team);
    this.cam.resetForBreachSpawn(cameraYawFacingBreachOpening(openAxis, openSign));

    this.arena.setPortalDoorsOpen(snapshot.phase === "PLAYING");

    this.onlineMatch.applySnapshot(snapshot.actors, snapshot.sessionId);

    if (this.mobile) {
      const menuOpen = this.sessionMenu.isOpen();
      this.input.setMobileControlsActive(!menuOpen);
      if (menuOpen) {
        this.mobileControls?.hide();
      } else {
        this.mobileControls?.show();
      }
    }
    // Pointer lock is acquired on the first canvas click (mousedown handler),
    // not here — requestPointerLock() requires a direct user gesture.
  }

  private endOnlineGame(): void {
    this.sound.stopCountdown();
    this.closeSessionMenu();
    this.onlineGameActive = false;
    this.onlineBreachReported = false;

    this.onlineMatch.dispose();
    this.projectiles.clear();
    this.killFeed.setVisible(false);
    this.input.exitPointerLock();
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);

    const snap = this.latestOnlineSnapshot;
    if (snap) {
      this.multiplayer.render(snap);
    }

    if (this.pendingOnlineDebrief) {
      const debrief = this.pendingOnlineDebrief;
      this.pendingOnlineDebrief = null;
      if (this.matchEndHandle) clearTimeout(this.matchEndHandle);
      this.matchEndHandle = setTimeout(() => {
        this.matchEndHandle = null;
        this.showMatchDebrief(debrief);
      }, 4000);
    } else {
      this.hud.setVisible(false);
      this.hud.hideRoundEnd();
    }
  }

  // ── HUD updates ─────────────────────────────────────────────────────────────

  private updateSoloHud(dt: number): void {
    let nearBar = this.arena.getNearestBar(this.player.getPosition(), GRAB_RADIUS) !== null;
    if (this.player.phase === "BREACH" && !this.arena.isGoalDoorOpen(this.player.currentBreachTeam)) {
      nearBar = false;
    }

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
      damage: this.player.damage,
      showPing: false,
      tabHeld: this.input.isTabHeld(),
      ownTeam: rosters.ownTeam,
      enemyTeam: rosters.enemyTeam,
      tutorialPrompt: this.tutorial.update({
        currentBreachTeam: this.player.currentBreachTeam,
        frozen: this.player.damage.frozen,
        inRound: this.round.getPhase() === "COUNTDOWN" || this.round.getPhase() === "PLAYING",
        mobile: this.mobile,
        phase: this.player.phase,
        team: this.player.team,
      }),
      helpVisible: this.helpVisible,
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
      phase: snap.phase,
      countdown: snap.countdownRemaining,
      roundTimeRemaining: snap.roundTimeRemaining,
      playerPhase: this.player.phase,
      launchPower: this.player.launchPower,
      maxLaunchPower: this.player.maxLaunchPower(),
      nearBar,
      damage: this.player.damage,
      showPing: true,
      tabHeld: this.input.isTabHeld(),
      ownTeam: rosters.ownTeam,
      enemyTeam: rosters.enemyTeam,
      tutorialPrompt: this.tutorial.update({
        currentBreachTeam: this.player.currentBreachTeam,
        frozen: this.player.damage.frozen,
        inRound: snap.phase === "COUNTDOWN" || snap.phase === "PLAYING",
        mobile: this.mobile,
        phase: this.player.phase,
        team: this.player.team,
      }),
      helpVisible: this.helpVisible,
      dt,
      team: this.player.team,
    });
  }

  // ── Solo round lifecycle ────────────────────────────────────────────────────

  private beginNewRound(): void {
    this.hud.hideRoundEnd();
    this.projectiles.clear();
    clearVibeJamPortals();

    const layout = generateArenaLayout();
    this.arena.loadLayout(layout);

    const arrivalThisRound = this.portalArrivalPending;
    const arrivalCenter = this.arena.getBreachRoomCenter(this.player.team);
    const arrivalOpenAxis = this.arena.getBreachOpenAxis(this.player.team);
    const arrivalOpenSign = this.arena.getBreachOpenSign(this.player.team);
    configurePortalArrivalSpawn(arrivalCenter, arrivalOpenAxis, arrivalOpenSign);

    const enemyTeam = (1 - this.player.team) as 0 | 1;
    configureOutboundPortal(
      this.arena.getBreachRoomCenter(enemyTeam),
      this.arena.getBreachOpenAxis(enemyTeam),
      this.arena.getBreachOpenSign(enemyTeam),
    );

    this.match.resetForRound(
      this.arena,
      this.player,
      arrivalThisRound ? PORTAL_ARRIVAL_SPAWN : undefined,
    );

    const openAxis = this.arena.getBreachOpenAxis(this.player.team);
    const openSign = this.arena.getBreachOpenSign(this.player.team);
    this.cam.resetForBreachSpawn(cameraYawFacingBreachOpening(openAxis, openSign));

    initVibeJamPortal(this.sceneMgr.getScene(), this.portalParams);
    this.match.addOutboundVibeJamPortal(this.portalParams);

    this.arena.setPortalDoorsOpen(false);
    if (arrivalThisRound) {
      this.round.startCountdown();
      this.round.tick(999);
      this.cleanPortalUrl();
      this.portalArrivalPending = false;
    } else {
      this.round.startCountdown();
      this.sound.playCountdown();
    }
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

  private onMatchEnd(
    winningTeam: 0 | 1,
    finalScore: { team0: number; team1: number },
  ): void {
    this.matchOver = true;
    this.round.cancelPendingRestart();
    if (this.matchEndHandle) clearTimeout(this.matchEndHandle);
    this.matchEndHandle = setTimeout(() => {
      this.matchEndHandle = null;
      this.showSoloDebrief(winningTeam, finalScore);
    }, 4000);
  }

  private showSoloDebrief(
    winningTeam: 0 | 1,
    finalScore: { team0: number; team1: number },
  ): void {
    const rosters = this.match.getHudRosters(this.player);
    const playerTeam = this.player.team;
    const enemyTeam = (1 - playerTeam) as 0 | 1;

    const ownPlayers: DebriefPlayer[] = rosters.ownTeam.map((p) => ({
      id: p.id,
      name: p.name,
      team: playerTeam,
      breaches: p.kills,
      frozen: p.deaths,
      isBot: p.isBot,
      isSelf: p.id === "local-player",
    }));
    const enemyPlayers: DebriefPlayer[] = rosters.enemyTeam.map((p) => ({
      id: p.id,
      name: p.name,
      team: enemyTeam,
      breaches: p.kills,
      frozen: p.deaths,
      isBot: p.isBot,
      isSelf: false,
    }));

    const teamSize = this.lastSoloSelection?.teamSize ?? 1;
    const sizeLabelMap: Record<number, string> = {
      1: "1v1 Duel", 2: "2v2 Duos", 5: "5v5 Squads", 10: "10v10 Rush", 20: "20v20 War",
    };

    const debriefData: DebriefData = {
      winningTeam,
      score: finalScore,
      players: [...ownPlayers, ...enemyPlayers],
      playerTeam,
      matchLabel: `${sizeLabelMap[teamSize] ?? "Solo"} · ${finalScore.team0} – ${finalScore.team1}`,
    };

    this.showMatchDebrief(debriefData);
  }

  private returnToMenuFromSolo(): void {
    this.sound.stopCountdown();
    this.closeSessionMenu();
    this.debrief.hide();
    this.appMode = "menu";
    this.matchOver = false;
    this.projectiles.clear();
    clearVibeJamPortals();
    this.hud.setVisible(false);
    this.hud.hideRoundEnd();
    this.killFeed.setVisible(false);
    this.input.exitPointerLock();
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);
    this.input.setUiBlocked(false);
    this.match.dispose();
    this.sessionMenu.setLauncherVisible(false);
    this.menu.show();
  }

  private openSessionMenu(): void {
    if (this.sessionMenu.isOpen() || this.debrief.isVisible()) return;

    const inMenu = this.appMode === "menu";
    const inLiveMatch = this.appMode === "solo" || this.onlineGameActive;
    const title = inMenu
      ? "Flight Settings"
      : this.appMode === "solo"
        ? "Solo Flight Menu"
        : this.onlineGameActive
          ? "Live Match Menu"
          : "Lobby Menu";
    const subtitle = inMenu
      ? "Tune mouse and audio before launch. Close settings to continue from the main menu."
      : inLiveMatch
        ? this.mobile
          ? "Resume when you are ready, or return straight to the main menu."
          : "Resume when you are ready, then click the arena to recapture mouse look."
        : "Step back to the room shell or return all the way to the main menu.";
    const resumeLabel = inMenu
      ? "Close Settings"
      : this.appMode === "solo"
        ? "Resume Match"
        : this.onlineGameActive
          ? "Resume Match"
          : "Back To Lobby";
    const mainMenuLabel = inMenu ? null : "Return To Main Menu";

    this.input.exitPointerLock();
    this.input.setUiBlocked(true);
    if (this.mobile) {
      this.mobileControls?.hide();
      this.input.setMobileControlsActive(false);
    }

    this.sessionMenu.open({
      title,
      subtitle,
      resumeLabel,
      mainMenuLabel,
    });
  }

  private closeSessionMenu(): void {
    if (!this.sessionMenu.isOpen()) return;

    this.sessionMenu.close();
    this.input.setUiBlocked(false);

    if (!this.mobile) return;

    if (this.appMode === "solo" || this.onlineGameActive) {
      this.input.setMobileControlsActive(true);
      this.mobileControls?.show();
      return;
    }

    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);
  }

  private async handleSessionMenuMainMenu(): Promise<void> {
    this.closeSessionMenu();
    if (this.appMode === "solo") {
      this.returnToMenuFromSolo();
      return;
    }
    if (this.appMode === "online") {
      await this.requestLeaveOnline("user_exit");
    }
  }

  private countOtherHumans(): number {
    const snap = this.latestOnlineSnapshot;
    if (!snap) return 0;
    return snap.members.filter((m) => !m.isBot && m.id !== snap.sessionId).length;
  }

  private async requestLeaveOnline(
    reason: "user_exit" | "server_disconnect" | "join_failed",
  ): Promise<void> {
    if (this.isUserExitingOnline) return;

    if (reason === "user_exit" && this.countOtherHumans() > 0) {
      const confirmed = await showConfirmDialog({
        title: "Leave online room?",
        body: "Other players are still in this room. Are you sure you want to leave?",
        confirmLabel: "LEAVE",
        cancelLabel: "CANCEL",
      });
      if (!confirmed) return;
    }

    await this.forceLeaveOnline();
  }

  private async forceLeaveOnline(): Promise<void> {
    if (this.isUserExitingOnline) return;
    this.isUserExitingOnline = true;
    this.onlineSessionToken += 1;
    try {
      await this.returnToMenuFromOnline();
    } finally {
      this.isUserExitingOnline = false;
    }
  }

  private applySessionSettings(settings: SessionSettings): void {
    this.input.mouseSensitivity = settings.mouseSensitivity;
    this.sound.setMusicVolume(settings.musicVolume);
    this.sound.setSfxVolume(settings.sfxVolume);
    this.sound.setMusicEnabled(settings.soundtrackEnabled);
  }

  private cleanPortalUrl(): void {
    if (this.portalUrlCleaned || typeof window === "undefined") return;
    if (!window.location.search) return;
    history.replaceState(null, "", window.location.pathname);
    this.portalUrlCleaned = true;
  }

  private getOnlineLocalActorId(): string {
    return this.net.getSessionId() ?? "local-player";
  }

  // ── Solo match start ────────────────────────────────────────────────────────

  private startTutorialMatch(selection: PlaySelection): void {
    this.tutorial.forceRestart();
    this.startSoloMatch({ ...selection, teamSize: 1, noBots: true });
  }

  private startSoloMatch(selection: PlaySelection): void {
    this.lastSoloSelection = selection;
    this.debrief.hide();
    this.appMode = "solo";
    this.matchOver = false;
    this.onlineBreachReported = false;
    this.helpVisible = false;
    this.tutorial.beginRun();
    if (this.matchEndHandle) {
      clearTimeout(this.matchEndHandle);
      this.matchEndHandle = null;
    }
    this.multiplayer.hide();
    this.hud.setVisible(true);
    this.killFeed.setVisible(true);
    this.input.setUiBlocked(false);
    this.sessionMenu.setLauncherVisible(true);

    this.player.team = 0;
    this.portalParams = {
      ...this.portalParams,
      color: this.portalParams.color ?? "cyan",
      team: this.portalParams.team ?? "0",
      username: selection.name,
    };
    this.match.startNewGame({
      humanName: selection.name,
      humanTeam: 0,
      teamSize: selection.teamSize,
      noBots: selection.noBots,
    });

    if (this.mobile) {
      this.input.setMobileControlsActive(true);
      this.mobileControls?.show();
    } else if (!this.portalArrivalPending) {
      this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
    }

    this.beginNewRound();
  }

  // ── Online lobby start ──────────────────────────────────────────────────────

  private async startOnlineLobby(selection: PlaySelection): Promise<void> {
    this.appMode = "online";
    this.onlinePlayerName = selection.name;
    this.onlineGameActive = false;
    this.onlineBreachReported = false;
    this.pendingOnlineDebrief = null;
    if (this.matchEndHandle) { clearTimeout(this.matchEndHandle); this.matchEndHandle = null; }
    this.previousOnlinePhase = null;
    this.latestOnlineSnapshot = null;
    this.projectiles.clear();
    this.hud.setVisible(false);
    this.killFeed.setVisible(false);
    this.input.setUiBlocked(false);
    this.input.exitPointerLock();
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);
    this.sessionMenu.setLauncherVisible(true);
    this.multiplayer.showConnecting(selection.name);

    this.isUserExitingOnline = false;
    const myToken = ++this.onlineSessionToken;

    try {
      const snapshot = await this.net.connect({ name: selection.name });
      if (myToken !== this.onlineSessionToken || this.isUserExitingOnline || this.appMode !== "online") {
        try { await this.net.disconnect(); } catch { /* ignore */ }
        return;
      }
      this.latestOnlineSnapshot = snapshot;
      this.previousOnlinePhase = snapshot.phase;
      if (snapshot.phase === "COUNTDOWN" || snapshot.phase === "PLAYING") {
        this.beginOnlineRound(snapshot);
      } else {
        this.multiplayer.render(snapshot);
      }
    } catch (error) {
      console.error("Failed to connect to the multiplayer room.", error);
      if (myToken !== this.onlineSessionToken || this.isUserExitingOnline || this.appMode !== "online") {
        return;
      }
      this.multiplayer.setStatus(
        "Could not reach the Colyseus server. Check that the server is running.",
        "error",
      );
      await this.requestLeaveOnline("join_failed");
    }
  }

  private async returnToMenuFromOnline(): Promise<void> {
    this.closeSessionMenu();
    this.debrief.hide();
    this.appMode = "menu";
    this.onlineGameActive = false;
    this.onlineBreachReported = false;
    this.pendingOnlineDebrief = null;
    this.latestOnlineSnapshot = null;
    this.previousOnlinePhase = null;
    this.helpVisible = false;
    if (this.matchEndHandle) { clearTimeout(this.matchEndHandle); this.matchEndHandle = null; }
    this.onlineMatch.dispose();
    this.multiplayer.hide();
    clearVibeJamPortals();
    this.hud.setVisible(false);
    this.hud.hideRoundEnd();
    this.killFeed.setVisible(false);
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);
    this.input.setUiBlocked(false);
    this.input.exitPointerLock();
    this.sessionMenu.setLauncherVisible(false);
    this.gun.setVisible(false);
    this.gun.setFrozenTint(null);
    this.player.setThirdPersonGunVisible(false);
    this.player.setThirdPersonGunFrozenTint(null);

    try {
      await this.net.disconnect();
    } catch (error) {
      console.warn("Multiplayer disconnect raised an error.", error);
    }

    this.menu.show();
  }

  // ── Weapon fire (solo) ──────────────────────────────────────────────────────

  private showMatchDebrief(data: DebriefData): void {
    if (this.matchEndHandle) {
      clearTimeout(this.matchEndHandle);
      this.matchEndHandle = null;
    }

    this.sessionMenu.close();
    this.input.exitPointerLock();
    this.input.setUiBlocked(true);
    this.mobileControls?.hide();
    this.input.setMobileControlsActive(false);
    this.sessionMenu.setLauncherVisible(false);
    this.hud.setVisible(false);
    this.hud.hideRoundEnd();
    this.killFeed.setVisible(false);
    this.debrief.show(data);
  }

  private buildOnlineDebrief(
    winningTeam: 0 | 1,
    finalScore: { team0: number; team1: number },
  ): DebriefData {
    const snapshot = this.latestOnlineSnapshot;
    const sessionId = this.net.getSessionId() ?? "local-player";
    const playerTeam = snapshot?.selfTeam ?? this.player.team;
    const teamSize = snapshot?.teamSize ?? 1;
    const sizeLabelMap: Record<number, string> = {
      1: "1v1 Duel", 2: "2v2 Duos", 5: "5v5 Squads", 10: "10v10 Rush", 20: "20v20 War",
    };

    const players: DebriefPlayer[] = (snapshot?.actors ?? []).map((actor) => ({
      id: actor.id,
      name: actor.name,
      team: actor.team,
      breaches: actor.kills,
      frozen: actor.deaths,
      isBot: actor.isBot,
      isSelf: actor.id === sessionId,
    }));

    if (players.length === 0) {
      players.push({
        id: sessionId,
        name: this.onlinePlayerName,
        team: playerTeam,
        breaches: this.player.kills,
        frozen: this.player.deaths,
        isBot: false,
        isSelf: true,
      });
    }

    return {
      winningTeam,
      score: finalScore,
      players,
      playerTeam,
      matchLabel: `${sizeLabelMap[teamSize] ?? `${teamSize}v${teamSize}`} Online · ${finalScore.team0} – ${finalScore.team1}`,
    };
  }

  private returnToOnlineLobbyFromDebrief(): void {
    this.input.setUiBlocked(false);
    this.sessionMenu.setLauncherVisible(true);

    if (this.latestOnlineSnapshot) {
      this.multiplayer.render(this.latestOnlineSnapshot);
      return;
    }

    this.multiplayer.show();
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
    this.sound.playLocalShot();
    this.player.triggerArmRecoil();
    this.tutorial.noteShotFired();
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

    // When the local player is frozen or their right arm is disabled,
    // tint the pistol with the enemy team's colour so the player sees
    // they were hit instead of guessing why shots no longer fire.
    const incapacitated = this.player.damage.frozen || this.player.damage.rightArm;
    const enemyColor = this.player.team === 0 ? 0xff00ff : 0x00ffff;
    const tint = incapacitated ? enemyColor : null;
    this.gun.setFrozenTint(tint);
    this.player.setThirdPersonGunFrozenTint(tint);
  }
}
