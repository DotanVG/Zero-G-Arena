---
name: three-webgl-game
description: Implement browser-game runtimes with plain Three.js. Use when the user wants imperative scene control in TypeScript or Vite with GLB assets, loaders, physics, and low-level WebGL debugging.
---

# Three WebGL Game

## Overview

Use this skill for the default non-React 3D path in the plugin. This is not generic WebGL advice. It is an opinionated stack for browser 3D work:

- `three`
- TypeScript
- Vite
- GLB or glTF 2.0 assets
- Three.js loaders such as `GLTFLoader`, `DRACOLoader`, and `KTX2Loader`
- Rapier JS for physics
- SpectorJS for GPU and frame debugging
- DOM overlays for HUD, menus, and settings

Use this skill when the project wants direct scene, camera, renderer, and game-loop control. If the app already lives in React, route to `../react-three-fiber-game/SKILL.md` instead.
