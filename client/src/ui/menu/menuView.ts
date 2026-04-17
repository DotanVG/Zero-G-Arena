import { isTouchDevice } from '../../platform';
import type { MatchTeamSize } from '../../../../shared/match';

/**
 * Main menu DOM view: injects the stylesheet on first use, builds the
 * menu element from HTML, and exposes the mutable handles (name input,
 * play button, fade-target root) the controller needs.
 */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

  @keyframes glowPulse {
    0%,100% { text-shadow: 0 0 12px #00ffff, 0 0 36px #00ffff55; }
    50%      { text-shadow: 0 0 22px #00ffff, 0 0 64px #00ffff99, 0 0 90px #00ffff22; }
  }
  @keyframes flicker {
    0%,95%,98%,100% { opacity:1; }
    96%,99%         { opacity:0.78; }
  }
  @keyframes scanlineScroll {
    to { background-position: 0 4px; }
  }
  @keyframes menuFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sectionRise {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cornerPulse {
    0%,80%,100% { opacity: 0.35; }
    90%         { opacity: 0.8; }
  }

  .menu-root {
    position: fixed; inset: 0;
    background: rgba(6,10,18,0.93);
    background-image: repeating-linear-gradient(
      0deg, transparent, transparent 3px, rgba(0,255,255,0.013) 3px, rgba(0,255,255,0.013) 4px
    );
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'Share Tech Mono', monospace; color: #7a8fa8; z-index: 300;
    animation: scanlineScroll 0.12s steps(1) infinite, menuFadeIn 0.35s ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    .menu-root          { animation: menuFadeIn 0.35s ease-out both; }
    .menu-title         { animation: none !important; }
    .menu-section,
    .menu-subtitle,
    .menu-divider,
    .menu-controls      { animation: none !important; opacity: 1 !important; transform: none !important; }
  }

  .menu-corner {
    position: absolute;
    width: 18px; height: 18px;
    border-color: #00ffff33;
    border-style: solid;
    animation: cornerPulse 7s ease-in-out infinite;
  }
  .menu-corner--tl { top: 18px; left: 18px; border-width: 1px 0 0 1px; }
  .menu-corner--tr { top: 18px; right: 18px; border-width: 1px 1px 0 0; animation-delay: 1.75s; }
  .menu-corner--bl { bottom: 18px; left: 18px; border-width: 0 0 1px 1px; animation-delay: 3.5s; }
  .menu-corner--br { bottom: 18px; right: 18px; border-width: 0 1px 1px 0; animation-delay: 5.25s; }

  .menu-title {
    font-size: 68px; letter-spacing: 14px; font-weight: normal;
    color: #00ffff;
    animation: glowPulse 2.8s ease-in-out infinite, flicker 10s infinite;
    margin-bottom: 8px;
    text-rendering: geometricPrecision;
  }
  .menu-subtitle {
    font-size: 12px; letter-spacing: 6px; color: #4477aa; margin-bottom: 56px;
    text-transform: uppercase;
    animation: sectionRise 0.5s ease-out 0.1s both;
  }
  .menu-section {
    margin-bottom: 32px; text-align: center;
    animation: sectionRise 0.5s ease-out 0.2s both;
  }
  .menu-label {
    font-size: 10px; letter-spacing: 4px; color: #5d7a96; margin-bottom: 14px;
    text-transform: uppercase;
  }
  .menu-input {
    background: rgba(0,0,0,0.5); border: 1px solid #2a3d50;
    color: #00ccff; font-family: 'Share Tech Mono', monospace; font-size: 15px;
    padding: 12px 22px; outline: none; letter-spacing: 2px;
    border-radius: 2px; width: 260px; text-align: center;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    caret-color: #00ffff;
  }
  .menu-input::placeholder { color: #2d4a62; }
  .menu-input:hover:not(:focus) { border-color: #3a5568; }
  .menu-input:focus { border-color: #00ffff55; box-shadow: 0 0 0 1px #00ffff18 inset; }

  .menu-divider {
    width: 360px; height: 1px;
    background: linear-gradient(90deg, transparent, #2a4a60, transparent);
    margin: 4px 0 32px;
    animation: sectionRise 0.5s ease-out 0.3s both;
  }
  .menu-btn {
    background: rgba(0,255,255,0.05);
    border: 1px solid #00ffff44;
    color: #00bbcc; font-family: 'Share Tech Mono', monospace; font-size: 16px;
    letter-spacing: 5px; padding: 16px 64px; cursor: pointer;
    text-transform: uppercase; transition: background 0.15s ease, border-color 0.15s ease,
      color 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease;
    border-radius: 2px;
    animation: sectionRise 0.5s ease-out 0.38s both;
  }
  .menu-btn:hover {
    background: rgba(0,255,255,0.14); border-color: #00ffff88;
    color: #00ffff; text-shadow: 0 0 10px #00ffff99;
    box-shadow: 0 0 22px rgba(0,255,255,0.12) inset, 0 0 10px rgba(0,255,255,0.07);
  }
  .menu-btn:active {
    transform: translateY(1px) scale(0.985);
    background: rgba(0,255,255,0.2);
    box-shadow: 0 0 28px rgba(0,255,255,0.18) inset;
    transition-duration: 0.06s;
  }
  .menu-btn:focus-visible {
    outline: 1px solid #00ffff77;
    outline-offset: 3px;
  }

  .menu-controls {
    margin-top: 40px; font-size: 11px; color: #3e5568; letter-spacing: 1.5px;
    text-align: center; line-height: 2.2;
    animation: sectionRise 0.5s ease-out 0.48s both;
  }
  .menu-key {
    display: inline-block;
    color: #5d8099;
    background: rgba(0,200,255,0.06);
    border: 1px solid #2a4050;
    border-radius: 2px;
    padding: 0 5px 1px;
    font-size: 9px; letter-spacing: 1px;
    margin: 0 2px; vertical-align: middle;
    font-family: 'Share Tech Mono', monospace;
  }

  .menu-version {
    position: fixed; bottom: 12px; right: 16px;
    font-size: 10px; color: #2a3d50; letter-spacing: 2px;
    font-family: 'Share Tech Mono', monospace;
  }

  @media (max-width: 540px) {
    .menu-title    { font-size: 36px; letter-spacing: 6px; }
    .menu-subtitle { font-size: 10px; letter-spacing: 3px; margin-bottom: 32px; }
    .menu-section  { margin-bottom: 20px; }
    .menu-divider  { width: 80%; }
    .menu-input    { width: 80%; max-width: 260px; padding: 10px 16px; }
    .menu-btn      { padding: 14px 44px; font-size: 14px; letter-spacing: 4px; }
    .menu-controls { font-size: 10px; line-height: 2.0; margin-top: 24px; padding: 0 16px; }
  }

  /* Landscape mobile: reduce vertical rhythm to fit in ~430px viewport height */
  @media (max-height: 560px) {
    .menu-title    { font-size: 30px; letter-spacing: 6px; margin-bottom: 4px; }
    .menu-subtitle { font-size: 9px; letter-spacing: 3px; margin-bottom: 14px; }
    .menu-section  { margin-bottom: 10px; }
    .menu-label    { font-size: 9px; letter-spacing: 3px; margin-bottom: 6px; }
    .menu-divider  { margin: 2px 0 12px; width: 80%; }
    .menu-input    { padding: 8px 16px; font-size: 13px; width: 220px; }
    .menu-btn      { padding: 10px 40px; font-size: 13px; letter-spacing: 4px; }
    .menu-controls { font-size: 9px; line-height: 1.75; margin-top: 10px; padding: 0 24px; }
  }
`;

export interface MenuElements {
  container: HTMLDivElement;
  root: HTMLElement;
  nameInput: HTMLInputElement;
  matchSizeSelect: HTMLSelectElement;
  playButton: HTMLButtonElement;
}

export function injectMenuStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  return style;
}

export function createMenuView(savedName: string, matchSize: MatchTeamSize): MenuElements {
  const mobile = isTouchDevice();
  const controlsHtml = mobile
    ? `Drag screen to look &nbsp;&middot;&nbsp; Left stick walks in gravity room<br>
       <span class="menu-key">FIRE</span> Freeze shot &nbsp;&middot;&nbsp;
       <span class="menu-key">GRAB</span> Grip bar &nbsp;&middot;&nbsp;
       <span class="menu-key">JUMP&nbsp;/&nbsp;LAUNCH</span> Hold &amp; drag down to charge, release to launch<br>
       <span class="menu-key">3RD&nbsp;/&nbsp;1ST</span> Toggle camera view`
    : `<span class="menu-key">WASD</span> Move &nbsp;&middot;&nbsp;
       <span class="menu-key">E</span> Grab bar &nbsp;&middot;&nbsp;
       <span class="menu-key">SPACE</span> Charge launch<br>
       <span class="menu-key">LMB</span> Freeze shot &nbsp;&middot;&nbsp;
       <span class="menu-key">V</span> Third-person view &nbsp;&middot;&nbsp;
       <span class="menu-key">B</span> Selfie view<br>
       <span class="menu-key">MOUSE</span> Look &nbsp;&middot;&nbsp;
       <span class="menu-key">ESC</span> Release cursor`;

  const container = document.createElement('div');
  container.innerHTML = `
    <div class="menu-root" id="menu-root">
      <span class="menu-corner menu-corner--tl"></span>
      <span class="menu-corner menu-corner--tr"></span>
      <span class="menu-corner menu-corner--bl"></span>
      <span class="menu-corner menu-corner--br"></span>

      <div class="menu-title">ORBITAL BREACH</div>
      <div class="menu-subtitle">Zero-G Arena Shooter &middot; Vibe Jam 2026</div>

      <div class="menu-section">
        <div class="menu-label">Call Sign</div>
        <input class="menu-input" id="menu-name" type="text"
          placeholder="ENTER NAME" maxlength="16" value="${escapeHtml(savedName)}"
          autocomplete="off" inputmode="${mobile ? 'text' : 'text'}" />
      </div>

      <div class="menu-section">
        <div class="menu-label">Solo Match Size</div>
        <select class="menu-input" id="menu-match-size" aria-label="Solo match size">
          <option value="1" ${matchSize === 1 ? 'selected' : ''}>1v1 Skirmish</option>
          <option value="5" ${matchSize === 5 ? 'selected' : ''}>5v5 Squad Clash</option>
          <option value="10" ${matchSize === 10 ? 'selected' : ''}>10v10 Arena Rush</option>
          <option value="20" ${matchSize === 20 ? 'selected' : ''}>20v20 Zero-G War</option>
        </select>
      </div>

      <div class="menu-divider"></div>

      <div class="menu-section">
        <button class="menu-btn" id="btn-play">PLAY SOLO</button>
      </div>

      <div class="menu-controls">${controlsHtml}</div>

      <div class="menu-version">v0.1.0 &middot; ORBITAL BREACH</div>
    </div>
  `;
  document.body.appendChild(container);

  return {
    container,
    root: container.querySelector<HTMLElement>('#menu-root')!,
    nameInput: container.querySelector<HTMLInputElement>('#menu-name')!,
    matchSizeSelect: container.querySelector<HTMLSelectElement>('#menu-match-size')!,
    playButton: container.querySelector<HTMLButtonElement>('#btn-play')!,
  };
}

function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
    }
    return ch;
  });
}
