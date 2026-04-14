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
├── .claude/                         # AI context files
├── .gitignore
├── .impeccable.md
├── .worktreeinclude
├── CLAUDE.md                        # Development notes
├── README.md                        # This file
├── tsconfig.test.json               # Test TypeScript config
├── vercel.json                      # Vercel deployment config
├── vitest.config.ts                 # Test runner config
│
├── client/                          # Vite + Three.js browser app (TypeScript)
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── public/
│   │   └── models/                  # 3D assets (GLB format)
│   │       ├── Alien.glb
│   │       ├── Alien_Helmet.glb
│   │       └── Ray Gun.glb
│   └── src/
│       ├── main.ts                  # Entry point
│       ├── app.ts                   # Game orchestrator
│       ├── camera.ts                # Dual-mode camera (gravity ↔ zero-G)
│       ├── combat.ts                # Combat stub
│       ├── config.ts                # Configuration
│       ├── featureFlags.ts           # Feature toggles
│       ├── input.ts                 # Keyboard/mouse input handling
│       ├── physics.ts               # Physics calculations
│       ├── player.ts                # Player state machine stub
│       ├── projectile.ts            # Projectile logic
│       ├── arena/                   # Arena geometry & mechanics
│       │   ├── arena.ts             # Main arena manager
│       │   ├── bar.ts               # Grab bar implementation
│       │   ├── breachRoomQueries.ts # Breach room intersection tests
│       │   ├── breachWalls.ts       # Breach room wall geometry
│       │   ├── goal.ts              # Breach portal mechanics
│       │   ├── obstacleCollision.ts # Obstacle collision detection
│       │   ├── portalBars.ts        # Portal bar objects
│       │   ├── portalEnergyWall.ts  # Portal energy barrier visual
│       │   └── states.ts            # Arena state enum
│       ├── game/                    # Game loop & systems
│       │   ├── gameApp.ts           # Main game app controller
│       │   ├── bulletCollision.ts   # Bullet-player collision
│       │   ├── cameraYawFromBreach.ts # Camera orientation helper
│       │   ├── gunTuneOverlay.ts    # Debug gun tuning UI
│       │   ├── projectileSystem.ts  # Projectile spawn/update system
│       │   ├── roundController.ts   # Round state management
│       │   └── weaponFire.ts        # Weapon firing logic
│       ├── net/                     # Networking (WebSocket)
│       │   ├── client.ts            # Network client
│       │   ├── messages.ts          # Message type stubs
│       │   └── reconciliation.ts    # Server reconciliation stub
│       ├── player/                  # Player mechanics
│       │   ├── localPlayer.ts       # LocalPlayer state machine
│       │   ├── playerAnimationController.ts # Animation handling
│       │   ├── playerCombat.ts      # Player combat state
│       │   ├── playerGrabPose.ts    # Grab pose animation
│       │   ├── playerSpawn.ts       # Spawn logic
│       │   ├── playerThirdPersonGun.ts # Gun visual in third person
│       │   └── playerTypes.ts       # TypeScript interfaces
│       ├── render/                  # Rendering & UI
│       │   ├── gun.ts               # Gun visual model
│       │   ├── hud.ts               # HUD manager
│       │   ├── materials.ts         # Three.js materials
│       │   ├── scene.ts             # Scene setup
│       │   └── hud/                 # HUD components
│       │       ├── hudView.ts       # Main HUD display
│       │       └── scoreboard.ts    # Scoreboard display
│       ├── ui/                      # UI screens
│       │   ├── menu.ts              # Menu controller
│       │   └── menu/
│       │       └── menuView.ts      # Menu UI view
│       └── util/                    # Utilities
│           ├── math.ts              # Math helpers
│           └── pool.ts              # Object pool utility
│
├── server/                          # Node.js WebSocket server
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                 # Server entry point
│       ├── player.ts                # Server-side player state
│       ├── room.ts                  # Match lifecycle management
│       ├── sim.ts                   # Authoritative physics simulator
│       └── net/
│           ├── messageCodec.ts      # Message encoding/decoding
│           └── wsServer.ts          # WebSocket server setup
│
├── shared/                          # Pure TypeScript (client & server)
│   ├── schema.ts                    # Network message types
│   ├── constants.ts                 # Game tuning parameters
│   └── arena-gen.ts                 # Procedural arena generation
│
├── docs/                            # Documentation
│   ├── ARCHITECTURE.md              # Detailed architecture notes
│   └── TESTING.md                   # Testing guide
│
└── tests/                           # Unit & integration tests
    ├── arena-gen.test.ts            # Arena generation tests
    ├── breachRoomQueries.test.ts    # Breach room query tests
    ├── bulletCollision.test.ts      # Bullet collision tests
    ├── cameraYawFromBreach.test.ts  # Camera orientation tests
    └── smoke.test.ts                # Smoke test
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