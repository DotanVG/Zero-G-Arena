# ORBITAL BREACH - Mobile Support Implementation Plan

## Goal

Create a production-ready implementation branch and PR that makes Orbital Breach playable on modern mobile browsers, with a focus on iPhone Safari and Android Chrome, while preserving the existing desktop keyboard + mouse experience.

This document is written for Claude Code to execute directly in the repository.

## Why this work is needed

The current client is desktop-only.

Current blockers observed in the repo:

- `client/src/input.ts` only supports keyboard, mouse move, mouse buttons, and pointer lock.
- `client/src/game/gameApp.ts` starts control flow through mouse down and pointer lock.
- `client/src/game/gameApp.ts` blocks firing unless `input.isLocked()` is true.
- `client/src/render/scene.ts` uses full-resolution rendering with antialiasing and no device pixel ratio cap.
- `client/index.html` uses a basic viewport meta tag and does not prepare for mobile-safe in-game gestures.

## Non-negotiable requirements

1. Do not break desktop controls.
2. Do not remove pointer lock support for desktop.
3. Add a separate mobile input path.
4. Do not require an external library for virtual joysticks unless absolutely necessary.
5. Keep architecture clean and type-safe.
6. Keep changes scoped to client-side gameplay and UI.
7. Make the game playable on touch devices even if controls are initially minimal.
8. Prefer simple, robust controls over over-designed UI.

## Definition of done

A PR is complete when all of the following are true:

- The game can start on mobile with a tap-based start flow.
- A touch device can look around, move, jump/charge, grab, and fire.
- Gameplay no longer depends on pointer lock on mobile.
- Desktop behavior still works as before.
- The client builds successfully.
- Existing tests still pass.
- Add at least basic tests for the new mobile-related pure logic where practical.
- README includes mobile control instructions.

## High-level strategy

Implement mobile support in 6 layers:

1. Platform detection and control mode abstraction
2. Touch-capable input state inside `InputManager`
3. On-screen mobile controls overlay
4. Control gating in game loop no longer tied only to pointer lock
5. Mobile-safe renderer and viewport adjustments
6. Documentation and test coverage

## Required branch and PR workflow

Claude Code should do the following in order:

1. Create a new branch from `main` named:
   - `feature/mobile-support`
2. Implement all changes on that branch.
3. Run client build and tests.
4. Update docs.
5. Open a PR into `main`.

Suggested PR title:

`Add mobile touch controls and mobile-safe gameplay support`

Suggested PR body:

```md
## Summary
- add touch/mobile input path alongside desktop controls
- add on-screen mobile controls overlay
- remove pointer-lock-only gameplay gating on mobile
- improve mobile viewport and rendering behavior
- document mobile controls in README

## Testing
- npm test
- npm run build
- manual smoke test on desktop
- manual smoke test on iPhone/Android browser
```

## Repo-specific implementation plan

### 1. Add platform and capability detection

Create a new file:

- `client/src/platform.ts`

Add utilities:

- `isTouchDevice(): boolean`
- `isMobileLikeDevice(): boolean`
- `supportsPointerLock(): boolean`
- `getViewportSize(): { width: number; height: number }`

Implementation notes:

- Use `navigator.maxTouchPoints > 0` and touch capability detection.
- Do not rely only on user agent.
- `getViewportSize()` should prefer `window.visualViewport` when available.
- Keep this file dependency-free.

### 2. Refactor input model to support desktop and mobile

Modify:

- `client/src/input.ts`

Current issue:

The class is hard-wired to keys, mouse, and pointer lock.

Required changes:

- Preserve all current desktop behavior.
- Add internal touch state for mobile.
- Add a concept of control mode or platform mode.

Add new internal state roughly like:

```ts
private touchLookDx = 0;
private touchLookDy = 0;
private mobileMoveX = 0;
private mobileMoveZ = 0;
private mobileJumpHeld = false;
private mobileGrabPressed = false;
private mobileFireHeld = false;
private mobileControlsActive = false;
private desktopPointerLockRequired = true;
```

Add new public methods:

- `setMobileLookDelta(dx: number, dy: number): void`
- `setMobileMoveAxes(x: number, z: number): void`
- `setMobileJumpHeld(active: boolean): void`
- `pressMobileGrab(): void`
- `setMobileFireHeld(active: boolean): void`
- `setMobileControlsActive(active: boolean): void`
- `canControlGame(): boolean`
- `isUsingTouchControls(): boolean`

Behavior requirements:

- `consumeMouseDelta()` should merge desktop mouse deltas and touch look deltas.
- `getWalkAxes()` should combine desktop keyboard axes and mobile virtual joystick axes without exceeding normal magnitude.
- `isJumping()` and `isAiming()` should respect mobile jump/charge hold.
- `consumeGrab()` should work with touch button press.
- `consumeFire()` should work with held mobile fire button and existing fire cooldown.
- `canControlGame()` should return:
  - desktop: `isLocked()`
  - mobile: `mobileControlsActive`

Do not remove `lockPointer()` or `isLocked()`.

### 3. Add a dedicated mobile controls overlay

Create new files:

- `client/src/ui/mobileControls.ts`
- optionally `client/src/ui/mobileControlsView.ts`

This should be a DOM overlay, not Three.js UI.

Minimum controls to implement:

- Left thumb joystick area for movement
- Right-side drag area for look
- Fire button
- Grab button
- Jump / Charge button

Optional controls:

- Third-person toggle button
- Scoreboard button

Required behavior:

- Left joystick controls `getWalkAxes()` equivalent input.
- Right-side drag controls camera look.
- Jump button should act like holding `Space`.
- Grab button should act like one-shot `E` press.
- Fire button should behave like holding LMB.

UX constraints:

- Large touch targets
- Semi-transparent controls
- Controls should not overlap critical HUD text where possible
- Add `touch-action: none` on relevant elements
- Prevent pinch zoom and page scrolling while actively playing

Recommended API:

```ts
class MobileControls {
  constructor(input: InputManager)
  mount(): void
  unmount(): void
  show(): void
  hide(): void
  setEnabled(enabled: boolean): void
  isVisible(): boolean
}
```

Implementation guidance:

- Use Pointer Events if possible.
- Fall back carefully only if needed.
- Keep DOM creation encapsulated inside this class.
- Avoid React or external UI packages.

### 4. Update game start and control gating

Modify:

- `client/src/game/gameApp.ts`

Current issue:

Gameplay assumes pointer lock as the universal gate for active control.

Required changes:

- Instantiate `MobileControls` when touch/mobile is detected.
- On mobile, do not require pointer lock to start playing.
- On desktop, keep current pointer lock behavior.
- Introduce a clear start flow for mobile.

Required logic changes:

#### Start flow

Current desktop start flow can remain.

For mobile:

- Tapping Play should enable mobile controls.
- Start the round without attempting pointer lock.
- Show controls after the menu is dismissed.

#### Firing gate

Change this logic in `tickWeaponFire()`:

Current:

```ts
if (!this.input.isLocked() || !inZeroG) return;
```

Replace with:

```ts
if (!this.input.canControlGame() || !inZeroG) return;
```

Also review any other logic that wrongly assumes active play requires pointer lock.

#### Canvas interaction

Current constructor binds `mousedown` on renderer DOM element to request pointer lock.

Keep that only for desktop-capable pointer lock flows.

Do not bind mobile start behavior to `mousedown`.

### 5. Add mobile-safe scene and viewport behavior

Modify:

- `client/src/render/scene.ts`
- `client/index.html`

#### `scene.ts` changes

Required:

- Cap pixel ratio for mobile and general safety:

```ts
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
```

- Use viewport helper from `platform.ts` for initial size and resize updates.
- Ensure resize logic handles mobile browser chrome changes.

Recommended:

- Consider disabling antialias on mobile if performance is poor.
- Keep initial implementation conservative and simple.

#### `index.html` changes

Replace viewport meta with something mobile-safe:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
```

Add CSS safeguards:

- `touch-action: none` on `body`, `canvas`, and control overlay roots where appropriate
- prevent selection/callout where useful
- preserve full-screen fixed layout

### 6. Keep HUD and menu usable on mobile

Inspect and adjust if needed:

- `client/src/render/hud.ts`
- `client/src/ui/menu.ts`
- `client/src/ui/menu/menuView.ts`

Requirements:

- Menu buttons must remain tappable.
- HUD must not fully overlap movement/fire controls.
- If needed, shift some HUD elements upward or inward on narrow screens.
- Do not redesign the whole UI unless necessary.

### 7. Add README mobile controls documentation

Modify:

- `README.md`

Add a new subsection near Controls:

```md
### Mobile Controls

- Left thumb: move
- Right thumb drag: look
- Fire button: shoot
- Grab button: grab nearest bar
- Jump/Charge button: jump in breach room, hold to charge while grabbing
```

Also update Current Status if mobile support becomes available.

### 8. Testing requirements

Run and fix as needed:

- root tests if configured
- client build
- any relevant lint/typecheck scripts available in package.json

At minimum, Claude Code must run:

```bash
npm test
cd client && npm run build
```

If repo scripts differ, inspect package.json and use the actual available scripts.

### 9. Add or update tests

Inspect current test setup and add tests for pure logic where practical.

Good candidates:

- platform detection helper behavior where mockable
- input merging logic in `InputManager`
- control gating behavior via `canControlGame()`

Do not waste time trying to fully automate browser touch UI behavior if that becomes brittle. Focus on pure logic and build safety.

## Concrete file checklist

### New files expected

- `client/src/platform.ts`
- `client/src/ui/mobileControls.ts`
- optional supporting style/view file if needed

### Files likely to modify

- `client/index.html`
- `client/src/input.ts`
- `client/src/game/gameApp.ts`
- `client/src/render/scene.ts`
- `client/src/render/hud.ts` if overlap requires tweaks
- `client/src/ui/menu.ts` if start flow needs mobile path
- `client/src/ui/menu/menuView.ts` if button labels or instructions need updates
- `README.md`

## Important implementation details

### Movement joystick

Keep it simple.

Suggested approach:

- A fixed circular touch region at bottom-left
- Track active pointer id
- Compute vector from joystick center to current pointer position
- Clamp to radius
- Normalize to `[-1, 1]`
- Feed `input.setMobileMoveAxes(x, z)`

Map screen movement to game movement like:

- right = positive X
- up = positive Z

### Look drag

Suggested approach:

- Right half-screen drag zone or floating zone at bottom-right
- Track pointer delta each move event
- Apply scaled deltas into `input.setMobileLookDelta(dx, dy)`
- Tune sensitivity separately from desktop if needed

### Jump / charge behavior

Keep semantics aligned with existing game rules:

- In breach room: jump
- While grabbing: hold to charge
- Release: handled by existing player logic when `isAiming()` becomes false

### Fire behavior

Mobile fire button should set a held state.
`consumeFire()` should continue to use cooldown logic already present.

### Grab behavior

Grab should remain a one-shot action, not a held state.

### Performance fallback

If mobile performance is poor after initial implementation, add a simple mobile quality flag such as:

- lower pixel ratio cap
- disable antialias on touch devices

Only do this if needed.

## Suggested commit breakdown

1. `feat: add platform detection utilities for mobile support`
2. `feat: extend input manager with touch control state`
3. `feat: add mobile controls overlay`
4. `refactor: decouple gameplay control gating from pointer lock`
5. `perf: improve mobile viewport and renderer behavior`
6. `docs: document mobile controls in README`
7. `test: add coverage for mobile input/control logic`

## Manual QA checklist

Claude Code should include this checklist in the PR description or internal notes.

### Desktop

- Menu still opens normally
- Play still locks pointer on desktop
- WASD movement still works
- Mouse look still works
- Fire still works
- Grab/jump still work
- No regressions in round flow

### Mobile

- Game loads in mobile browser
- Play starts the round without pointer lock
- Left joystick moves player
- Right drag looks around
- Fire button shoots
- Grab button works near a bar
- Jump/charge button works in both contexts
- No page scrolling while playing
- Orientation changes do not permanently break layout

## Constraints and anti-patterns

Do not:

- rewrite the whole input system from scratch if additive refactor works
- add a game engine UI library
- couple touch controls directly into unrelated gameplay classes
- gate mobile gameplay behind pointer lock hacks
- use a user-agent-only solution

## Final deliverables

Claude Code must produce:

1. A working implementation branch: `feature/mobile-support`
2. A PR into `main`
3. Updated README docs
4. Passing build/tests or clearly documented remaining issues

## Execution note for Claude Code

Make reasonable decisions without blocking on open questions. If a detail is ambiguous, choose the simplest implementation that preserves desktop behavior and makes mobile playable first.
