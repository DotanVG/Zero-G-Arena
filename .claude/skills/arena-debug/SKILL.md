---
name: arena-debug
description: Debug zero-G gameplay, breach-room transitions, projectile logic, and player movement issues in Orbital Breach.
argument-hint: [symptom-or-file]
disable-model-invocation: true
allowed-tools: Read Grep Glob LS Bash
paths:
  - client/**/*.ts
  - server/**/*.ts
  - shared/**/*.ts
  - tests/**/*.ts
---

# Arena Debug

Use this skill for gameplay bugs that involve movement, collision, projectiles, breach transitions, or team-state logic.

## Investigation order

1. Reproduce or restate the bug precisely.
2. Identify whether the issue is client-only, server-authoritative, or shared-contract related.
3. Check the relevant invariants in `CLAUDE.md`.
4. Trace the bug through the narrowest likely modules first.
5. Add or update a focused test if the broken behavior is expressed by a pure function.

## Strong clues in this repo

- `shared/` bugs often require both client and server updates.
- Camera or breach issues usually involve `player`, `camera`, `arena`, or the round state machine.
- Projectile bugs often cross client visuals, hit classification, and authoritative server logic.
