# Colyseus Multiplayer Implementation Plan

This document is intentionally planning-only on `feature/add-ai-bots`. The actual implementation belongs on `feature/add-colyseus-multiplayer` after that branch is refreshed from `staging`.

---

## First Milestone

Deliver one working Colyseus lobby room that can:

- join a room
- show roster
- ready up
- switch teams
- optionally fill with bots
- count down into a match
- run a round
- return to lobby-ready state after round end

This phase does not need room browsing, public matchmaking, reconnect polish, or deployment hardening.

---

## Required Architectural Direction

- Replace the placeholder WebSocket client/server path with Colyseus on the multiplayer branch only
- Keep local solo mode as a separate offline path
- Adapt Colyseus room state to shared gameplay helpers instead of re-embedding game rules in transport code
- Reuse the AI-bot branch pieces where possible:
  - `shared/match.ts`
  - `shared/player-logic.ts`
  - `shared/vec3.ts`
  - bot logic concepts from `client/src/match/botBrain.ts`
  - lightweight non-human actor rendering patterns from `client/src/match/simulatedPlayerAvatar.ts`

---

## Planned Work Items

### Client

- Replace `client/src/net/client.ts` stub with a Colyseus-backed implementation
- Introduce client room join/leave lifecycle
- Map Colyseus room state into HUD roster, score, countdown, and actor updates
- Keep `PLAY SOLO` offline and separate from online room creation/joining

### Server

- Add Colyseus server dependency and room bootstrap
- Build a lobby-capable room state model
- Host team assignment, ready state, bot fill, countdown, and round transitions there
- Move authoritative match state behind the room layer rather than raw WebSocket handlers

### Shared Contracts

- Introduce Colyseus room state classes or schemas for:
  - lobby members
  - team assignment
  - room phase
  - score
  - actor snapshots
  - round events

Do not treat the current raw WebSocket DTOs as the long-term primary contract.

---

## Done Definition For The Future Branch

- One room can host a full lobby-to-match-to-round-end flow
- Solo offline mode still works
- Bots can be added without duplicating gameplay rules
- Client and server typechecks pass
- Regression tests cover lobby transitions and offline solo start
