# ORBITAL BREACH

> **Vibe Game Jam 2026 Entry** · Zero-G Arena Shooter · Up to 20v20

A fast-paced multiplayer first-person shooter where teams compete to breach each other's gravity chamber in a zero-gravity arena. Grab bars to launch yourself at high velocity, coordinate with teammates to freeze enemies and secure victory.

---

## How to Play

### Objective
Be the first player to float through the enemy's **breach portal** into their gravity room. Each breach scores a point for your team.

### Controls

| Input | Action |
|-------|--------|
| `WASD` | Move (in breach room only) |
| `Space` | Jump (breach room) / Hold to charge launch (while grabbing a bar) |
| `E` | Grab nearest bar |
| `LMB` | Fire freeze pistol |
| `V` | Toggle third-person view |
| `B` | Hold selfie view |
| `Mouse` | Look — gravity FPS in breach room, free zero-G in arena |
| `Tab` | Show scoreboard |
| `Esc` | Release mouse |

### Zero-G Movement
The arena has **no gravity**. You move by:
1. **Grabbing bars** — orange cylinders on obstacles (`E` when near one)
2. **Charging** — hold `Space` while grabbing; mouse-Y adjusts launch power
3. **Launching** — release `Space` to fly in camera direction

### Damage Zones
Being hit by a freeze shot affects specific body zones:
- **Head / Body** → Frozen for the round (drifts helplessly)
- **Right Arm** → Cannot fire pistol
- **Left Arm** → Cannot grab bars
- **Legs** → Launch power capped at 75% for one leg and 50% for both legs

---

## Running Locally

### Prerequisites
- Node.js 18+

### Development

```bash
# Terminal 1 — server (ws://localhost:3001)
cd server && npm install && npm run dev

# Terminal 2 — client (http://localhost:5173)
cd client && npm install && npm run dev
```

Open **http://localhost:5173**

### Production Build

```bash
cd client && npm run build    # outputs to client/dist/
cd server && npm run build    # outputs to server/dist/
```

### Deployment
- **Client**: Vercel (configured in `vercel.json`)
- **Server**: Requires separate Node.js hosting like [Colyseus](https://colyseus.io/) — set `PORT` env var (default: 3001)

---

## Project Structure

```
Orbital-Breach/
├── .claude/                         # AI context files for Claude integration
├── .gitignore                       # Git ignore configuration
├── .impeccable.md                   # Code quality standards documentation
├── .worktreeinclude                 # Git worktree inclusion rules
├── CLAUDE.md                        # Development notes and AI prompts
├── README.md                        # This file - project documentation
├── tsconfig.test.json               # TypeScript config for test files
├── vercel.json                      # Vercel deployment configuration
├── vitest.config.ts                 # Vitest test runner configuration
│
├── client/                          # Vite + Three.js browser app (TypeScript)
│   ├── index.html                   # HTML entry point for web app
│   ├── package.json                 # Client dependencies and scripts
│   ├── package-lock.json            # Locked dependency versions
│   ├── tsconfig.json                # TypeScript configuration for client
│   ├── vite.config.ts               # Vite build configuration
│   ├── public/
│   │   └── models/                  # 3D model assets in GLB format
│   │       ├── Alien.glb            # Player character model
│   │       ├── Alien_Helmet.glb     # Helmet/head model
│   │       └── Ray Gun.glb          # Weapon visual model
│   └── src/
│       ├── main.ts                  # Application entry point - bootstraps game
│       ├── app.ts                   # Game orchestrator - high-level game logic
│       ├── camera.ts                # Dual-mode camera controller (gravity & zero-G)
│       ├── combat.ts                # Combat system stub (in progress)
│       ├── config.ts                # Global game configuration and settings
│       ├── featureFlags.ts          # Feature toggle system for experimental features
│       ├── input.ts                 # Keyboard and mouse input handler
│       ├── physics.ts               # Physics calculations and collision detection
│       ├── player.ts                # Player state machine stub
│       ├── projectile.ts            # Projectile/bullet behavior and logic
│       ├── arena/                   # Arena geometry and game mechanics
│       │   ├── arena.ts             # Main arena manager and setup
│       │   ├── bar.ts               # Grab bar implementation for zero-G movement
│       │   ├── breachRoomQueries.ts # Breach room intersection and query tests
│       │   ├── breachWalls.ts       # Breach room wall geometry and colliders
│       │   ├── goal.ts              # Breach portal mechanics and scoring
│       │   ├── obstacleCollision.ts # Obstacle collision detection system
│       │   ├── portalBars.ts        # Portal bar visualization and placement
│       │   ├── portalEnergyWall.ts  # Portal energy barrier visual effects
│       │   └── states.ts            # Arena state enum (active, paused, etc.)
│       ├── game/                    # Game loop and core systems
│       │   ├── gameApp.ts           # Main game app controller and loop manager
│       │   ├── bulletCollision.ts   # Bullet-to-player collision detection
│       │   ├── cameraYawFromBreach.ts # Camera orientation helper for breach rooms
│       │   ├── gunTuneOverlay.ts    # Debug UI for weapon tuning
│       │   ├── projectileSystem.ts  # Projectile spawn and update system
│       │   ├── roundController.ts   # Round state management and transitions
│       │   └── weaponFire.ts        # Weapon firing logic and constraints
│       ├── net/                     # Networking layer (WebSocket)
│       │   ├── client.ts            # WebSocket client network manager
│       │   ├── messages.ts          # Network message type definitions
│       │   └── reconciliation.ts    # Server reconciliation stub (in progress)
│       ├── player/                  # Player-specific mechanics
│       │   ├── localPlayer.ts       # Local player state machine and controller
│       │   ├── playerAnimationController.ts # Animation state management
│       │   ├── playerCombat.ts      # Player combat state and damage zones
│       │   ├── playerGrabPose.ts    # Grab pose animation and IK
│       │   ├── playerSpawn.ts       # Player spawn location and logic
│       │   ├── playerThirdPersonGun.ts # Third-person gun visual and positioning
│       │   └── playerTypes.ts       # TypeScript interfaces for player data
│       ├── render/                  # Rendering and UI
│       │   ├── gun.ts               # Gun visual model loader and setup
│       │   ├── hud.ts               # HUD manager and coordinate system
│       │   ├── materials.ts         # Three.js material definitions and shared materials
│       │   ├── scene.ts             # Three.js scene initialization and setup
│       │   └── hud/                 # HUD UI components
│       │       ├── hudView.ts       # Main HUD display (health, ammo, score)
│       │       └── scoreboard.ts    # Player scoreboard and team scores
│       ├── ui/                      # UI screens and menus
│       │   ├── menu.ts              # Menu controller and navigation
│       │   └── menu/
│       │       └── menuView.ts      # Main menu UI view and buttons
│       └── util/                    # Utility functions and helpers
│           ├── math.ts              # Math utility functions and vector helpers
│           └── pool.ts              # Object pool utility for garbage collection
│
├── server/                          # Node.js WebSocket server (authoritative)
│   ├── package.json                 # Server dependencies and scripts
│   ├── package-lock.json            # Locked dependency versions
│   ├── tsconfig.json                # TypeScript configuration for server
│   └── src/
│       ├── index.ts                 # Server entry point and initialization
│       ├── player.ts                # Server-side player state and data
│       ├── room.ts                  # Match/room lifecycle management
│       ├── sim.ts                   # Authoritative physics simulator
│       └── net/
│           ├── messageCodec.ts      # Message encoding and decoding
│           └── wsServer.ts          # WebSocket server setup and handlers
│
├── shared/                          # Shared TypeScript code (client & server)
│   ├── schema.ts                    # Network message types and protocol
│   ├── constants.ts                 # Game tuning parameters and balance values
│   └── arena-gen.ts                 # Procedural arena generation algorithm
│
├── docs/                            # Documentation files
│   ├── ARCHITECTURE.md              # Detailed architecture and system design
│   └── TESTING.md                   # Testing guide and test strategies
│
└── tests/                           # Unit and integration tests
    ├── arena-gen.test.ts            # Arena generation algorithm tests
    ├── breachRoomQueries.test.ts    # Breach room intersection query tests
    ├── bulletCollision.test.ts      # Bullet collision system tests
    ├── cameraYawFromBreach.test.ts  # Camera orientation calculation tests
    └── smoke.test.ts                # Basic smoke tests
```

### Networking Model
- Authoritative server at 20 Hz tick rate
- Client-side prediction with server reconciliation (in progress)
- Entity interpolation for remote players (in progress)
- Deterministic arena: same seed → identical layout on both ends

---

## Current Status

Solo play is fully functional. Multiplayer, lobby, bots, and sound are in active development for jam submission.

| Feature | Status |
|---|---|
| Zero-G movement (grab bars, launch, drift) | ✅ Done |
| Breach rooms with gravity | ✅ Done |
| Freeze pistol + hit zones | ✅ Done |
| Portal doors (open on round start) | ✅ Done |
| Procedural arena generation | ✅ Done |
| HUD (score, power bar, damage, countdown) | ✅ Done |
| Main menu | 🔄 In progress |
| Sound engine | 🔄 In progress |
| Real multiplayer (WebSocket) | 🔄 In progress |
| Lobby + ready-up | 🔄 In progress |
| Bot AI | 🔄 In progress |
| Remote player rendering | 🔄 In progress |
| Kill feed | 🔄 In progress |
| All-frozen win condition | 🔄 In progress |
| GLTF character models | ⬜ Planned |

---

## Credits

- 3D Models: [Quaternius](https://quaternius.com)
- Rendering: [Three.js](https://threejs.org)
- Build: [Vite](https://vitejs.dev)
- Entry: [Vibe Game Jam 2026](https://vibej.am/2026/)
