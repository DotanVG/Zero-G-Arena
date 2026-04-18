# Polish Sweep Plan

Living document for the post-bots/Colyseus polish work. Each group is one PR into `staging`.

Groups ship in order. Mark items `[x]` as they land. Keep PRs small so each can be reviewed and manually smoke-tested in one sitting.

---

## Group A — Menu/HUD/Hitbox/Call-sign (PR #10) — SHIPPED

Branch: `feature/polish-sweep` → `staging`

- [x] HUD root starts hidden so nothing flashes over the menu
- [x] Enter key in the menu triggers PLAY SOLO
- [x] Objective banner wraps on narrow / short viewports
- [x] 1st-person pistol stays visible while frozen but glows in enemy team colour (frozen or right-arm disabled)
- [x] Projectile impacts apply zero impulse — shots freeze but do not push
- [x] `HITBOX_RADIUS` (0.42) + `HITBOX_OFFSET_Y` (-0.35) — tight hit sphere sitting on alien torso
- [x] `classifyHitZone` scales head/arm/body/legs by `hitRadius` so tight hitbox keeps variety
- [x] `ACTOR_COLLISION_RADIUS` (0.5) — alien models brush shoulders without a visible gap
- [x] Solo match ends at `MATCH_POINT_TARGET` (5); return to menu after delay
- [x] Call-sign labels: grey pill + team neon border + sit just above alien head + occluded by walls
- [x] Frozen bots bounce off arena walls (dedicated `integrateFrozenDrift`, no portal passthrough)

---

## Group B — Freeze/spawn/bot gameplay correctness (next PR)

Branch: `feature/polish-sweep-b` → `staging`

Gameplay bugs that survived Group A. All should be testable in solo with bots.

- [x] **Own-team breach-room re-entry heals limb damage (but not freeze).** FLOATING allies who drift home clear `leftArm / rightArm / leftLeg / rightLeg`. Fully-frozen players CANNOT breach — frozen drift is fully solid, so `damage.frozen` bodies bounce off every wall and stay stranded for the round.
- [ ] **Movement in spawn before round starts.** *(Code path looks correct from inspection — needs in-browser repro before fix.)*
- [x] **Frozen bots keep firing at the player.** Bot brain `fire` is now gated on `phase !== 'FROZEN' && !damage.frozen` in addition to the existing rightArm check.
- [x] **Animation freeze on frozen model.** Local + simulated avatars tick the mixer with `dt=0` after the death-animation crossfade settles, so the alien holds the death pose instead of looping it.
- [x] **Bot-collision momentum preservation.** `resolveActorCollisions` now takes optional `vel` per body and cancels only the approach-velocity component, preserving tangential momentum. Human + bot velocities are wired through.
- [x] **Split legs into left/right with graduated launch cap.** `DamageState` replaces `legs` with `leftLeg` + `rightLeg`. `classifyHitZone` projects the impact onto the facing-right vector to pick left vs right leg. `maxLaunchPower` returns `MAX_LAUNCH_SPEED * 1.0 / 0.75 / 0.5` for 0 / 1 / 2 damaged legs. HUD power bar now uses `MAX_LAUNCH_SPEED` as its 100% mark so the cap shows as incomplete fill and a "(CAP 75%)" label.
- [x] **Glow cleanup when fully frozen.** Limb glows (leftArm / rightArm / leftLeg / rightLeg) are suppressed while `damage.frozen` is true — only the full-body freeze glow renders for a frozen player.
- [x] **All-limbs-damaged promotes to full freeze.** Once all 4 limbs are hit, `applyHit` transitions the player to `FROZEN`, increments `deaths`, and returns `true` so the kill-feed + full-freeze-win checks fire just like a head/body hit.

Acceptance: `tsc` clean, `npm test` green, manual golden path + each bullet verified in browser.

---

## Group C — Frontend sweep + Tab scoreboard + tutorial

Branch: `feature/polish-sweep-c` → `staging`

- [ ] Full visual pass on menu + HUD typography / spacing / colour tokens
- [ ] Tab scoreboard rework: per-team columns, K/D/freezes, ping column (online only)
- [ ] First-time tutorial mode — lightweight prompts for grab/launch/fire/breach

---

## Group D — Online polish

Branch: `feature/polish-sweep-d` → `staging`

- [ ] Online prediction + reconciliation so movement isn't choppy
- [ ] Lobby/matchmaking rework (CS:GO / COD style)
- [ ] 2v2 duos variant

---

## Group E — Stretch / scope-flagged

Only if jam calendar permits.

- [ ] Spherical arena variant (high scope — may drop)

---

## Not re-opening

These were part of PR #10 and are considered done; do not regress:

- Call-sign profanity filter (shipped pre-polish-sweep)
- `shared/match-flow.ts` + `findMatchWinner` + 6 vitest cases
- Colyseus 0.17 migration
