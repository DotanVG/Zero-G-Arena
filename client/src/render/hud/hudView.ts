/**
 * Alien body-status silhouette — 5 independent SVG path zones (head, body,
 * leftArm, rightArm, legs) styled by the HUD controller to reflect DamageState.
 * ViewBox 0 0 80 185 designed to match the Alien.glb bipedal silhouette:
 *  • Oversized dome head (alien proportion)
 *  • Narrow neck / slim torso
 *  • Long thin arms that hang below the waist
 *  • Two separate legs
 */
const BODY_STATUS_PANEL = `
  <div id="hud-body-status" style="
    position:absolute;left:14px;top:50%;
    transform:translateY(-50%);
    display:flex;flex-direction:column;align-items:center;gap:5px;
    pointer-events:none;
  ">
    <div style="font-size:8px;letter-spacing:2.5px;color:rgba(255,255,255,0.28);text-align:center;">STATUS</div>
    <svg id="hud-body-svg" viewBox="0 0 80 185" width="54" height="125"
         style="display:block;filter:drop-shadow(0 0 4px rgba(0,0,0,0.6));" xmlns="http://www.w3.org/2000/svg">
      <!-- HEAD: large alien dome head -->
      <path id="bz-head"
        d="M40,2 C63,2 74,17 74,37 C74,55 63,67 48,69 L32,69 C17,67 6,55 6,37 C6,17 17,2 40,2 Z"
        fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" stroke-linejoin="round"/>
      <!-- BODY: slim torso from neck to hips -->
      <path id="bz-body"
        d="M32,69 C21,71 13,80 13,96 C13,114 17,127 28,134 L52,134 C63,127 67,114 67,96 C67,80 59,71 48,69 Z"
        fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" stroke-linejoin="round"/>
      <!-- LEFT ARM: long thin arm on screen-left (player's right arm) -->
      <path id="bz-leftArm"
        d="M13,86 C7,93 3,108 2,126 C1,141 3,153 6,158 C9,162 14,161 15,154 C16,147 14,133 16,121 C18,111 15,98 13,86 Z"
        fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" stroke-linejoin="round"/>
      <!-- RIGHT ARM: long thin arm on screen-right (player's left arm) -->
      <path id="bz-rightArm"
        d="M67,86 C73,93 77,108 78,126 C79,141 77,153 74,158 C71,162 66,161 65,154 C64,147 66,133 64,121 C62,111 65,98 67,86 Z"
        fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" stroke-linejoin="round"/>
      <!-- LEGS: two legs as a single compound path -->
      <path id="bz-legs"
        d="M28,134 C24,143 22,155 22,168 C22,178 26,184 33,184 C39,184 41,178 41,168 L41,134 Z
           M41,134 L41,168 C41,178 43,184 47,184 C54,184 58,178 58,168 C58,155 56,143 52,134 Z"
        fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>
`;

/**
 * Static DOM structure for the in-game HUD. Every mutable element is
 * exposed by `id` so the controller can tweak text and visibility
 * without hunting through markup. Styles are inlined to keep the HUD
 * self-contained (no global stylesheet dependency).
 */
const HUD_MARKUP = `
  ${BODY_STATUS_PANEL}

  <div id="hud-countdown" style="
    display:none;position:absolute;left:50%;top:38%;
    transform:translate(-50%,-50%);font-size:90px;font-weight:bold;
    color:#fff;text-shadow:0 0 40px #00ffff;letter-spacing:0.05em;
  ">10</div>

  <!-- First-round objective typewriter (shown only during first countdown) -->
  <div id="hud-objective" style="
    display:none;position:absolute;left:50%;top:58%;
    transform:translateX(-50%);font-size:16px;letter-spacing:3px;
    color:#aaffff;text-shadow:0 0 12px #00ffff;text-align:center;
    max-width:600px;white-space:nowrap;
  "></div>

  <div id="hud-crosshair" style="
    position:absolute;left:50%;top:50%;
    transform:translate(-50%,-50%);
    width:6px;height:6px;border-radius:50%;background:#fff;opacity:0.85;
  "></div>

  <div id="hud-score" style="
    position:absolute;left:50%;top:18px;
    transform:translateX(-50%);font-size:20px;letter-spacing:0.08em;
    text-shadow:0 0 10px rgba(0,255,255,0.5);
  ">0 — 0</div>

  <div id="hud-breach" style="
    display:none;position:absolute;bottom:22px;left:50%;
    transform:translateX(-50%);font-size:13px;color:#88ddff;opacity:0.75;
  ">▼ BREACH ROOM — GRAVITY ACTIVE ▼</div>

  <div id="hud-grab" style="
    display:none;position:absolute;left:50%;bottom:28%;
    transform:translateX(-50%);font-size:17px;color:#aaffff;
    text-shadow:0 0 8px #00ffff;
  ">[E]  GRAB BAR</div>

  <div id="hud-power-wrap" style="
    display:none;position:absolute;left:50%;bottom:22%;
    transform:translateX(-50%);width:220px;
    background:rgba(0,0,0,0.45);padding:5px 7px;
    border:1px solid #00ffff;border-radius:5px;
  ">
    <div id="hud-power-bar" style="height:12px;width:0%;background:#00ffff;border-radius:3px;transition:none;"></div>
    <div id="hud-power-label" style="color:#cff;font-size:11px;text-align:center;margin-top:3px;">POWER  0%</div>
  </div>

  <div id="hud-damage" style="
    position:absolute;left:20px;bottom:20px;font-size:13px;
    line-height:1.7;color:#ffaa00;
  "></div>

  <div id="hud-round-end" style="
    display:none;position:absolute;inset:0;
    display:none;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.6);font-size:52px;
    letter-spacing:0.08em;text-shadow:0 0 30px #fff;
  "></div>

  <div id="hud-tab" style="
    display:none;position:absolute;left:50%;top:50%;
    transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.8);border:1px solid #334;
    padding:16px 24px;min-width:420px;font-size:13px;
    border-radius:6px;
  "></div>
`;

export interface HudElements {
  root: HTMLDivElement;
  countdown: HTMLDivElement;
  objective: HTMLDivElement;
  score: HTMLDivElement;
  breach: HTMLDivElement;
  grab: HTMLDivElement;
  powerWrap: HTMLDivElement;
  powerBar: HTMLDivElement;
  powerLabel: HTMLDivElement;
  damage: HTMLDivElement;
  roundEnd: HTMLDivElement;
  tab: HTMLDivElement;
  // Alien body-status silhouette zones
  bzHead: SVGPathElement;
  bzBody: SVGPathElement;
  bzLeftArm: SVGPathElement;
  bzRightArm: SVGPathElement;
  bzLegs: SVGPathElement;
}

export function createHudView(): HudElements {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    fontFamily: 'monospace',
    color: 'white',
    userSelect: 'none',
  });
  root.innerHTML = HUD_MARKUP;
  document.body.appendChild(root);

  const q = <T extends HTMLElement = HTMLDivElement>(id: string): T =>
    root.querySelector<T>(`#${id}`) as T;
  const svgQ = (id: string): SVGPathElement =>
    root.querySelector<SVGPathElement>(`#${id}`) as SVGPathElement;

  return {
    root,
    countdown: q('hud-countdown'),
    objective: q('hud-objective'),
    score: q('hud-score'),
    breach: q('hud-breach'),
    grab: q('hud-grab'),
    powerWrap: q('hud-power-wrap'),
    powerBar: q('hud-power-bar'),
    powerLabel: q('hud-power-label'),
    damage: q('hud-damage'),
    roundEnd: q('hud-round-end'),
    tab: q('hud-tab'),
    bzHead:     svgQ('bz-head'),
    bzBody:     svgQ('bz-body'),
    bzLeftArm:  svgQ('bz-leftArm'),
    bzRightArm: svgQ('bz-rightArm'),
    bzLegs:     svgQ('bz-legs'),
  };
}
