/**
 * Static DOM structure for the in-game HUD. Every mutable element is
 * exposed by `id` so the controller can tweak text and visibility
 * without hunting through markup. Styles are inlined to keep the HUD
 * self-contained (no global stylesheet dependency).
 */
const HUD_MARKUP = `
  <div id="hud-score-wrap" style="
    position:absolute;left:50%;top:18px;
    transform:translateX(-50%);
    display:flex;flex-direction:column;align-items:center;gap:6px;
  ">
    <div id="hud-score-row" style="
      display:flex;align-items:center;gap:14px;
    ">
      <div id="hud-score-team0" style="
        width:16px;height:16px;border-radius:50%;
        background:radial-gradient(circle, rgba(170,255,255,0.95) 0%, rgba(0,255,255,0.85) 34%, rgba(0,255,255,0.15) 72%, rgba(0,255,255,0) 100%);
        box-shadow:0 0 14px rgba(0,255,255,0.85), inset 0 0 6px rgba(255,255,255,0.6);
        border:1px solid rgba(170,255,255,0.9);
      "></div>

      <div id="hud-score" style="
        font-size:20px;letter-spacing:0.08em;
        text-shadow:0 0 10px rgba(0,255,255,0.5);
      ">0 - 0</div>

      <div id="hud-score-team1" style="
        width:16px;height:16px;border-radius:50%;
        background:radial-gradient(circle, rgba(255,200,250,0.95) 0%, rgba(255,0,255,0.85) 34%, rgba(255,0,255,0.15) 72%, rgba(255,0,255,0) 100%);
        box-shadow:0 0 14px rgba(255,0,255,0.8), inset 0 0 6px rgba(255,255,255,0.55);
        border:1px solid rgba(255,200,250,0.9);
      "></div>
    </div>

    <div id="hud-round-timer" style="
      display:none;font-size:15px;letter-spacing:0.18em;
      color:#d8f7ff;text-shadow:0 0 10px rgba(0,255,255,0.35);
    ">02:00</div>
  </div>

  <div id="hud-countdown" style="
    display:none;position:absolute;left:50%;top:38%;
    transform:translate(-50%,-50%);font-size:90px;font-weight:bold;
    color:#fff;text-shadow:0 0 40px #00ffff;letter-spacing:0.05em;
  ">10</div>

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
    box-shadow:0 0 8px rgba(255,255,255,0.3);
  "></div>

  <div id="hud-breach" style="
    display:none;position:absolute;bottom:22px;left:50%;
    transform:translateX(-50%);font-size:13px;color:#88ddff;opacity:0.75;
    white-space:nowrap;
  ">BREACH ROOM - GRAVITY ACTIVE</div>

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
    align-items:center;justify-content:center;
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
  scoreWrap: HTMLDivElement;
  countdown: HTMLDivElement;
  objective: HTMLDivElement;
  crosshair: HTMLDivElement;
  score: HTMLDivElement;
  scoreTeam0: HTMLDivElement;
  scoreTeam1: HTMLDivElement;
  roundTimer: HTMLDivElement;
  breach: HTMLDivElement;
  grab: HTMLDivElement;
  powerWrap: HTMLDivElement;
  powerBar: HTMLDivElement;
  powerLabel: HTMLDivElement;
  damage: HTMLDivElement;
  roundEnd: HTMLDivElement;
  tab: HTMLDivElement;
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

  return {
    root,
    scoreWrap: q('hud-score-wrap'),
    countdown: q('hud-countdown'),
    objective: q('hud-objective'),
    crosshair: q('hud-crosshair'),
    score: q('hud-score'),
    scoreTeam0: q('hud-score-team0'),
    scoreTeam1: q('hud-score-team1'),
    roundTimer: q('hud-round-timer'),
    breach: q('hud-breach'),
    grab: q('hud-grab'),
    powerWrap: q('hud-power-wrap'),
    powerBar: q('hud-power-bar'),
    powerLabel: q('hud-power-label'),
    damage: q('hud-damage'),
    roundEnd: q('hud-round-end'),
    tab: q('hud-tab'),
  };
}
