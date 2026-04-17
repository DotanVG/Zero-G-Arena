# Orbital Breach Architecture

This document describes the post-AI-bots branch structure.

---

## Client

### `client/src/game`

| File | Responsibility |
|---|---|
| `gameApp.ts` | Main loop, menu start flow, round resets, HUD sync, projectile updates |
| `projectileSystem.ts` | Visual projectiles plus nearest-hit resolution against obstacles, portal barriers, and actors |
| `projectileActorCollision.ts` | Pure segment-vs-sphere collision helper for actor hits |
| `weaponFire.ts` | Build human shot origin and direction from the camera and gun model |
| `roundController.ts` | Countdown and round-end timing |

### `client/src/match`

| File | Responsibility |
|---|---|
| `localMatch.ts` | Local solo match authority for bot fill, bot state, scoring, and roster building |
| `botBrain.ts` | Bot navigation and combat decisions |
| `arenaQueryAdapter.ts` | Adapter from Three.js arena queries to transport-neutral shared helpers |
| `rosterView.ts` | Pure HUD roster shaping for own team vs enemy team |
| `simulatedPlayerAvatar.ts` | Lightweight non-human actor rendering |

### `client/src/player`

| File | Responsibility |
|---|---|
| `localPlayer.ts` | Human-controlled player movement, bar grabbing, launching, damage, and breach scoring |
| `playerCombat.ts` | Pure hit-zone classification used by human-facing logic |
| `playerSpawn.ts` | Breach-room spawn helpers |

### `client/src/arena`

| File | Responsibility |
|---|---|
| `arena.ts` | Arena facade for layout loading, obstacle collision, breach-room queries, portal barriers, and bar lookup |
| `breachRoomQueries.ts` | Pure breach-room inside/depth checks |
| `obstacleCollision.ts` | Pure obstacle bounce helper |

### `client/src/ui` and `client/src/render`

| File | Responsibility |
|---|---|
| `ui/menu.ts` / `ui/menu/menuView.ts` | Main menu controller and DOM view, including solo match-size selection |
| `render/hud.ts` | HUD orchestration |
| `render/hud/scoreboard.ts` | Pure scoreboard HTML builder with bot labels |

---

## Shared

| File | Responsibility |
|---|---|
| `shared/match.ts` | Solo match-size types and bot-fill helpers |
| `shared/player-logic.ts` | Transport-neutral hit classification, launch-power calculation, and breach spawn logic |
| `shared/vec3.ts` | Lightweight vector math with no Three.js dependency |
| `shared/schema.ts` | Shared player/game types used by both local solo and future multiplayer work |
| `shared/constants.ts` | Shared tuning values and bot-name pool |

---

## Server

The current `server/` directory still represents placeholder transport infrastructure on this branch:

- `server/src/net/wsServer.ts` and `server/src/net/messageCodec.ts` stay transport-only
- `server/src/room.ts` and `server/src/sim.ts` are not expanded to power the bot phase
- The later Colyseus lobby migration is intentionally deferred to the separate multiplayer branch

---

## Branch Intent

- `feature/add-ai-bots`: local-only solo match flow with reusable shared gameplay helpers
- `feature/add-colyseus-multiplayer`: future lobby-first online transport branch, refreshed from `staging` after AI bots merge

The important boundary is that gameplay helpers can be shared later, but this branch does not introduce online room flow, matchmaking, or Colyseus dependencies.
