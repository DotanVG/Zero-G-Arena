# ORBITAL BREACH

> **Vibe Game Jam 2026 Entry** · Zero-G Arena Shooter · Up to 20v20

A fast-paced multiplayer first-person shooter where teams compete to breach each other's gravity chamber in a zero-gravity arena. Grab bars to launch yourself at high velocity, coordinate with teammates to freeze enemies with your pistol, and breach the enemy portal to score.

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
- **Legs** → Launch power capped at 2/3

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
- **Server**: Requires separate Node.js hosting (Railway, Render, Fly.io) — set `PORT` env var (default: 3001)

---

## Architecture

```
Zero-G-Arena/
├── client/          # Vite + Three.js browser app (TypeScript)
│   └── src/
│       ├── app.ts         # Game orchestrator — loop, phases, subsystems
│       ├── player.ts      # LocalPlayer — 6-phase state machine
│       ├── camera.ts      # Dual-mode camera (gravity ↔ zero-G)
│       ├── input.ts       # Keyboard/mouse, fire cooldown, pointer lock
│       ├── arena/         # Arena geometry, obstacles, bars, portal doors
│       ├── render/        # SceneManager, HUD, materials
│       ├── net/           # NetClient (WebSocket stub → real in progress)
│       └── ui/            # Screens (menu, lobby, pause — in progress)
├── server/          # Node.js WebSocket server
│   └── src/
│       ├── index.ts   # WS server entry
│       ├── room.ts    # Match lifecycle (lobby → countdown → playing → round-end)
│       └── sim.ts     # Authoritative physics sim
└── shared/          # Pure TypeScript — imported by both client and server
    ├── schema.ts       # All network message types
    ├── constants.ts    # Game tuning (FIRE_RATE, GRAB_RADIUS, ARENA_SIZE…)
    └── arena-gen.ts    # Procedural arena layout (Mulberry32 RNG)
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

- 3D Models: [Quaternius](https://quaternius.com) via vibejam-starter-pack
- Rendering: [Three.js](https://threejs.org)
- Build: [Vite](https://vitejs.dev)
- Entry: [Vibe Game Jam 2026](https://vibejam.com)
