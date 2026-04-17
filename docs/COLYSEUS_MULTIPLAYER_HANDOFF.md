# Colyseus Multiplayer Handoff

This document explains what is already implemented on `feature/add-colyseus-multiplayer`, how to run and test it locally, and what Claude should do next to continue the multiplayer rollout.

## Current Branch Status

The branch already includes the first Colyseus multiplayer slice:

- `PLAY ONLINE` now exists beside `PLAY SOLO`
- the client joins one Colyseus room named `orbital_lobby`
- the server exposes a Colyseus-backed lobby room
- the lobby supports:
  - join
  - roster display
  - ready / unready
  - switch team
  - team-size changes
  - fill bots
  - clear bots
  - countdown into a timed round shell
  - return to lobby after round end
- solo offline mode still uses the existing local match path

This is intentionally only the first milestone. Online gameplay is not authoritative yet. The online room currently manages lobby flow and a timed round shell, but it does not yet drive live player movement, real actor snapshots, shared projectile simulation, or full round resolution through the match layer.

## Key Files

- Shared contract: [shared/multiplayer.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/shared/multiplayer.ts>)
- Server entry: [server/src/index.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/server/src/index.ts>)
- Colyseus room: [server/src/colyseus/OrbitalLobbyRoom.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/server/src/colyseus/OrbitalLobbyRoom.ts>)
- Colyseus state: [server/src/colyseus/state.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/server/src/colyseus/state.ts>)
- Client network layer: [client/src/net/client.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/client/src/net/client.ts>)
- Lobby overlay UI: [client/src/ui/multiplayerLobby.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/client/src/ui/multiplayerLobby.ts>)
- Menu wiring: [client/src/ui/menu.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/client/src/ui/menu.ts>)
- App mode routing: [client/src/game/gameApp.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/client/src/game/gameApp.ts>)
- Regression test: [tests/multiplayer.test.ts](</B:/Code/Github Clones/DotanVG/Zero-G-Arena/tests/multiplayer.test.ts>)

## Dependencies Already Added

Server:

- `@colyseus/core`
- `@colyseus/schema`
- `@colyseus/ws-transport`
- `express`

Client:

- `colyseus.js`

These are already recorded in the package files and lockfiles on this branch.

## How To Run Locally

Start the server:

```powershell
cd "B:\Code\Github Clones\DotanVG\Zero-G-Arena\server"
npm run dev
```

Start the client in another terminal:

```powershell
cd "B:\Code\Github Clones\DotanVG\Zero-G-Arena\client"
npm run dev
```

If port `3001` is already occupied, start the server on another port:

```powershell
cd "B:\Code\Github Clones\DotanVG\Zero-G-Arena\server"
$env:PORT="3011"
npm run dev
```

Then start the client with an explicit server URL:

```powershell
cd "B:\Code\Github Clones\DotanVG\Zero-G-Arena\client"
$env:VITE_SERVER_URL="http://localhost:3011"
npm run dev
```

## Quick Server Check

The server exposes a health route:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

Expected response shape:

```json
{"ok":true,"transport":"colyseus","room":"orbital_lobby"}
```

## What Claude Should Test Next

Claude should verify the following in-browser flow after starting both client and server:

1. Open the game and confirm the main menu shows both `PLAY SOLO` and `PLAY ONLINE`.
2. Click `PLAY ONLINE`.
3. Confirm the Colyseus lobby overlay appears.
4. Confirm the local player joins one of the teams automatically.
5. Change team size and verify the lobby updates.
6. Use `Fill Bots` and confirm both teams populate correctly.
7. Switch teams and confirm the player moves sides.
8. Ready up and confirm the ready state changes.
9. With both teams filled and all humans ready, confirm countdown begins.
10. Confirm the timed round enters `PLAYING`.
11. Confirm the room returns to `LOBBY` after the round shell ends.
12. Leave the lobby and confirm the game returns to the main menu cleanly.

If Claude uses browser automation or a playtest workflow, this is the right moment to do it.

## Commands Claude Should Re-Run While Continuing

Server build:

```powershell
cd "B:\Code\Github Clones\DotanVG\Zero-G-Arena\server"
npm run build
```

Client build:

```powershell
cd "B:\Code\Github Clones\DotanVG\Zero-G-Arena\client"
npm run build
```

Repo tests:

```powershell
cd "B:\Code\Github Clones\DotanVG\Zero-G-Arena"
npx vitest run
```

## Known Limitations Right Now

- online mode does not yet run real shared actor simulation
- no authoritative movement sync yet
- no remote player rendering yet
- no live projectile / hit / freeze / breach sync in multiplayer yet
- the online round is currently a timed shell, not the final gameplay loop
- old raw WebSocket server files still exist in the repo as leftover legacy code and can be removed later once the Colyseus path fully replaces them

## Recommended Next Implementation Order For Claude

1. Keep `PLAY SOLO` fully isolated and working offline.
2. Reuse `LocalMatch` ideas and shared helpers instead of creating a second set of gameplay rules for online mode.
3. Introduce authoritative room-owned player snapshots and actor state.
4. Render remote players using the same alien/pistol presentation path already used for solo bots and the local player.
5. Replace the timed round shell with actual round state driven by shared gameplay outcomes.
6. Wire online HUD state from room snapshots instead of local solo rosters when in online mode.
7. Only after the above is stable, remove the legacy raw `ws` transport code.

## Notes For Claude

- Do not collapse solo and online into one messy path inside `gameApp.ts`; keep the mode boundary explicit.
- Keep the shared contract in `shared/multiplayer.ts` as the source of truth for lobby messages and room-phase expectations.
- Prefer updating the Colyseus room and client overlay incrementally, then verifying in-browser after each meaningful step.
- If the server port is busy, use `PORT` plus `VITE_SERVER_URL` rather than changing code just for local testing.
