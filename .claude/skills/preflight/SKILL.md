---
name: preflight
description: Run the Orbital Breach preflight checks before committing, pushing, or opening a PR.
argument-hint: [optional-path-or-note]
disable-model-invocation: true
allowed-tools: Read Grep Glob LS Bash
---

# Preflight

Use this skill when the user wants a ready-to-ship confidence pass for this repo.

## What to run

Run these checks from the repo root unless the user explicitly asks for a narrower scope:

1. `cd client && node_modules/.bin/tsc --noEmit`
2. `cd server && node_modules/.bin/tsc --noEmit -p tsconfig.json`
3. `npm test`

## How to report

- Stop at the first failing command only if the user asked for speed.
- Otherwise run all three and summarize pass or fail for each.
- If anything fails, quote the important error lines and point to the likely file or subsystem.
- If all checks pass, say so clearly and mention whether there are still uncommitted changes.

## Orbital Breach specifics

- Shared code under `shared/` affects both client and server, so always run both typechecks when `shared/` changed.
- Keep unrelated local edits out of commits unless the user explicitly asks for them.
