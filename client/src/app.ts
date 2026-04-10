import * as THREE from 'three';
import { Arena } from './arena/arena';
import { CameraController } from './camera';
import { InputManager } from './input';
import { LocalPlayer } from './player';
import { Projectile } from './projectile';
import { RemotePlayer } from './remote-player';
import { HUD, type GamePhase } from './render/hud';
import { SceneManager } from './render/scene';
import { generateArenaLayout } from './arena/states';
import { NetClient } from './net/client';
import { preloadModels } from './render/model-loader';
import { MainMenu, type MatchSize } from './ui/menu';
import { LobbyScreen } from './ui/lobby';
import { KillFeed } from './ui/kill-feed';
import { PauseMenu } from './ui/pause-menu';
import { SoundEngine } from './audio/sound-engine';
import {
  COUNTDOWN_SECONDS,
  ROUND_END_DELAY,
  GRAB_RADIUS,
} from '../../shared/constants';
import { applyShotSpread } from '../../shared/physics';
import type {
  FullPlayerInfo,
  EnemyPlayerInfo,
  PlayerNetState,
  ServerStateMsg,
  ArenaLayoutMsg,
  LobbyStateMsg,
  ServerEventMsg,
  ShootEventData,
  HitEventData,
  ScoreEventData,
} from '../../shared/schema';

void THREE;

/** Player name stored in localStorage (set via Settings or the main menu name field) */
function getPlayerName(): string {
  return localStorage.getItem('orbital_player_name') ?? `Player${Math.floor(Math.random() * 9000) + 1000}`;
}

export class App {
  private sceneMgr: SceneManager;
  private input:    InputManager;
  private cam:      CameraController;
  private player:   LocalPlayer;
  private arena:    Arena;
  private hud:      HUD;
  private net:      NetClient;

  // UI layers
  private menu:      MainMenu;
  private lobby:     LobbyScreen;
  private killFeed:  KillFeed;
  private pauseMenu: PauseMenu;
  private sound:     SoundEngine;

  // Server-side all-frozen info
  private allFrozenTeam:  0 | 1 | undefined = undefined;
  private allFrozenTimer: number | undefined = undefined;

  private phase: GamePhase = 'LOBBY';
  private countdownTimer   = COUNTDOWN_SECONDS;
  private lastTime         = 0;
  private projectiles: Projectile[] = [];

  // Multiplayer
  private remotePlayers = new Map<string, RemotePlayer>();
  private isMultiplayer = false;
  private latestServerPlayers: PlayerNetState[] = [];
  private serverScore = { team0: 0, team1: 0 };
  private manualReturnToMenu = false;

  public constructor() {
    this.sceneMgr = new SceneManager();
    this.input    = new InputManager();
    this.cam      = new CameraController(this.sceneMgr.getCamera());
    this.arena    = new Arena(this.sceneMgr.getScene());
    this.player   = new LocalPlayer(this.sceneMgr.getScene());
    this.hud      = new HUD();
    this.net      = new NetClient();
    this.menu      = new MainMenu();
    this.lobby     = new LobbyScreen();
    this.killFeed  = new KillFeed();
    this.pauseMenu = new PauseMenu();
    this.sound     = new SoundEngine();

    this.player.onRoundWin = (team) => this.onRoundWin(team);
    this._wireNetwork();
  }

  public start(): void {
    // Preload GLTF models in the background while menu is shown
    preloadModels().catch(() => { /* models optional — sphere fallback used if missing */ });

    // Show the main menu immediately
    const canvas = this.sceneMgr.getRenderer().domElement;
    canvas.addEventListener('mousedown', () => {
      if (this.phase !== 'LOBBY' && !this.input.isLocked()) {
        this.input.lockPointer(canvas);
      }
    });

    this.menu.onQuickPlay = (size: MatchSize) => this._onQuickPlay(size);
    this.menu.onBrowseRooms = () => this.net.requestRoomList();
    this.menu.onJoinRoom = (roomId, size) => this._onJoinRoom(roomId, size);
    this.lobby.onAddBots = () => this.net.addBots();
    this.lobby.onToggleReady = (ready) => this.net.setReady(ready);
    this.lobby.onBack = () => this._returnToMenu(true);
    this.lobby.onSwitchTeam = () => this.net.switchTeam();
    this.lobby.onRemoveBot = (team) => this.net.removeBotFromTeam(team);
    this.net.onRoomList = (msg) => this.menu.updateRoomList(msg);

    // Escape key → pause menu (game keeps running)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.phase === 'LOBBY') return;
      if (this.pauseMenu.isVisible()) {
        this.pauseMenu.hide();
        this.input.lockPointer(canvas);
      } else {
        this.input.unlockPointer();
        this.pauseMenu.show(this.input.mouseSensitivity);
        this.pauseMenu.onResume = () => {
          this.input.lockPointer(canvas);
        };
        this.pauseMenu.onReturnToMenu = () => {
          this._returnToMenu(true);
        };
        this.pauseMenu.onSensitivityChange = (v) => {
          this.input.mouseSensitivity = v;
          return v;
        };
      }
    });

    // Unlock AudioContext on first interaction (browser requirement)
    const unlockAudio = () => { this.sound.resume(); document.removeEventListener('click', unlockAudio); };
    document.addEventListener('click', unlockAudio);

    this.menu.show();

    requestAnimationFrame((t) => this.loop(t));
  }

  // ── Menu flow ──────────────────────────────────────────────────────────────

  private _onQuickPlay(size: MatchSize): void {
    this.menu.fadeOut();
    this.manualReturnToMenu = false;
    this.player.setServerAuthoritative(true);

    const name = getPlayerName();
    this.net.connect(name, size, 'quick');

    // Solo fallback: if no connection within 2.5 seconds, start solo
    setTimeout(() => {
      if (!this.net.isConnected() && this.phase === 'LOBBY') {
        this.isMultiplayer = false;
        this.player.setServerAuthoritative(false);
        this.lobby.hide();
        this.beginNewRound();
      }
    }, 2500);
  }

  private _onJoinRoom(roomId: string, size: MatchSize): void {
    this.menu.fadeOut();
    this.manualReturnToMenu = false;
    this.player.setServerAuthoritative(true);

    const name = getPlayerName();
    this.net.connect(name, size, 'browse', roomId);
  }

  // ── Network setup ─────────────────────────────────────────────────────────

  private _clearRemotePlayers(): void {
    for (const remote of this.remotePlayers.values()) {
      remote.dispose();
    }
    this.remotePlayers.clear();
  }

  private _returnToMenu(disconnect = false): void {
    this.input.unlockPointer();
    this.lobby.hide();
    this.hud.hideRoundEnd();
    for (const projectile of this.projectiles) {
      projectile.dispose();
    }
    this.projectiles = [];
    this._clearRemotePlayers();
    this.phase = 'LOBBY';
    this.isMultiplayer = false;
    this.latestServerPlayers = [];
    this.serverScore = { team0: 0, team1: 0 };
    this.player.setServerAuthoritative(false);

    if (disconnect && this.net.isConnected()) {
      this.manualReturnToMenu = true;
      this.net.disconnect();
    } else {
      this.manualReturnToMenu = false;
    }

    this.menu.show();
  }

  private _wireNetwork(): void {
    this.net.onClose = () => {
      if (this.manualReturnToMenu) {
        this.manualReturnToMenu = false;
        return;
      }

      if (this.isMultiplayer) {
        this._returnToMenu(false);
      }
    };

    this.net.onLobby = (msg: LobbyStateMsg) => {
      this.isMultiplayer = true;
      this.player.setServerAuthoritative(true);
      this.player.setIdentity(msg.selfId, msg.selfTeam);
      this.phase = 'LOBBY';
      this.countdownTimer = msg.countdown ?? COUNTDOWN_SECONDS;
      this.input.unlockPointer();
      this.lobby.show(msg);
    };

    this.net.onLayout = (msg: ArenaLayoutMsg) => {
      this.isMultiplayer = true;
      this.lobby.hide();
      this.input.lockPointer(this.sceneMgr.getRenderer().domElement);
      this._applyLayout(msg);
    };

    this.net.onState = (msg: ServerStateMsg) => {
      this.isMultiplayer = true;
      this.latestServerPlayers = msg.players;
      this.serverScore = { ...msg.score };
      this.allFrozenTeam = msg.allFrozenTeam;
      this.allFrozenTimer = msg.allFrozenTimer;
      this._applyServerState(msg);
    };

    this.net.onEvent = (msg: ServerEventMsg) => {
      this._handleEvent(msg);
    };
  }

  private _applyLayout(layout: ArenaLayoutMsg): void {
    // Clear projectiles + remote players
    this.hud.hideRoundEnd();
    for (const p of this.projectiles) p.dispose();
    this.projectiles = [];
    this._clearRemotePlayers();

    this.arena.loadLayout(layout);
    this.player.resetForNewRound(this.arena);

    // Orient camera toward portal
    const openAxis = this.arena.getBreachOpenAxis(this.player.team);
    const openSign = this.arena.getBreachOpenSign(this.player.team);
    let targetYaw = 0;
    if (openAxis === 'z') targetYaw = openSign === 1 ? Math.PI : 0;
    else if (openAxis === 'x') targetYaw = openSign === 1 ? -Math.PI / 2 : Math.PI / 2;
    this.cam.setYaw(targetYaw);
    this.cam.setPitch(0);
    this.cam.resetZeroGFlip();
    this.cam.apply(this.player.getPosition());
    this.arena.setPortalDoorsOpen(false);
  }

  private _applyServerState(msg: ServerStateMsg): void {
    const serverTime = this.net.getServerTime();

    // Update game phase from server
    if (msg.phase !== this.phase) {
      this.phase = msg.phase as GamePhase;
      if (msg.phase === 'PLAYING') {
        this.arena.setPortalDoorsOpen(true);
        this.sound.playRoundStart();
      }
      if (msg.phase === 'COUNTDOWN') this.arena.setPortalDoorsOpen(false);
    }

    if (msg.countdown !== undefined) this.countdownTimer = msg.countdown;

    // Find own player state and reconcile
    const ownState = msg.players.find(p => p.id === this.player.id);
    if (ownState) {
      this.player.applyServerState(ownState);
    }

    // Update remote players
    const seenIds = new Set<string>();
    for (const state of msg.players) {
      if (state.id === this.player.id) continue;
      seenIds.add(state.id);

      let remote = this.remotePlayers.get(state.id);
      if (!remote) {
        remote = new RemotePlayer(this.sceneMgr.getScene(), state);
        this.remotePlayers.set(state.id, remote);
      }
      remote.pushState(state, serverTime);
    }

    // Remove players no longer in state
    for (const [id, remote] of this.remotePlayers) {
      if (!seenIds.has(id)) {
        remote.dispose();
        this.remotePlayers.delete(id);
      }
    }
  }

  private _handleEvent(msg: ServerEventMsg): void {
    switch (msg.type) {
      case 'shoot': {
        const data = msg.data as ShootEventData;
        const origin = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
        const dir    = new THREE.Vector3(data.vel.x, data.vel.y, data.vel.z).normalize();
        const color  = data.team === 0 ? 0x00ffff : 0xff00ff;
        this.projectiles.push(new Projectile(this.sceneMgr.getScene(), origin, dir, color));
        this.sound.playShoot(data.team as 0 | 1);
        break;
      }
      case 'hit': {
        const data = msg.data as HitEventData;
        const victimState = this.remotePlayers.get(data.targetId)?.lastState;
        const victimTeam  = (data.targetId === this.player.id
          ? this.player.team
          : (victimState?.team ?? 0)) as 0 | 1;
        // Killer team is the opposite of victim team
        const killerTeam = (1 - victimTeam) as 0 | 1;
        this.killFeed.addKill(data.killerName, killerTeam, data.victimName, victimTeam);
        this.sound.playFreeze();
        break;
      }
      case 'score': {
        const data = msg.data as ScoreEventData;
        this.killFeed.addScore(data.scorerName, data.scorerTeam as 0 | 1);
        this.sound.playBreach();
        break;
      }
      case 'roundEnd': {
        this.phase = 'ROUND_END';
        const data = msg.data as { scorerTeam: 0|1; scorerName: string };
        this.hud.showRoundEnd(data.scorerTeam === 0 ? 'CYAN WINS' : 'MAGENTA WINS');
        this.sound.playRoundEnd(data.scorerTeam === this.player.team);
        break;
      }
    }
  }

  // ── Solo round flow ────────────────────────────────────────────────────────

  private beginNewRound(): void {
    this.hud.hideRoundEnd();
    this.cam.resetZeroGFlip();
    this.player.setServerAuthoritative(false);
    for (const p of this.projectiles) p.dispose();
    this.projectiles = [];

    const layout = generateArenaLayout();
    this._applyLayout({ t: 'layout', ...layout });

    this.phase = 'COUNTDOWN';
    this.countdownTimer = COUNTDOWN_SECONDS;
  }

  private onRoundWin(team: 0 | 1): void {
    if (this.phase !== 'PLAYING') return;
    this.phase = 'ROUND_END';
    const label = team === 0 ? 'CYAN WINS' : 'MAGENTA WINS';
    this.hud.showRoundEnd(label);
    this.sound.playRoundEnd(team === this.player.team);
    if (!this.isMultiplayer) {
      setTimeout(() => this.beginNewRound(), ROUND_END_DELAY * 1000);
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────────────

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033);
    this.lastTime = timestamp;

    if (this.phase !== 'LOBBY') {
      this.input.setAimingMode(this.player.phase === 'AIMING');
      this.cam.setZeroGMode(this.player.phase !== 'BREACH');
      this.cam.tickTransition(dt);

      if (this.input.isLocked()) {
        const { dx, dy } = this.input.consumeMouseDelta();
        this.cam.applyMouseDelta(dx, dy, this.input.mouseSensitivity);
      }

      // Solo countdown
      if (!this.isMultiplayer && this.phase === 'COUNTDOWN') {
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 0) {
          this.countdownTimer = 0;
          this.phase = 'PLAYING';
          this.arena.setPortalDoorsOpen(true);
          this.sound.playRoundStart();
        }
      }

      // Player + arena update (before serialization so grab/aimDy are captured)
      this.input.updateFireCooldown(dt);
      this.player.update(this.input, this.cam, this.arena, dt);
      this.arena.update(dt);
      const releasedFireCharge = this.phase === 'PLAYING'
        ? this.input.consumeFireRelease()
        : null;
      const shouldFire = releasedFireCharge !== null
        && this.player.canFire()
        && this.input.isFireReady();
      const fireCharge = shouldFire ? releasedFireCharge : null;
      if (shouldFire) {
        this.input.commitFireCooldown();
      }

      // Send input to server every frame (after update so netGrab/netAimDy are set)
      if (this.isMultiplayer && this.net.isConnected()) {
        const inputMsg = this.player.serializeLastInput(this.input, this.cam, fireCharge);
        this.net.sendInput(inputMsg);
      }

      // Remote player interpolation
      const serverTime = this.net.getServerTime();
      for (const remote of this.remotePlayers.values()) {
        remote.update(serverTime, dt);
      }

      // Local projectile spawning (solo mode or visual-only in multiplayer)
      if (this.phase === 'PLAYING' && fireCharge !== null) {
        if (!this.isMultiplayer) {
          const shotDirVec = applyShotSpread(this.cam.getForward(), fireCharge, Math.random(), Math.random());
          const shotDir = new THREE.Vector3(shotDirVec.x, shotDirVec.y, shotDirVec.z);
          const origin = this.player.getPosition().clone()
            .addScaledVector(shotDir, 1.0);
          const color = this.player.team === 0 ? 0x00ffff : 0xff00ff;
          this.projectiles.push(new Projectile(this.sceneMgr.getScene(), origin, shotDir, color));
          this.sound.playShoot(this.player.team);
        }
        // Multiplayer: fire is sent in the input message; server broadcasts shoot event
      }

      for (const p of this.projectiles) p.update(dt);
      this.projectiles = this.projectiles.filter(p => !p.dead);

      this.cam.apply(this.player.getPosition());

      // HUD update
      const nearBar  = this.arena.getNearestBar(this.player.getPosition(), GRAB_RADIUS) !== null;
      const inBreach = this.arena.isInBreachRoom(this.player.getPosition(), this.player.team);
      const maxPower = this.player.maxLaunchPower();

      const ownTeam: FullPlayerInfo[] = this.isMultiplayer
        ? this.latestServerPlayers
          .filter((p) => p.team === this.player.team)
          .map((p) => ({
            id:     p.id,
            name:   p.name,
            frozen: p.damage.frozen,
            kills:  p.kills,
            deaths: p.deaths,
            ping:   p.ping,
            isBot:  p.isBot,
          }))
        : [{
          id:     this.player.id,
          name:   getPlayerName(),
          frozen: this.player.damage.frozen,
          kills:  this.player.kills,
          deaths: this.player.deaths,
          ping:   this.net.getPing(),
          isBot:  false,
        }];
      const enemyTeam: EnemyPlayerInfo[] = this.isMultiplayer
        ? this.latestServerPlayers
          .filter((p) => p.team !== this.player.team)
          .map((p) => ({
            id:     p.id,
            name:   p.name,
            kills:  p.kills,
            deaths: p.deaths,
            ping:   p.ping,
            isBot:  p.isBot,
          }))
        : [];

      this.hud.update({
        score:          this.isMultiplayer ? this.serverScore : { team0: this.player.kills, team1: 0 },
        phase:          this.phase,
        countdown:      this.countdownTimer,
        playerPhase:    this.player.phase,
        launchPower:    this.player.launchPower,
        maxLaunchPower: maxPower,
        nearBar,
        inBreach,
        damage:         this.player.damage,
        tabHeld:        this.input.isTabHeld(),
        ownTeam,
        enemyTeam,
        dt,
        allFrozenTeam:  this.allFrozenTeam,
        allFrozenTimer: this.allFrozenTimer,
      });
    }

    this.sceneMgr.render();
    requestAnimationFrame((t) => this.loop(t));
  }
}
