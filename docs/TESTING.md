# Testing Guide

## Setup

Tests run from the **repo root** using [vitest](https://vitest.dev/).
vitest is in root `devDependencies` — no extra install needed.

```bash
npm test              # run all tests once (CI-style)
npm run test:watch    # re-run on file save (development)
```

Config files at repo root:
- `vitest.config.ts` — test environment, file patterns, Three.js alias
- `tsconfig.test.json` — TypeScript config scoped to tests + shared/

---

## How it works

The test environment is **Node.js** (`environment: 'node'` in vitest.config.ts).
There is no DOM and no browser APIs. Three.js is aliased to
`client/node_modules/three/build/three.module.js` so geometry math can be
imported in tests without a WebGL context.

```
tests/                      ← test files live here
  smoke.test.ts             ← vitest sanity check
  arena-gen.test.ts         ← shared/arena-gen.ts
  breachRoomQueries.test.ts ← client/src/arena/breachRoomQueries.ts
  cameraYawFromBreach.test.ts ← client/src/game/cameraYawFromBreach.ts
  bulletCollision.test.ts    ← client/src/game/bulletCollision.ts
shared/**/*.test.ts         ← co-located tests for shared/ modules (also discovered)
```

---

## What to test

Only **pure (side-effect-free) functions** — those with no DOM, no Three.js scene
graph, and no WebSocket. These are the best candidates:

| Category | Examples |
|---|---|
| `shared/` utilities | `generateArenaLayout`, `applyShotSpread`, vec3 math |
| Arena geometry | `isInBreachRoom`, `isDeepInBreachRoom`, `bounceAgainstBoxes` |
| Game math helpers | `cameraYawFacingBreachOpening`, `buildShotFromCamera` |
| Hit classification | `classifyHitZone` in `player/playerCombat.ts` |

### What NOT to test

| Category | Reason |
|---|---|
| Three.js `Mesh` / `Scene` / `Renderer` | Requires browser WebGL context |
| HUD / menu DOM manipulation | Node environment has no `document` |
| WebSocket connections | Integration-level; needs a running server |
| `InputManager` | Coupled to pointer-lock browser APIs |
| `AnimationMixer` crossfades | Requires a loaded GLTF + Three.js renderer |

For these, rely on the manual golden-path browser check in `CLAUDE.md`.

---

## Writing a new test

1. Create `tests/<module-name>.test.ts` (or co-locate as `shared/my-module.test.ts`).

2. Import vitest explicitly — globals are disabled:
   ```typescript
   import { describe, it, expect } from 'vitest';
   ```

3. Import the function under test using a path **relative to the repo root**:
   ```typescript
   import { myHelper } from '../shared/my-module';
   import { isInBreachRoom } from '../client/src/arena/breachRoomQueries';
   ```

4. One `describe` block per exported function. Name tests as plain statements:
   ```typescript
   describe('myHelper', () => {
     it('returns 0 for empty input', () => { ... });
     it('handles negative values', () => { ... });
   });
   ```

---

## Example test

```typescript
import { describe, it, expect } from 'vitest';
import { isInBreachRoom } from '../client/src/arena/breachRoomQueries';
import { BREACH_ROOM_D, BREACH_ROOM_W, BREACH_ROOM_H } from '../shared/constants';

const roomZ = { center: { x: 0, y: 0, z: 23 }, openAxis: 'z' as const };

describe('isInBreachRoom', () => {
  it('accepts room center', () => {
    expect(isInBreachRoom({ x: 0, y: 0, z: 23 }, roomZ)).toBe(true);
  });

  it('rejects points past the depth face', () => {
    const edge = 23 + BREACH_ROOM_D / 2;
    expect(isInBreachRoom({ x: 0, y: 0, z: edge + 0.01 }, roomZ)).toBe(false);
    expect(isInBreachRoom({ x: 0, y: 0, z: edge - 0.01 }, roomZ)).toBe(true);
  });

  it('rejects points outside width or height', () => {
    expect(isInBreachRoom({ x: BREACH_ROOM_W / 2, y: 0, z: 23 }, roomZ)).toBe(false);
    expect(isInBreachRoom({ x: 0, y: BREACH_ROOM_H / 2, z: 23 }, roomZ)).toBe(false);
  });
});
```

---

## Testing Three.js math (without a scene)

Functions that use `THREE.Vector3`, `THREE.Quaternion`, or `THREE.Euler` for pure
math (no mesh instantiation, no renderer) work fine in tests. The vitest alias
resolves `three` to the ES module build.

```typescript
// Fine to test — pure math, no scene
import * as THREE from 'three';
import { computeSomething } from '../shared/physics';

it('applies spread correctly', () => {
  const dir = new THREE.Vector3(0, 0, -1);
  const result = computeSomething(dir, 0.1);
  expect(result.length()).toBeCloseTo(1.0);
});
```

Anything that calls `new THREE.Mesh(...)`, `scene.add(...)`, or `renderer.render(...)`
will fail in Node — keep those out of tests.

---

## Test requirement policy

Every new feature that adds a pure (side-effect-free) function **must** include vitest
tests before commit. Extract the math into a standalone function and test it. Visual/scene
code is exempt (no WebGL in Node), but the logic it delegates to is not.

## Current test coverage

| Test file | Function(s) covered | Tests |
|---|---|---|
| `smoke.test.ts` | — (vitest sanity) | 1 |
| `arena-gen.test.ts` | `generateArenaLayout` | 7 |
| `breachRoomQueries.test.ts` | `isInBreachRoom`, `isDeepInBreachRoom` | 6 |
| `cameraYawFromBreach.test.ts` | `cameraYawFacingBreachOpening` | 3 |
| `bulletCollision.test.ts` | `bulletHitsBox`, `bulletHitPoint` (swept collision + surface point) | 12 |
| **Total** | | **30** |
