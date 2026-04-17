# AI Bots Implementation Plan

This branch implements the local solo-with-bots phase and deliberately stops short of online multiplayer.

---

## Goals

- Keep `PLAY SOLO` local-only
- Support `1v1`, `5v5`, `10v10`, and `20v20` from the main menu
- Fill remaining slots with bots, with the human fixed to Team Cyan
- Add transport-neutral helpers that can be reused by the later Colyseus branch
- Keep networking placeholder code unchanged on this branch

---

## Implemented Shape

### Match Flow

- Main menu now includes a solo match-size selector
- Starting a game creates a local match config and fills rosters with bots
- Each new round regenerates the arena, resets the human player, and resets all bots
- Team score is tracked locally across rounds

### Bot Runtime

- Bots are rendered as lightweight non-human actors
- Bot decision logic handles:
  - bar selection toward the enemy portal
  - grab -> aim -> launch flow
  - breach-room walking toward the exit
  - simple enemy targeting and shooting
- Projectile hits now resolve against actors as well as geometry

### Shared Reuse Surface

- `shared/match.ts`: solo match-size and bot-fill helpers
- `shared/player-logic.ts`: hit classification, damage application, launch-power, spawn helpers
- `shared/vec3.ts`: plain vector math

These are intentionally transport-neutral so the future server/client multiplayer work can adopt them without importing Three.js scene code.

---

## Non-Goals For This Branch

- No room browser
- No matchmaking
- No Colyseus dependencies
- No online lobby flow
- No reconnect or deployment hardening

---

## Validation

Current branch validation after implementation:

- `npm test`
- `.\client\node_modules\.bin\tsc.cmd -p client/tsconfig.json --noEmit`
- `.\server\node_modules\.bin\tsc.cmd -p server/tsconfig.json --noEmit`
- `cd client && npm run build`

All of the above pass on this branch.
