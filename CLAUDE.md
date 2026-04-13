# CLAUDE.md — Orbital Breach Dev Guide

This file is tracked. It exists to orient Claude Code at the start of every session.

---

## What this project is

**Orbital Breach** — a browser-based zero-gravity FPS for Vibe Game Jam 2026 (deadline May 1, 2026).
Two teams in a floating arena fight to breach the enemy's gravity room. Shots freeze enemies. If all enemies are frozen, their base is vulnerable. First team to physically walk through the enemy's breach portal scores.

Stack: Three.js + TypeScript client (Vite), Node.js + WebSocket server (ts-node-dev), shared/ types.

---

## Claude project files

- `CLAUDE.md` â€” shared repo memory and workflow instructions
- `CLAUDE.local.md` â€” optional private repo-specific memory for the current developer; keep it gitignored
- `.claude/settings.json` â€” shared Claude project settings, plugins, and hooks
- `.claude/settings.local.json` â€” local-only Claude settings; keep it gitignored
- `.claude/skills/` â€” repo-local slash commands and reusable workflows
- `.claude/hooks/` â€” scripts referenced by `.claude/settings.json`
- `.worktreeinclude` â€” local-only Claude files that should be copied into new Claude worktrees when those files exist locally

If you use Claude worktrees, keep your private repo-specific files in `CLAUDE.local.md` and `.claude/settings.local.json` so `.worktreeinclude` can bring them along automatically.

---

## Repo layout

```
client/          Vite + TypeScript browser app
  src/
    app.ts             → re-exports game/gameApp.App
    main.ts            Entry point: new App().start()
    player.ts          → re-exports player/localPlayer.LocalPlayer
    input.ts           InputManager — keyboard/mouse, fire cooldown, pointer lock
    camera.ts          CameraController — zero-G free-look + breach-room gravity mode
    physics.ts         integrateZeroG, integrateBreachRoom, bounceArena
    combat.ts          Hit detection helpers
    projectile.ts      Visual-only projectile (client-side)
    game/
      gameApp.ts       App composition — owns loop, all subsystems
      roundController.ts  LOBBY→COUNTDOWN→PLAYING→ROUND_END state machine + timer
      projectileSystem.ts Scene-owned projectile lifecycle
      weaponFire.ts    Pure buildShotFromCamera helper
      cameraYawFromBreach.ts  Pure yaw math for breach room entry (tested)
      gunTuneOverlay.ts   Dev overlay (feature flag gated)
    player/
      localPlayer.ts   LocalPlayer facade — full public API
      playerTypes.ts   HitZone, PoseBoneName, AnimatedRig
      playerAnimationController.ts  AnimationMixer crossfades
      playerCombat.ts  classifyHitZone pure function
      playerGrabPose.ts   BAR_HOLD_* Eulers, measureLeftHandGripOffset
      playerThirdPersonGun.ts  ThirdPersonGun rig + tuning
      playerSpawn.ts   Spawn initialisation
    arena/
      arena.ts         Arena facade
      breachRoomQueries.ts  isInBreachRoom / isDeepInBreachRoom (pure, tested)
      breachWalls.ts   buildBreachWalls (pure)
      obstacleCollision.ts  bounceAgainstBoxes (pure)
      portalBars.ts    placePortalArenaBars
      bar.ts / goal.ts / states.ts  (pre-existing)
    render/
      scene.ts         SceneManager
      hud.ts           HUD controller (HudState → DOM updates)
      gun.ts           FPS gun viewmodel
      materials.ts     Three.js materials
      hud/
        hudView.ts     createHudView() — injects DOM, returns HudElements refs
        scoreboard.ts  buildScoreboardHtml() pure string builder
    ui/
      menu.ts          MainMenu controller
      menu/
        menuView.ts    createMenuView() — DOM + CSS animations
    net/               NetClient (stub; real implementation in Feature 5)
    audio/             SoundEngine (Feature 2)
server/          Node.js WebSocket server
  src/
    index.ts           15-line bootstrap (Room + startWsServer + log)
    room.ts            Match lifecycle: lobby → countdown → playing → round_end
    sim.ts             Authoritative physics tick (runs at TICK_RATE hz)
    player.ts          ServerPlayer
    bot/brain.ts       Bot AI tick
    projectile.ts      Server-side projectile sim
    arena-query.ts     Arena geometry queries (bar positions, breach rooms)
    net/
      wsServer.ts      startWsServer() — WS lifecycle only, no domain logic
      messageCodec.ts  parseClientMsg / sendState / sendEvent — wire format only
shared/          Imported by both client and server
  schema.ts      All message types, PlayerNetState, GamePhase, DamageState
  constants.ts   Tuning values (FIRE_RATE, GRAB_RADIUS, ARENA_SIZE, etc.)
  physics.ts     applyShotSpread, shared physics helpers
  arena-gen.ts   Deterministic arena layout (Mulberry32 RNG, tested)
  player-logic.ts Shared movement / phase logic
  vec3.ts        Lightweight vec3 math
docs/            Tracked architecture + testing reference
  ARCHITECTURE.md  Post-refactor module map with responsibilities
  TESTING.md       Vitest setup, patterns, what to test
```

---

## How to run

```bash
# Single command — starts server then client (from repo root)
npm run dev
```

Server starts on `ws://localhost:3001`, client on `http://localhost:5173`.
Vite proxies `/ws` → `ws://localhost:3001` automatically (configured in `client/vite.config.ts`).
`--kill-others` means closing the terminal (Ctrl+C) stops both processes.

If you need them separately:
```bash
cd server && npm run dev   # game server
cd client && npm run dev   # Vite dev server
```

```bash
# TypeScript check — ALWAYS run before committing
cd client && node_modules/.bin/tsc --noEmit
cd server && node_modules/.bin/tsc --noEmit
```

> Do NOT use `npx tsc` — TypeScript is a local dep. Always use `node_modules/.bin/tsc`.
> Root `package.json` and `node_modules/` are gitignored — local dev tooling only.

Vite proxies `/ws` → `ws://localhost:3001` so the client always uses the same origin. No CORS config needed locally.

---

## Branching strategy

**Never work directly on master.** Every feature gets its own branch.

```bash
# Start a new feature
git checkout master
git pull
git checkout -b feature/<feature-name>   # e.g. feature/sound-engine

# When the feature is done and TS compiles clean:
git push -u origin feature/<feature-name>
# Then open a PR → merge into master
```

Branch naming: `feature/<kebab-name>` matching the PlanTracker feature name (e.g. `feature/main-menu`, `feature/real-netclient`, `feature/kill-feed`).

Master must always be in a working, playable state.

---

## How to commit

Only commit when a feature is complete and TypeScript compiles clean on both client and server. Mark the feature ✅ DONE in PlanTracker.md before committing. Include the PlanTracker update in the same commit.

```bash
# Stage specific files — never git add -A blindly
git add client/src/... server/src/... shared/...
# PlanTracker is gitignored — never add it, but it stays on disk
git commit -m "feat: <feature name> — <one-line description>"
```

---

## Task tracker

**Read `PlanTracker.md` at the start of every session.**
It lists all planned features in order, with status (⬜ / 🔄 / ✅ DONE).
Work one feature at a time. Do not start Feature N+1 before Feature N is ✅.
When a feature is done: update PlanTracker.md → commit all code + the updated file.

> PlanTracker.md is gitignored so it never hits the remote. It lives on disk only.

---

## Architecture invariants — do NOT break these

### Shooting mechanism (master's version — working)
```ts
// input.ts — consumeFire() handles both LMB held + fire rate cooldown
public consumeFire(): boolean {
  if (!this.keys.has('MouseLeft')) return false;
  return this.canFire();   // sets fireCooldown = 1/FIRE_RATE on true
}

// app.ts game loop
if (this.phase === 'PLAYING' && this.player.canFire() && this.input.consumeFire()) {
  // spawn projectile
}
```
Never replace this with a charge-based pending-fire system. Previous attempts broke shooting entirely.

### Breach win behavior (master's version — working)
When a player floats through the enemy's open portal, `updateFloating()` in `player.ts` runs:
```ts
// Enter enemy breach room → BREACH phase (gravity activates) + round win
this.currentBreachTeam = enemyTeam;
this.phase = 'BREACH';
this.phys.vel.y = 0;
this.kills++;
this.onRoundWin?.(this.team);
```
Do NOT change this to stay in FLOATING. The camera must switch to gravity mode (BREACH) on entry.

### Camera modes
`CameraController.setZeroGMode(true)` — free quaternion look (arena)
`CameraController.setZeroGMode(false)` — yaw+pitch gravity mode (breach room)
Toggled every frame in app.ts: `this.cam.setZeroGMode(this.player.phase !== 'BREACH')`

### Mouse Y during AIMING
`InputManager.setAimingMode(active)` diverts `mouseDy` → `aimDy` when in AIMING phase.
`consumeAimDelta()` returns the aimDy value for launch power control.
This is intentional — mouse up/down = charge aim power. Do not remove.

### Shared/ compiles into both client and server
The `shared/` folder is included via tsconfig `include` on both sides.
`shared/schema.ts` is the contract between them — change both sides atomically.

---

## Archive branches (local only, not on origin)

All previous dev work is preserved here for reference:

| Branch | Contains |
|---|---|
| `archive/dev` | Full feature set: menu, lobby, real NetClient, server Room/Sim, bots, sound, HUD polish, interpolation, kill feed |
| `archive/merge-selective-dev` | Partially-merged attempt — **do not use**, only for reference |

To read any archived file:
```bash
git show archive/dev:client/src/ui/menu.ts
git show archive/dev:server/src/bot/brain.ts
# etc.
```

When porting a feature from the archive, always:
1. Read the archived file in full first
2. Identify what to keep vs. what conflicts with master's invariants
3. Port it to a new file or modify an existing one — never blind-copy-paste

---

## Key design decisions

**No GLTF player models yet** — `client/public/assets/characters/Character_Soldier.gltf` exists but is NOT loaded. Remote players render as sphere meshes. GLTF integration is Feature 18 (stretch goal). Do not attempt until everything else is done.

**DOM-based HUD and UI** — all menus, HUD, kill feed are `div` elements injected into `document.body`. No React/Vue. The Three.js canvas renders behind at z-index 0. UI layers sit above at z-index 100+.

**Solo mode vs. multiplayer** — master currently runs solo only (NetClient is a stub). Features 5–8 add real multiplayer. Solo mode must continue to work after multiplayer is added (`isMultiplayer = false` path).

**Server is authoritative** — client does local prediction for responsiveness, but server's physics tick is the truth. Reconciliation (Feature 9) replays inputs after server correction.

**TICK_RATE = 20hz** — server sends state 20 times/second. Client renders at 60fps with interpolation. Do not change TICK_RATE without updating the interpolation buffer delay.

**Teams** — 0 = Cyan, 1 = Magenta. Team color: `team === 0 ? 0x00ffff : 0xff00ff`.

---

## Testing

Tests live in `tests/` (and optionally co-located as `shared/**/*.test.ts`).
Run all from the repo root — **not** from client/ or server/:

```bash
npm test              # single run (vitest run)
npm run test:watch    # watch mode during development
```

The harness is **vitest** (`vitest.config.ts` at root) with `environment: 'node'` — no DOM,
no browser APIs. Three.js is aliased to the client's ES module build so pure geometry
helpers can import it without a WebGL context.

### Required: test every new pure function

**Every new feature or addition that contains a pure (side-effect-free) function MUST include
vitest tests.** When writing a helper that does math or logic with no DOM/scene/network
dependencies, add a test file in `tests/` (or co-locate in `shared/`) before the commit.

If Playwright integration tests are needed (DOM interactions, animation timing) add them under
`tests/e2e/` and configure via `playwright.config.ts` at the repo root.

Good candidates for unit tests:
- Everything in `shared/` (arena-gen, physics helpers, player-logic)
- `client/src/arena/breachRoomQueries.ts`, `obstacleCollision.ts`
- Pure helpers in `client/src/game/` (cameraYawFromBreach, bulletCollision, weaponFire)

Do NOT test Three.js scene objects, DOM manipulation, or WebSocket I/O — those require
browser/network context. Test the pure logic they delegate to.

### Conventions

- Explicit imports required (`globals: false` in vitest.config.ts):
  `import { describe, it, expect } from 'vitest';`
- One `describe` block per exported function or module
- Name tests as plain statements: `'is deterministic for the same seed'`
- Import paths are relative to the **repo root**: `'../shared/arena-gen'`,
  `'../client/src/arena/breachRoomQueries'`

See `docs/TESTING.md` for full guide and examples.

---

## Common gotchas

- `git show archive/dev:path` requires the path from repo root, not from `client/`
- Server tsconfig `rootDir: ".."` means it compiles from the monorepo root — server imports `../../shared/...`
- `node_modules/.bin/tsc` not `npx tsc` — TypeScript is a local dep without global install
- Vite uses `moduleResolution: Bundler` — import paths don't need `.js` extensions
- Server uses `moduleResolution: Node` + CommonJS — different rules from client
- `LAUNCH_AIM_SENSITIVITY` controls how much mouse Y moves launch power — currently `0.05` (tuned)
- Portal doors: closed during COUNTDOWN, open at start of PLAYING. `arena.setPortalDoorsOpen(bool)`

---

## Claude Skills

These skills live under `.claude/skills/` and are available in the repo.

- `web-game-foundations` for architecture, module boundaries, and runtime conventions
- `three-webgl-game` for plain Three.js runtime work, cameras, loaders, and rendering
- `web-3d-asset-pipeline` for GLB/glTF cleanup, optimization, and validation
- `/preflight` to run the repo ship checks before commit, push, or PR
- `/golden-path` to run the manual Orbital Breach gameplay smoke checklist
- `/ship-staging` to package and push intended changes to `staging`
- `/port-from-archive` to recover features from archive branches without breaking current invariants
- `/arena-debug` to debug gameplay, camera, collision, and projectile issues
- `/claude-audit` to verify the repo Claude setup is still aligned

When working in this repo, prefer those local skills for 3D or browser-game changes.

## Claude Hooks

Shared Claude hooks live in `.claude/settings.json` and execute scripts from `.claude/hooks/`.

- Post-edit validation: after Claude edits code files, run targeted typechecks or tests in the background and wake Claude if one fails
- Git ship guard: before `git commit` or `git push`, block the command if tracked files still have unstaged changes or the repo preflight fails

## README upkeep

`README.md` has a **Current Status** table near the bottom. When a feature moves to ✅ Done, update that row before committing. If a feature adds a new user-facing capability (new controls, new match size, new screen), also update the relevant section above the table.

---

## Testing checklist (before any commit)

1. `cd client && node_modules/.bin/tsc --noEmit` — zero errors
2. `cd server && node_modules/.bin/tsc --noEmit` — zero errors
3. `npm test` (from repo root) — all tests green
4. Start client dev server, open browser, verify:
   - The feature being added works on the golden path
   - Shooting (LMB) still fires correctly
   - Bar grab (E) + launch (Space) still works
   - Breach win (float through enemy portal) still works
   - No console errors
