---
name: port-from-archive
description: Port a feature from archive branches into the current Orbital Breach codebase without breaking current invariants.
argument-hint: [archive-path-or-feature]
disable-model-invocation: true
allowed-tools: Read Grep Glob LS Bash
---

# Port From Archive

Use this skill when work needs to be recovered from `archive/dev` or another archive branch.

## Procedure

1. Read the relevant archived file or files in full with `git show archive/dev:<path>`.
2. Read the current target files in the active branch.
3. Cross-check the invariants in `CLAUDE.md` before porting anything.
4. Port only the needed behavior. Do not blind-copy large archived files into the current architecture.
5. Re-run the checks that protect the affected subsystem.

## Hard rules

- Preserve the current shooting flow, breach win behavior, and camera mode switching.
- Treat archive branches as reference material, not source of truth.
- If the archived implementation conflicts with current architecture or tests, adapt it instead of force-merging it.
