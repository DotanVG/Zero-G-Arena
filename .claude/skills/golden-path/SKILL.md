---
name: golden-path
description: Walk through the Orbital Breach manual gameplay smoke test before or after a gameplay change.
argument-hint: [feature-or-branch]
disable-model-invocation: true
allowed-tools: Read Grep Glob LS Bash
---

# Golden Path

Use this skill for the manual browser QA checklist that matters most in this repo.

## Required smoke path

After code changes that touch gameplay, controls, camera, breach logic, or UI, guide or perform this checklist:

1. Start the dev environment.
2. Verify the client loads without console errors.
3. Verify left click still fires correctly.
4. Verify bar grab with `E` still works.
5. Verify launch with `Space` still works.
6. Verify breach win still triggers when a player floats through the enemy portal.
7. Verify the changed feature on its happy path.

## Reporting

- Call out exactly what was verified and what was not.
- If browser testing was skipped, say that plainly instead of implying coverage.
- When a regression is found, tie it back to the affected files or subsystem.
