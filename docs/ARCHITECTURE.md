# Orbital Breach — Architecture Reference

Post-refactor module map (as of `project-refactor`, commit `db5e8eb`).
Each entry lists a module's **single responsibility** and its key exports.
See `CLAUDE.md` for invariants, gotchas, and session workflow.

---

## Client — `client/src/`

### `game/` — game orchestration

| File | Responsibility | Key export |
|---|---|---|
| `gameApp.ts` | Top-level `App` class; owns every subsystem, runs the 60fps loop | `App` |
| `roundController.ts` | LOBBY→COUNTDOWN→PLAYING→ROUND_END state machine + timer | `RoundController` |
| `projectileSystem.ts` | Visual projectile list: spawn, tick, cull, dispose | `ProjectileSystem` |
| `weaponFire.ts` | Pure shot construction from camera + player state | `buildShotFromCamera` |
| `cameraYawFromBreach.ts` | Pure yaw angle when spawning into a breach room | `cameraYawFacingBreachOpening` |
| `gunTuneOverlay.ts` | Dev DOM overlay for third-person gun (feature flag gated) | `GunTuneOverlay` |

`gameApp.ts` is the only file that imports from all other subsystems. Nothing else
should import across subsystem boundaries (e.g. `player/` must not import from `game/`).

### `player/` — local player model

| File | Responsibility | Key export |
|---|---|---|
| `localPlayer.ts` | `LocalPlayer` facade — 6-phase state machine, physics integration | `LocalPlayer` |
| `playerTypes.ts` | Shared type definitions | `HitZone`, `PoseBoneName`, `AnimatedRig` |
| `playerAnimationController.ts` | AnimationMixer crossfades: idle, run, jump, grab, death | `PlayerAnimationController` |
| `playerCombat.ts` | Hit-zone classification from bone name | `classifyHitZone` (pure) |
| `playerGrabPose.ts` | Bar-hold bone Euler offsets + grip measurement | `applyBarHoldPose`, `measureLeftHandGripOffset` |
| `playerThirdPersonGun.ts` | Third-person gun rig: attach, muzzle position, tuning | `ThirdPersonGun` |
| `playerSpawn.ts` | Player reset for new rounds | `resetForNewRound` |

`client/src/player.ts` is a thin re-export: `export { LocalPlayer } from './player/localPlayer'`.

### `arena/` — arena geometry

| File | Responsibility | Key export |
|---|---|---|
| `arena.ts` | Arena facade: layout, obstacles, portals, bars, walls | `Arena` |
| `breachRoomQueries.ts` | Point-in-room tests for win condition & gravity switch | `isInBreachRoom`, `isDeepInBreachRoom` (pure, tested) |
| `breachWalls.ts` | Build 5-wall enclosure for a breach room | `buildBreachWalls` (pure) |
| `obstacleCollision.ts` | AABB bounce for floating obstacles | `bounceAgainstBoxes` (pure) |
| `portalBars.ts` | Place grab bars on arena side of each portal opening | `placePortalArenaBars` |

### `render/hud/` — HUD DOM

| File | Responsibility | Key export |
|---|---|---|
| `hudView.ts` | Inject HUD DOM once; return typed element refs | `createHudView`, `HudElements` |
| `scoreboard.ts` | Build scoreboard HTML string from player lists | `buildScoreboardHtml` (pure) |
| `../hud.ts` | HUD controller: map `HudState` → DOM updates every frame | `HUD`, `HudState` |

### `ui/menu/` — main menu

| File | Responsibility | Key export |
|---|---|---|
| `menuView.ts` | Inject menu DOM + CSS animations; return element refs | `createMenuView`, `MenuElements` |
| `../menu.ts` | Menu controller: show/hide/fadeOut/onPlay | `MainMenu` |

---

## Server — `server/src/`

### `net/` — network transport

| File | Responsibility | Key export |
|---|---|---|
| `wsServer.ts` | Boot WebSocket server; route connection/message/close/error | `startWsServer` |
| `messageCodec.ts` | Wire-format adapters between raw WS frames and typed objects | `parseClientMsg`, `sendState`, `sendEvent` |

`server/src/index.ts` is a 15-line bootstrap — `Room` + `startWsServer` + log.
All domain logic stays in `room.ts` / `sim.ts`; `wsServer.ts` contains no game state.

---

## Shared — `shared/`

| File | Responsibility |
|---|---|
| `arena-gen.ts` | `generateArenaLayout(seed)` — deterministic Mulberry32 RNG, symmetric obstacles (tested) |
| `schema.ts` | Message types contract between client and server — change both sides atomically |
| `constants.ts` | All numeric tuning values (FIRE_RATE, GRAB_RADIUS, TICK_RATE, …) |
| `physics.ts` | `applyShotSpread` and shared physics math |
| `player-logic.ts` | Shared movement/phase helpers used by both client and server |
| `vec3.ts` | Lightweight Vec3 math with no Three.js dependency |

---

## Key invariants — never change without understanding the consequences

| Invariant | Location | Why it matters |
|---|---|---|
| `InputManager.consumeFire()` — LMB + fire-rate cooldown | `client/src/input.ts` | Previous charge-based attempts broke shooting entirely |
| `player.phase = 'BREACH'` on portal entry (not FLOATING) | `player/localPlayer.ts` | Triggers gravity camera mode; stays FLOATING = camera never switches |
| `cam.setZeroGMode(phase !== 'BREACH')` runs every frame | `game/gameApp.ts` | Must execute before `consumeMouseDelta` each tick |
| `input.setAimingMode(active)` diverts `mouseDy → aimDy` | `client/src/input.ts` | Mouse Y = charge aim power during AIMING phase |
| `TICK_RATE = 20 Hz` | `shared/constants.ts` | Changing it requires updating interpolation buffer delay |
| `shared/schema.ts` is the client↔server contract | `shared/schema.ts` | Must update both sides atomically |
