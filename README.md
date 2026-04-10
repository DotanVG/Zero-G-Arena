# ORBITAL BREACH

> **Vibe Game Jam 2026 Entry** · Zero-G Arena Shooter · Up to 20v20

A fast-paced multiplayer first-person shooter where teams compete to breach each other's gravity chamber in a zero-gravity arena. Grab bars to launch yourself at high velocity, coordinate with teammates to freeze enemies with your pistol, and breach the enemy portal to score.

---

## How to Play

### Objective
Be the first player to enter the enemy's **breach room** (the gravity chamber behind their portal). Each breach scores a point.

### Controls

| Input | Action |
|-------|--------|
| `WASD` | Move (in breach room) |
| `Space` | Jump (breach room) / Hold to charge launch (when grabbing bar) |
| `E` | Grab nearest bar |
| `LMB` | Fire freeze pistol |
| `Mouse` | Look around (gravity FPS in breach room, free zero-G in arena) |
| `Tab` | Show scoreboard |
| `Esc` | Release mouse |

### Zero-G Movement
The arena has **no gravity**. You move by:
1. **Grabbing bars** — orange cylinders mounted on obstacles (`E` when near one)
2. **Aiming** — hold `Space` while grabbing, mouse-Y charges launch power
3. **Launching** — release `Space` to fly in camera direction at full speed

### Damage Zones
Being hit affects specific body zones:
- **Head / Body** → Frozen for the round (drifts helplessly)
- **Right Arm** → Cannot fire pistol
- **Left Arm** → Cannot grab bars
- **Legs** → Launch power capped at 2/3

### Match Sizes
- **5v5** — Quick, tight action
- **10v10** — Medium chaos
- **20v20** — Maximum mayhem (AI bots fill empty slots)

---

## Running Locally

### Prerequisites
- Node.js 18+
- npm

### Development

```bash
# Terminal 1 — server
cd server && npm install && npm run dev

# Terminal 2 — client
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
- **Server**: Requires separate Node.js hosting (Railway, Render, Fly.io)
  - Set `PORT` env var (default: 3001)

---

## Architecture

```
Zero-G-Arena/
├── client/          # Vite + Three.js browser app (TypeScript)
│   └── src/
│       ├── app.ts              # Game orchestrator (networking + game loop)
│       ├── player.ts           # LocalPlayer — 6-phase state machine
│       ├── camera.ts           # Dual-mode camera (gravity ↔ zero-G)
│       ├── remote-player.ts    # Remote player with entity interpolation
│       ├── arena/              # Arena geometry, obstacles, bars, portals
│       ├── net/                # NetClient, reconciliation, interpolation
│       ├── render/             # Scene, HUD, materials, model-loader, PlayerModel
│       └── ui/                 # MainMenu, Lobby, KillFeed, Settings
├── server/          # Node.js WebSocket server
│   └── src/
│       ├── index.ts       # WebSocket server + RoomManager
│       ├── room.ts        # Room (lobby→countdown→playing→round-end)
│       ├── sim.ts         # Authoritative simulation (bar-grab-launch physics)
│       ├── player.ts      # ServerPlayer — full 6-phase model
│       ├── arena-query.ts # SharedArenaQuery (no Three.js)
│       ├── projectile.ts  # Server projectile + hit detection
│       └── bot/           # AI bots (navigation, targeting, tactics)
└── shared/          # Pure TypeScript (no external dependencies)
    ├── schema.ts       # All network message types
    ├── constants.ts    # Game tuning constants
    ├── vec3.ts         # Plain-object Vec3 math utilities
    ├── physics.ts      # Shared physics (integrateZeroG, bounceArena, etc.)
    ├── arena-gen.ts    # Deterministic procedural arena (Mulberry32 RNG)
    └── player-logic.ts # Hit zones, damage, SharedPlayerState
```

### Networking Model
- **Authoritative server** at 20Hz tick rate
- **Client-side prediction** — local player runs physics locally, reconciles on server state
- **Entity interpolation** — remote players buffered 100ms, interpolated between snapshots
- **Deterministic arena** — same seed → identical layout on both ends (Mulberry32 RNG)

### Player Models
- Base: **Character_Soldier.gltf** (Quaternius low-poly, via vibejam-starter-pack)
- Grey armor base + team neon color overlay
- Team 0: Cyan `#00ffff` | Team 1: Magenta `#ff00ff`
- Weapon: Pistol.gltf (Quaternius)

---

## Game Design Notes

### Arena Generation
Procedural via seeded Mulberry32 RNG. Each round generates a new layout.
- Arena: 40×40×40 unit cube, wireframe edges
- 14–22 obstacles per arena (mirrored for symmetry)
- 3 archetypes: box, plate, beam
- 3–8 bars per obstacle (for launching)

### AI Bots
Fill empty match slots, navigate via bar-grab-launch (same mechanics as players), coordinate team attack/defend via TeamTactics.

---

## Credits

- 3D Models: [Quaternius](https://quaternius.com) via vibejam-starter-pack
- Rendering: [Three.js](https://threejs.org)
- Build: [Vite](https://vitejs.dev)
- Entry: [Vibe Game Jam 2026](https://vibejam.com)
