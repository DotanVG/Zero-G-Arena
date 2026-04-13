---
name: claude-audit
description: Audit this repo's Claude Code setup for drift across CLAUDE.md, settings, hooks, worktree files, and local skills.
disable-model-invocation: true
allowed-tools: Read Grep Glob LS Bash
---

# Claude Audit

Use this skill when the user wants to verify that the repo-level Claude setup still matches the documented layout.

## Audit checklist

Check these files and directories together:

- `CLAUDE.md`
- `CLAUDE.local.md` expectations only; do not require the file to exist
- `.claude/settings.json`
- `.claude/settings.local.json` expectations only; it should stay local and gitignored
- `.claude/hooks/`
- `.claude/skills/`
- `.worktreeinclude`
- `.gitignore`

## What to validate

- Shared config lives in tracked files and local-only config is ignored.
- Hook script paths match what `.claude/settings.json` references.
- Skills are in `.claude/skills/<name>/SKILL.md` with usable frontmatter.
- Worktree-local files that should follow Claude sessions are listed in `.worktreeinclude`.
- `CLAUDE.md` still describes the Claude-specific workflow accurately.

## Reporting

- List mismatches first.
- Then list any optional improvements.
- If everything is aligned, say so plainly.
