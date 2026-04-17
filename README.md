# ORBITAL BREACH

Zero-G arena shooter for Vibe Game Jam 2026.

The current branch focuses on local solo play with AI bots. `PLAY SOLO` now supports `1v1`, `5v5`, `10v10`, and `20v20` local skirmishes, while the later Colyseus multiplayer phase stays documented but intentionally unimplemented here.

---

## How To Play

### Objective
Float through the enemy breach portal to score for your team. Freeze shots disable enemy movement and abilities for the rest of the round.

### Controls

| Input | Action |
|---|---|
| `WASD` | Move inside breach rooms |
| `Mouse` | Look around |
| `Space` | Jump in breach rooms / hold to charge launch while grabbing |
| `E` | Grab or release a bar |
| `LMB` | Fire freeze pistol |
| `V` | Toggle third-person view |
| `B` | Hold selfie view |
| `Tab` | Show scoreboard |
| `Esc` | Release cursor |

### Solo Bot Modes

From the main menu, choose one of these local match sizes before pressing `PLAY SOLO`:

- `1v1 Skirmish`
- `5v5 Squad Clash`
- `10v10 Arena Rush`
- `20v20 Zero-G War`

The player is always placed on Team Cyan, and the remaining slots are filled with bots.

---

## Running Locally

### Prerequisites

- Node.js 18+

### Development

```bash
# Terminal 1
cd server && npm install && npm run dev

# Terminal 2
cd client && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build

```bash
cd client && npm run build
cd server && npm run build
```

### Validation Commands

```bash
npm test
.\client\node_modules\.bin\tsc.cmd -p client/tsconfig.json --noEmit
.\server\node_modules\.bin\tsc.cmd -p server/tsconfig.json --noEmit
```

---

## Architecture Summary

### Client

- `client/src/game/gameApp.ts`: top-level loop, menu flow, HUD updates, projectile updates
- `client/src/match/localMatch.ts`: local solo match coordinator for bots, rosters, scoring, and actor hit handling
- `client/src/match/botBrain.ts`: bot decision logic for bar seeking, aiming, firing, and breach-room walking
- `client/src/match/simulatedPlayerAvatar.ts`: lightweight bot rendering
- `client/src/player/localPlayer.ts`: human-controlled actor state and movement
- `client/src/game/projectileSystem.ts`: projectile visuals plus nearest-hit resolution against obstacles, portal shields, and actors

### Shared

- `shared/match.ts`: solo match-size and bot-fill helpers
- `shared/player-logic.ts`: transport-neutral hit classification, launch-power, and spawn helpers
- `shared/vec3.ts`: lightweight vector math
- `shared/schema.ts`: shared enums and HUD/network-facing types

### Server

- Current `server/` WebSocket transport remains placeholder infrastructure on this branch
- The later Colyseus migration is documented in [docs/COLYSEUS_MULTIPLAYER_IMPLEMENTATION_PLAN.md](docs/COLYSEUS_MULTIPLAYER_IMPLEMENTATION_PLAN.md)

---

## Current Status

| Feature | Status |
|---|---|
| Zero-G movement, grab, and launch | Done |
| Breach rooms and portal doors | Done |
| Freeze pistol and damage zones | Done |
| Main menu | Done |
| Local solo bot matches | Done |
| Match size selector (`1v1`, `5v5`, `10v10`, `20v20`) | Done |
| Local bot rendering and scoreboards | Done |
| WebSocket multiplayer transport | Placeholder |
| Colyseus lobby multiplayer | Planned |

---

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [AI Bots Implementation Plan](docs/AI_BOTS_IMPLEMENTATION_PLAN.md)
- [Colyseus Multiplayer Plan](docs/COLYSEUS_MULTIPLAYER_IMPLEMENTATION_PLAN.md)
