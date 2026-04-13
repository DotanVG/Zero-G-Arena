---
name: web-game-foundations
description: Set browser-game architecture before implementation. Use when the user needs engine choice, simulation and render boundaries, input model, asset organization, or save/debug/performance strategy.
---

# Web Game Foundations

## Overview

Use this skill to establish the non-negotiable architecture before implementation starts. Browser games degrade quickly when simulation, rendering, UI, asset loading, and input handling are mixed together.

Default rule: simulation state is owned outside the renderer, browser UI is not forced into the canvas unless there is a clear reason, and shipped 3D assets default to GLB or glTF 2.0 rather than ad hoc model formats.
