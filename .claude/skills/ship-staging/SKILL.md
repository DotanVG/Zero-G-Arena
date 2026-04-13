---
name: ship-staging
description: Prepare, commit, push, and summarize a staging-only change for Orbital Breach.
argument-hint: [summary-or-commit-scope]
disable-model-invocation: true
allowed-tools: Read Grep Glob LS Bash
---

# Ship Staging

Use this skill when the user wants to land work on `staging` and prepare for a PR to `main`.

## Workflow

1. Inspect `git status --short --branch`.
2. Separate intended changes from unrelated local edits.
3. Run `/preflight` unless the user explicitly asks to skip it.
4. Stage only the intended files.
5. Write a concise commit message that matches the actual diff.
6. Push to `origin/staging`.
7. Summarize what changed and what remains local.

## Guardrails

- Never sweep unrelated working tree changes into the commit.
- If local changes are mixed together in the same file, stop and explain the risk before staging.
- If the branch is not `staging`, say so and fix it only if the user asked for branch changes.
- For PR prep, summarize the exact commits ahead of `main`.
