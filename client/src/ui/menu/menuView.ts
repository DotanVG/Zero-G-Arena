import { isTouchDevice } from "../../platform";
import type { MatchTeamSize } from "../../../../shared/match";
import { injectDesignTokens } from "../designTokens";
import { SESSION_MENU_GEAR_ICON } from "../sessionMenu";

/* ─────────────────────────────────────────────
   CSS
───────────────────────────────────────────── */
const CSS = `
  @keyframes ob-spin       { to { transform: rotate(360deg); } }
  @keyframes ob-twinkle {
    0%,100% { opacity: calc(var(--o) * 0.4); transform: scale(0.8); }
    50%     { opacity: var(--o);             transform: scale(1.1); }
  }
  @keyframes ob-pulseDot {
    0%,100% { opacity: 0.4; transform: scale(0.9); }
    50%     { opacity: 1;   transform: scale(1.15); }
  }
  @keyframes ob-menuFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── BACKGROUND LAYERS ── */
  .ob-planet {
    position: fixed; left: 50%; bottom: -52vmin; transform: translateX(-50%);
    width: 120vmin; height: 120vmin; border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, rgba(255,190,140,.12), transparent 45%),
      radial-gradient(circle at 50% 50%, #0c1426 0%, #070a12 70%);
    box-shadow:
      inset 0 2vmin 8vmin  rgba(255,180,120,.08),
      inset 0 -6vmin 14vmin rgba(0,0,0,.9),
      0 0 0 1px rgba(255,200,160,.06);
    z-index: 1; pointer-events: none;
  }
  .ob-planet::after {
    content: ""; position: absolute; inset: -1px; border-radius: 50%;
    background: linear-gradient(180deg, rgba(255,210,170,.25) 0%, transparent 14%);
    mix-blend-mode: screen; filter: blur(1px);
  }

  .ob-stars { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
  .ob-stars i {
    position: absolute; width: 1px; height: 1px; background: #fff; border-radius: 50%;
    opacity: var(--o, .6);
    animation: ob-twinkle var(--t, 6s) ease-in-out infinite;
    animation-delay: var(--d, 0s);
  }

  .ob-bg-vignette {
    position: fixed; inset: 0; pointer-events: none; z-index: 2;
    background:
      radial-gradient(ellipse 120% 80% at 50% 110%, transparent 40%, rgba(0,0,0,.75) 85%),
      radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,0,0,.4), transparent 60%);
  }

  .ob-orbit-stage {
    position: fixed; inset: 0; z-index: 2; pointer-events: none;
    display: grid; place-items: center;
    transform-style: preserve-3d;
  }
  .ob-orbit-tilt {
    width: 140vmin; height: 140vmin; position: relative;
    transform-style: preserve-3d;
    transform: rotateX(62deg) rotateZ(0deg);
    transition: transform 1.2s cubic-bezier(.2,.7,.2,1);
  }
  .ob-ring {
    position: absolute; inset: 0; border-radius: 50%;
    border: 1px solid var(--ob-line);
    animation: ob-spin var(--dur, 120s) linear infinite;
  }
  .ob-ring svg  { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .ob-ring text { font-family: var(--ob-mono); font-size: 9px; fill: var(--ob-fg-faint); letter-spacing: 3px; }
  .ob-tick       { stroke: rgba(210,220,240,.22); stroke-width: 1; }
  .ob-tick-major { stroke: rgba(210,220,240,.50); stroke-width: 1; }
  .ob-dot        { fill: var(--ob-cyan); }
  .ob-dot-warm   { fill: var(--ob-magenta); }
  .ob-ring-1 { inset: 0;    --dur: 240s; }
  .ob-ring-2 { inset: 9%;  --dur: 180s; animation-direction: reverse; }
  .ob-ring-3 { inset: 20%; --dur: 140s; }
  .ob-ring-4 { inset: 32%; --dur:  90s; animation-direction: reverse; }
  .ob-ring-5 { inset: 42%; --dur:  60s; }
  .ob-ring-dashed { border-style: dashed; border-color: rgba(210,220,240,.06); }

  .ob-bg-grain {
    position: fixed; inset: -20%; pointer-events: none; z-index: 6;
    opacity: .06; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }

  /* ── CURSOR ── */
  .ob-cursor {
    position: fixed; top: 0; left: 0; pointer-events: none; z-index: 50;
    width: 28px; height: 28px;
    transform: translate(-50%, -50%);
    mix-blend-mode: screen;
    color: var(--ob-cyan);
  }
  .ob-cursor::before {
    content: ""; position: absolute; inset: 0; border-radius: 50%;
    border: 1px solid var(--ob-cyan);
    transition: transform .2s ease, border-color .2s ease;
  }
  .ob-cursor::after {
    content: ""; position: absolute;
    width: 3px; height: 3px; left: 50%; top: 50%;
    transform: translate(-50%,-50%);
    background: var(--ob-cyan); box-shadow: 0 0 8px var(--ob-cyan);
    border-radius: 50%;
  }
  .ob-cursor.ob-hot::before { transform: scale(1.7); border-color: var(--ob-magenta); }
  .ob-cursor.ob-hot::after  { background: var(--ob-magenta); box-shadow: 0 0 10px var(--ob-magenta); }
  .ob-cursor svg { position: absolute; inset: -6px; width: 40px; height: 40px; opacity: .6; }

  /* ── CORNER BRACKETS ── */
  .ob-hud-corner {
    position: fixed; width: 44px; height: 44px;
    border: 1px solid var(--ob-line-2); pointer-events: none; z-index: 10;
  }
  .ob-hud-corner.ob-tl { top: 18px; left: 18px; border-right: none; border-bottom: none; }
  .ob-hud-corner.ob-tr { top: 18px; right: 18px; border-left:  none; border-bottom: none; }
  .ob-hud-corner.ob-bl { bottom: 18px; left: 18px;  border-right: none; border-top: none; }
  .ob-hud-corner.ob-br { bottom: 18px; right: 18px; border-left:  none; border-top: none; }

  /* ── TOP / BOTTOM BARS ── */
  .ob-topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; justify-content: space-between; align-items: center;
    padding: calc(22px + env(safe-area-inset-top, 0px)) 40px 0;
    font-family: var(--ob-mono); font-size: 10px; letter-spacing: 3px;
    color: var(--ob-fg-dim); text-transform: uppercase;
    pointer-events: none;
  }
  .ob-topbar-brand {
    font-family: var(--ob-serif); font-size: 14px; letter-spacing: 6px;
    color: var(--ob-fg); font-weight: 400;
  }
  .ob-topbar-brand em {
    font-style: normal; color: var(--ob-cyan); margin-left: 8px;
    font-family: var(--ob-mono); font-size: 10px; letter-spacing: 3px;
  }
  .ob-topbar-right { display: flex; gap: 22px; align-items: center; }
  .ob-topbar-dot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: var(--ob-cyan); box-shadow: 0 0 8px var(--ob-cyan);
    margin-right: 8px; vertical-align: middle;
  }

  .ob-bottombar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 10;
    display: flex; justify-content: space-between; align-items: flex-end;
    padding: 0 40px max(18px, calc(18px + env(safe-area-inset-bottom, 0px)));
    font-family: var(--ob-mono); font-size: 9px; letter-spacing: 3px;
    color: var(--ob-fg-faint); text-transform: uppercase;
    pointer-events: none;
  }
  .ob-bottombar-tel { display: flex; gap: 28px; }
  .ob-bottombar-tel span b { color: var(--ob-fg-dim); font-weight: 400; }

  /* ── MENU ROOT ── */
  .menu-root {
    position: fixed; inset: 0; z-index: 10;
    display: grid; place-items: center;
    background: radial-gradient(ellipse at 50% 120%, #0d1426 0%, var(--ob-ink-0) 55%, #03060d 100%);
    animation: ob-menuFadeIn .35s ease-out both;
    cursor: none;
  }
  .menu-root * { box-sizing: border-box; }

  /* ── MAIN CONTENT ── */
  .ob-main-wrap {
    position: relative; z-index: 8;
    display: grid; grid-template-columns: 1fr;
    justify-items: center; gap: 28px;
    width: min(900px, 90vw);
    text-align: center;
    color: var(--ob-fg);
    padding: 80px 0 60px;
  }

  .ob-tag {
    font-family: var(--ob-mono); font-size: 10px; letter-spacing: 8px;
    color: var(--ob-fg-faint); text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 14px;
  }
  .ob-tag::before, .ob-tag::after {
    content: ""; width: 40px; height: 1px; background: var(--ob-line-2);
  }

  .ob-title {
    font-family: var(--ob-serif); font-weight: 300;
    font-size: clamp(44px, 8.2vw, 110px);
    letter-spacing: .02em; line-height: .95;
    margin: 0; color: #fff;
    text-shadow: 0 0 40px rgba(255,255,255,.05);
    white-space: nowrap; text-transform: uppercase;
    position: relative;
  }
  .ob-letter {
    position: relative; z-index: 1;
    display: inline-block;
    transition: transform .4s cubic-bezier(.2,.7,.2,1), text-shadow .4s;
    will-change: transform;
  }
  .ob-subtitle {
    font-family: var(--ob-mono); font-size: 11px; letter-spacing: 6px;
    color: var(--ob-fg-dim); text-transform: uppercase;
    display: flex; align-items: center; gap: 18px; justify-content: center;
  }
  .ob-pulse {
    width: 6px; height: 6px; background: var(--ob-magenta); border-radius: 50%;
    box-shadow: 0 0 10px var(--ob-magenta);
    animation: ob-pulseDot 1.8s ease-in-out infinite;
    flex-shrink: 0;
  }

  /* ── CALLSIGN ── */
  .ob-callsign { display: grid; gap: 8px; justify-items: center; }
  .ob-callsign-label {
    font-family: var(--ob-mono); font-size: 9px; letter-spacing: 6px;
    color: var(--ob-fg-faint); text-transform: uppercase;
  }
  .ob-callsign-box {
    position: relative; display: flex; align-items: center;
    border: 1px solid var(--ob-line-2);
    background: rgba(10,14,26,.6); backdrop-filter: blur(8px);
    padding: 14px 22px; min-width: 340px;
    transition: border-color .25s, box-shadow .25s;
  }
  .ob-callsign-box:hover { border-color: rgba(255,255,255,.2); }
  .ob-callsign-box:focus-within {
    border-color: var(--ob-cyan);
    box-shadow: 0 0 0 1px var(--ob-cyan-soft), 0 0 40px rgba(120,200,255,.06);
  }
  .ob-callsign-box:has(input.menu-input--error) {
    border-color: rgba(255,115,156,.56) !important;
    box-shadow: 0 0 0 2px rgba(255,115,156,.12) !important;
  }
  .ob-callsign-prefix {
    font-family: var(--ob-mono); font-size: 10px; letter-spacing: 3px;
    color: var(--ob-fg-faint); margin-right: 12px; text-transform: uppercase;
    white-space: nowrap;
  }
  .ob-callsign-box input {
    flex: 1; background: transparent; border: none; outline: none;
    color: var(--ob-fg); font-family: var(--ob-serif); font-size: 20px;
    letter-spacing: .12em; text-align: left;
    caret-color: var(--ob-cyan); cursor: text;
  }
  .ob-callsign-box input::placeholder { color: var(--ob-fg-faint); }
  .ob-bracket {
    position: absolute; top: -5px; bottom: -5px; width: 10px;
    border: 1px solid var(--ob-cyan); opacity: 0; transition: opacity .25s;
  }
  .ob-bracket.ob-l { left: -5px;  border-right: none; }
  .ob-bracket.ob-r { right: -5px; border-left:  none; }
  .ob-callsign-box:focus-within .ob-bracket { opacity: .8; }
  .ob-name-error {
    min-height: 18px; color: #ff8eb7;
    font-family: var(--ob-mono); font-size: 11px; letter-spacing: 2px;
    text-align: center;
  }

  /* ── MATCH GRID ── */
  .ob-match-grid {
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 14px; width: 100%; max-width: 880px;
  }
  .ob-match-card {
    position: relative; padding: 20px 12px 18px;
    background: rgba(10,14,26,.5); backdrop-filter: blur(6px);
    border: 1px solid var(--ob-line); cursor: none;
    transition: border-color .3s, background .3s, transform .3s;
    text-align: center; overflow: hidden;
    color: var(--ob-fg); font-family: var(--ob-serif);
  }
  .ob-match-card::before {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, transparent, var(--ob-cyan-soft));
    opacity: 0; transition: opacity .3s;
  }
  .ob-match-card:hover { border-color: rgba(255,255,255,.25); transform: translateY(-2px); }
  .ob-match-card:hover::before { opacity: .5; }
  .ob-match-card.ob-selected { border-color: var(--ob-cyan); background: rgba(30,60,90,.35); }
  .ob-match-card.ob-selected::before { opacity: 1; }
  .ob-card-size {
    font-family: var(--ob-serif); font-size: 30px; font-weight: 300;
    color: var(--ob-fg); letter-spacing: .02em; position: relative; z-index: 1;
  }
  .ob-card-size em { font-style: normal; color: var(--ob-fg-faint); font-size: 17px; margin: 0 3px; }
  .ob-card-name {
    font-family: var(--ob-mono); font-size: 9px; letter-spacing: 3px;
    color: var(--ob-fg-dim); text-transform: uppercase; margin-top: 5px;
    position: relative; z-index: 1;
  }
  .ob-card-bots {
    font-family: var(--ob-mono); font-size: 8px; letter-spacing: 2px;
    color: var(--ob-fg-faint); text-transform: uppercase; margin-top: 8px;
    position: relative; z-index: 1;
  }

  /* ── LAUNCH BUTTONS ── */
  .ob-launch-row,
  .ob-settings-row {
    display: flex;
    gap: 16px;
    justify-content: center;
    width: 100%;
  }
  .ob-settings-row { margin-top: -4px; }
  .ob-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: min(194px, 100%);
    min-height: 56px;
    padding: 18px 38px;
    background: rgba(10,14,26,.55); backdrop-filter: blur(8px);
    border: 1px solid var(--ob-line-2); color: var(--ob-fg);
    font-family: var(--ob-mono); font-size: 11px; letter-spacing: 5px;
    text-transform: uppercase; cursor: none;
    transition: border-color .25s, background .25s, color .25s, transform .25s;
    overflow: hidden;
  }
  .ob-btn-label {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
  }
  .ob-btn-arrow { font-family: var(--ob-serif); font-size: 16px; letter-spacing: 0; transition: transform .3s; }
  .ob-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    transition: transform .3s ease;
  }
  .ob-btn-icon svg { width: 16px; height: 16px; }
  .ob-btn::before {
    content: ""; position: absolute; inset: 0;
    opacity: 0; transition: opacity .3s; z-index: 1;
  }
  .ob-btn-primary::before  { background: radial-gradient(circle at var(--mx,50%) var(--my,50%), var(--ob-magenta-soft), transparent 60%); }
  .ob-btn-secondary::before{ background: radial-gradient(circle at var(--mx,50%) var(--my,50%), var(--ob-cyan-soft),    transparent 60%); }
  .ob-btn-utility::before  { background: radial-gradient(circle at var(--mx,50%) var(--my,50%), rgba(140,225,255,.12), transparent 62%); }
  .ob-btn:hover { border-color: rgba(255,255,255,.4); transform: translateY(-1px); }
  .ob-btn:hover::before { opacity: 1; }
  .ob-btn:hover .ob-btn-arrow { transform: translateX(6px); }
  .ob-btn:hover .ob-btn-icon { transform: rotate(18deg) scale(1.06); }
  .ob-btn-primary:hover  { color: oklch(0.88 0.12 60);  border-color: var(--ob-magenta); }
  .ob-btn-secondary:hover{ color: var(--ob-cyan); border-color: var(--ob-cyan); }
  .ob-btn-utility:hover  { color: var(--ob-cyan); border-color: rgba(140,225,255,.42); }
  .ob-btn:focus-visible { outline: 2px solid var(--ob-cyan); outline-offset: 3px; }
  .ob-btn-corner {
    position: absolute; width: 8px; height: 8px; z-index: 3;
    border: 1px solid currentColor; opacity: .5;
  }
  .ob-btn-corner.ob-tl { top: 4px; left: 4px;   border-right: none; border-bottom: none; }
  .ob-btn-corner.ob-tr { top: 4px; right: 4px;   border-left:  none; border-bottom: none; }
  .ob-btn-corner.ob-bl { bottom: 4px; left: 4px;  border-right: none; border-top:    none; }
  .ob-btn-corner.ob-br { bottom: 4px; right: 4px; border-left:  none; border-top:    none; }

  /* ── TUTORIAL BUTTON ── */
  .ob-tutorial-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    max-width: 880px;
    padding: 16px 38px;
    background: rgba(255, 125, 248, 0.06);
    border: 1px solid rgba(255, 125, 248, 0.28);
    color: var(--ob-fg);
    font-family: var(--ob-mono);
    text-transform: uppercase;
    cursor: none;
    overflow: hidden;
    transition: border-color .25s, background .25s, transform .25s;
  }
  .ob-tutorial-btn::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at var(--mx,50%) var(--my,50%), var(--ob-magenta-soft), transparent 60%);
    opacity: 0;
    transition: opacity .3s;
    z-index: 1;
  }
  .ob-tutorial-btn:hover {
    border-color: var(--ob-magenta);
    background: rgba(255, 125, 248, 0.1);
    transform: translateY(-1px);
  }
  .ob-tutorial-btn:hover::before { opacity: 1; }
  .ob-tutorial-btn-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    position: relative;
    z-index: 2;
  }
  .ob-tutorial-btn-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 5px;
    color: var(--ob-magenta);
  }
  .ob-tutorial-btn-sub {
    font-size: 9px;
    letter-spacing: 3px;
    color: var(--ob-fg-faint);
  }
  .ob-tutorial-btn-arrow {
    font-family: var(--ob-serif);
    font-size: 20px;
    color: var(--ob-magenta);
    letter-spacing: 0;
    position: relative;
    z-index: 2;
    transition: transform .3s;
  }
  .ob-tutorial-btn:hover .ob-tutorial-btn-arrow { transform: translateX(6px); }

  /* hidden select keeps controller wiring intact */
  .ob-match-select-hidden { display: none; }

  /* ── RESPONSIVE ── */
  @media (max-width: 920px) {
    .ob-topbar-right .ob-clock { display: none; }
  }
  @media (max-width: 640px) {
    .ob-match-grid   { grid-template-columns: repeat(3, 1fr); }
    .ob-launch-row   { flex-direction: column; align-items: center; }
    .ob-settings-row { margin-top: 0; }
    .ob-callsign-box { min-width: 0; width: 90vw; }
    .menu-root       { cursor: auto; overflow-y: auto; align-items: start; }
    .ob-cursor       { display: none; }
    .ob-topbar  { padding-left: 16px; padding-right: 16px; padding-top: calc(14px + env(safe-area-inset-top, 0px)); }
    .ob-bottombar { padding-left: 16px; padding-right: 16px;
                    padding-bottom: max(14px, env(safe-area-inset-bottom, 14px)); }
    .ob-hud-corner { display: none; }
    .ob-main-wrap {
      gap: 18px;
      padding: 0 0 max(70px, calc(50px + env(safe-area-inset-bottom, 0px)));
      padding-top: calc(64px + env(safe-area-inset-top, 0px));
      width: min(640px, 96vw);
    }
    .ob-title { font-size: clamp(36px, 10vw, 64px); }
    .ob-match-card { padding: 14px 8px 12px; }
    .ob-card-size  { font-size: 22px; }
    .ob-tutorial-btn { padding: 12px 18px; }
    .ob-tutorial-btn-sub { display: none; }
    .ob-btn { width: min(320px, 100%); padding: 16px 24px; }
  }
  @media (max-width: 420px) {
    .ob-match-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .ob-title      { font-size: clamp(30px, 9vw, 48px); white-space: normal; text-align: center; }
    .ob-subtitle   { font-size: 9px; letter-spacing: 4px; }
    .ob-tag        { font-size: 8px; letter-spacing: 5px; }
    .ob-topbar-brand { font-size: 11px; letter-spacing: 4px; }
    .ob-topbar-brand em { display: none; }
  }

  /* ── Mobile landscape (short viewport) ── */
  @media (max-height: 500px) {
    .ob-main-wrap {
      gap: 12px;
      padding: 52px 0 max(60px, calc(44px + env(safe-area-inset-bottom, 0px)));
      padding-top: calc(52px + env(safe-area-inset-top, 0px));
    }
    .menu-root { overflow-y: auto; }
    .ob-title  { font-size: clamp(28px, 6vw, 56px); }
    .ob-subtitle, .ob-tag { display: none; }
    .ob-callsign-label { display: none; }
    .ob-match-grid { gap: 8px; }
    .ob-match-card { padding: 10px 8px; }
    .ob-card-size  { font-size: 18px; }
    .ob-card-bots  { display: none; }
    .ob-tutorial-btn { padding: 10px 14px; }
    .ob-tutorial-btn-sub { display: none; }
    .ob-btn { width: min(280px, 100%); padding: 12px 20px; }
  }
  @media (max-height: 700px) and (min-height: 501px) {
    .ob-main-wrap { gap: 18px; padding: 60px 0 40px; }
    .ob-title { font-size: clamp(34px, 7vw, 80px); }
  }

  /* ── Touch: no-hover transition tweak for orbit ── */
  @media (hover: none) {
    .ob-title-waves { display: none !important; }
    .ob-orbit-tilt  { transition: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ob-ring, .ob-stars i, .ob-pulse, .menu-root { animation: none !important; }
    .ob-title-waves { display: none; }
  }
`;

/* ─────────────────────────────────────────────
   EXPORTED INTERFACE (unchanged from original)
───────────────────────────────────────────── */
export interface MenuElements {
  container: HTMLDivElement;
  root: HTMLElement;
  nameInput: HTMLInputElement;
  nameError: HTMLElement;
  matchSizeSelect: HTMLSelectElement;
  playSoloButton: HTMLButtonElement;
  playOnlineButton: HTMLButtonElement;
  openSettingsButton: HTMLButtonElement;
  playTutorialButton: HTMLButtonElement;
}

/* ─────────────────────────────────────────────
   STYLE INJECTION (called by menu.ts controller)
───────────────────────────────────────────── */
export function injectMenuStyle(): HTMLStyleElement {
  injectDesignTokens();
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  return style;
}

/* ─────────────────────────────────────────────
   VIEW FACTORY
───────────────────────────────────────────── */
export function createMenuView(savedName: string, matchSize: MatchTeamSize): MenuElements {
  injectDesignTokens();

  // Map matchSize to the nearest visible card (1,5,10,20 — no 2v2 card shown)
  const cardSizes = [1, 2, 5, 10, 20] as const;
  const matchCardSize: number =
    (cardSizes as readonly number[]).includes(matchSize) ? matchSize : 1;

  const touch = isTouchDevice();

  function cardHtml(size: number, label: string, bots: string): string {
    return `
      <button class="ob-match-card${matchCardSize === size ? " ob-selected" : ""}" data-card-size="${size}">
        <div class="ob-card-size">${size}<em>v</em>${size}</div>
        <div class="ob-card-name">${label}</div>
        <div class="ob-card-bots">${bots}</div>
      </button>`;
  }

  function btn(id: string, mod: string, label: string, iconHtml?: string): string {
    const adornment = iconHtml
      ? `<span class="ob-btn-icon">${iconHtml}</span>`
      : `<span class="ob-btn-arrow">&rarr;</span>`;
    return `
      <button class="ob-btn ob-btn-${mod}" id="${id}">
        <span class="ob-btn-corner ob-tl"></span><span class="ob-btn-corner ob-tr"></span>
        <span class="ob-btn-corner ob-bl"></span><span class="ob-btn-corner ob-br"></span>
        <span class="ob-btn-label">${label} ${adornment}</span>
      </button>`;
  }

  const container = document.createElement("div") as HTMLDivElement;
  container.innerHTML = `
    <div class="menu-root" id="menu-root">

      <!-- BACKGROUND (fixed children; removed with container) -->
      <div class="ob-planet"></div>
      <div class="ob-stars" id="ob-stars"></div>
      <div class="ob-bg-vignette"></div>
      <div class="ob-orbit-stage">
        <div class="ob-orbit-tilt" id="ob-orbit-tilt">
          <div class="ob-ring ob-ring-1">
            <svg viewBox="-200 -200 400 400">
              <g class="ob-ring-ticks"></g>
              <text x="0"    y="-205" text-anchor="middle">R = 4.21 AU · TRAJ 000</text>
              <text x="205"  y="3"    text-anchor="start">090</text>
              <text x="0"    y="213"  text-anchor="middle">180</text>
              <text x="-205" y="3"    text-anchor="end">270</text>
              <circle cx="140"  cy="-140" r="3" class="ob-dot"/>
              <circle cx="-170" cy="85"   r="2" class="ob-dot-warm"/>
            </svg>
          </div>
          <div class="ob-ring ob-ring-2 ob-ring-dashed">
            <svg viewBox="-200 -200 400 400">
              <text x="0" y="-203" text-anchor="middle">ORBITAL TIER II · STANDING BY</text>
            </svg>
          </div>
          <div class="ob-ring ob-ring-3">
            <svg viewBox="-200 -200 400 400">
              <circle cx="0"   cy="-194" r="4"  class="ob-dot"/>
              <circle cx="0"   cy="-194" r="9"  fill="none" stroke="var(--ob-cyan)" stroke-opacity=".4"/>
              <text x="14" y="-188">BREACH α</text>
              <circle cx="165" cy="102"  r="3"  class="ob-dot-warm"/>
              <text x="178" y="108">BREACH β</text>
            </svg>
          </div>
          <div class="ob-ring ob-ring-4 ob-ring-dashed"></div>
          <div class="ob-ring ob-ring-5">
            <svg viewBox="-200 -200 400 400">
              <g id="ob-inner-ticks"></g>
              <text x="0" y="-186" text-anchor="middle">CORE · SYNC 97.4%</text>
            </svg>
          </div>
        </div>
      </div>
      <div class="ob-bg-grain"></div>

      <!-- CURSOR -->
      ${!touch ? `
      <div class="ob-cursor" id="ob-cursor">
        <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width=".8">
          <line x1="20" y1="0"  x2="20" y2="10"/>
          <line x1="20" y1="30" x2="20" y2="40"/>
          <line x1="0"  y1="20" x2="10" y2="20"/>
          <line x1="30" y1="20" x2="40" y2="20"/>
        </svg>
      </div>` : ""}

      <!-- CORNER CHROME -->
      <span class="ob-hud-corner ob-tl"></span>
      <span class="ob-hud-corner ob-tr"></span>
      <span class="ob-hud-corner ob-bl"></span>
      <span class="ob-hud-corner ob-br"></span>

      <!-- TOPBAR -->
      <div class="ob-topbar">
        <div class="ob-topbar-brand">ORBITAL BREACH <em>v0.4 · ZERO-G ARENA</em></div>
        <div class="ob-topbar-right">
          <span><span class="ob-topbar-dot"></span>LINK SYNC</span>
          <span class="ob-clock" id="ob-clock">00:00:00 UTC</span>
        </div>
      </div>

      <!-- MAIN CONTENT -->
      <div class="ob-main-wrap">
        <div class="ob-tag">ZERO-G ARENA · STANDING BY</div>

        <h1 class="ob-title" id="ob-title">ORBITAL BREACH</h1>

        <div class="ob-subtitle">
          <span class="ob-pulse"></span>
          <span>Freeze &middot; Slingshot &middot; Breach</span>
          <span class="ob-pulse"></span>
        </div>

        <div class="ob-callsign">
          <div class="ob-callsign-label">Call Sign</div>
          <label class="ob-callsign-box">
            <span class="ob-bracket ob-l"></span>
            <span class="ob-callsign-prefix">[ CS-07 ]</span>
            <input
              type="text"
              id="menu-name"
              maxlength="16"
              placeholder="ENTER CALL SIGN"
              value="${escapeHtml(savedName)}"
              autocomplete="off"
              spellcheck="false"
            />
            <span class="ob-bracket ob-r"></span>
          </label>
          <div class="ob-name-error" id="menu-name-error" aria-live="polite"></div>
        </div>

        <button id="btn-play-tutorial" class="ob-tutorial-btn">
          <span class="ob-btn-corner ob-tl" style="border-color:var(--ob-magenta);opacity:.4;"></span>
          <span class="ob-btn-corner ob-tr" style="border-color:var(--ob-magenta);opacity:.4;"></span>
          <span class="ob-btn-corner ob-bl" style="border-color:var(--ob-magenta);opacity:.4;"></span>
          <span class="ob-btn-corner ob-br" style="border-color:var(--ob-magenta);opacity:.4;"></span>
          <span class="ob-tutorial-btn-main">
            <span class="ob-tutorial-btn-label">Tutorial</span>
            <span class="ob-tutorial-btn-sub">Empty Arena · Bots Off · First Flight Guide</span>
          </span>
          <span class="ob-tutorial-btn-arrow">→</span>
        </button>

        <div class="ob-match-grid" id="ob-match-grid">
          ${cardHtml(1,  "Skirmish",   "1 bot")}
          ${cardHtml(2,  "Duos",       "3 bots")}
          ${cardHtml(5,  "Squad Clash","9 bots")}
          ${cardHtml(10, "Arena Rush", "19 bots")}
          ${cardHtml(20, "Zero-G War", "39 bots")}
        </div>

        <!-- Hidden select keeps the controller's .value + change listener working -->
        <select class="ob-match-select-hidden" id="menu-match-size" aria-label="Solo match size">
          <option value="1"  ${matchSize === 1  ? "selected" : ""}>1v1 Skirmish</option>
          <option value="2"  ${matchSize === 2  ? "selected" : ""}>2v2 Duos</option>
          <option value="5"  ${matchSize === 5  ? "selected" : ""}>5v5 Squad Clash</option>
          <option value="10" ${matchSize === 10 ? "selected" : ""}>10v10 Arena Rush</option>
          <option value="20" ${matchSize === 20 ? "selected" : ""}>20v20 Zero-G War</option>
        </select>

        <div class="ob-launch-row">
          ${btn("btn-play-solo",   "primary",   "Engage Solo")}
          ${btn("btn-play-online", "secondary", "Join Online")}
        </div>
        <div class="ob-settings-row">
          ${btn("btn-open-settings", "utility", "Settings", SESSION_MENU_GEAR_ICON)}
        </div>
      </div>

      <!-- BOTTOMBAR -->
      <div class="ob-bottombar">
        <div class="ob-bottombar-tel">
          <span>CLIENT <b>CY-07</b></span>
          <span>TICK <b>20 Hz</b></span>
        </div>
        <div>© 2026 ORBITAL BREACH</div>
      </div>

    </div>
  `;

  document.body.appendChild(container);

  // Wire visual cards → hidden select
  const matchSelect = container.querySelector<HTMLSelectElement>("#menu-match-size")!;
  container.querySelectorAll<HTMLElement>(".ob-match-card").forEach((card) => {
    card.addEventListener("click", () => {
      container.querySelectorAll(".ob-match-card").forEach((c) => c.classList.remove("ob-selected"));
      card.classList.add("ob-selected");
      const size = card.dataset["cardSize"];
      if (size) {
        matchSelect.value = size;
        matchSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });

  // Launch background animations
  initMenuFx(container);

  return {
    container,
    root:              container.querySelector<HTMLElement>("#menu-root")!,
    nameInput:         container.querySelector<HTMLInputElement>("#menu-name")!,
    nameError:         container.querySelector<HTMLElement>("#menu-name-error")!,
    matchSizeSelect:   matchSelect,
    playSoloButton:    container.querySelector<HTMLButtonElement>("#btn-play-solo")!,
    playOnlineButton:  container.querySelector<HTMLButtonElement>("#btn-play-online")!,
    openSettingsButton:container.querySelector<HTMLButtonElement>("#btn-open-settings")!,
    playTutorialButton:container.querySelector<HTMLButtonElement>("#btn-play-tutorial")!,
  };
}

/* ─────────────────────────────────────────────
   INTERACTIVE FX
───────────────────────────────────────────── */
function initMenuFx(container: HTMLElement): void {
  const root = container.querySelector<HTMLElement>("#menu-root");
  if (!root) return;

  const touch = isTouchDevice();

  // ── 1. Starfield ──
  const starsEl = root.querySelector<HTMLElement>("#ob-stars");
  if (starsEl) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 180; i++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "vw";
      s.style.top  = Math.random() * 100 + "vh";
      const sz = Math.random() < 0.15 ? 2 : 1;
      s.style.width = sz + "px"; s.style.height = sz + "px";
      s.style.setProperty("--o", (0.2 + Math.random() * 0.8).toFixed(2));
      s.style.setProperty("--t", (3 + Math.random() * 7).toFixed(1) + "s");
      s.style.setProperty("--d", (Math.random() * 6).toFixed(1) + "s");
      frag.appendChild(s);
    }
    starsEl.appendChild(frag);
  }

  // ── 2. Ring ticks ──
  const outerTickG = root.querySelector<SVGGElement>(".ob-ring-1 .ob-ring-ticks");
  if (outerTickG) {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const inner = i % 6 === 0 ? 190 : 194;
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", String(Math.cos(a) * inner));
      ln.setAttribute("y1", String(Math.sin(a) * inner));
      ln.setAttribute("x2", String(Math.cos(a) * 200));
      ln.setAttribute("y2", String(Math.sin(a) * 200));
      ln.setAttribute("class", i % 6 === 0 ? "ob-tick-major" : "ob-tick");
      outerTickG.appendChild(ln);
    }
  }
  const innerTickG = root.querySelector<SVGGElement>("#ob-inner-ticks");
  if (innerTickG) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", String(Math.cos(a) * 172));
      ln.setAttribute("y1", String(Math.sin(a) * 172));
      ln.setAttribute("x2", String(Math.cos(a) * 180));
      ln.setAttribute("y2", String(Math.sin(a) * 180));
      ln.setAttribute("stroke", "rgba(210,220,240,0.28)");
      ln.setAttribute("stroke-width", "1");
      innerTickG.appendChild(ln);
    }
  }

  // ── 3. Per-letter title wrap ──
  const titleEl  = root.querySelector<HTMLElement>("#ob-title");
  const wavesCvs = root.querySelector<HTMLCanvasElement>("#ob-title-waves");
  if (titleEl && wavesCvs) {
    wavesCvs.remove();
    titleEl.innerHTML = "";
    titleEl.appendChild(wavesCvs);
    for (const ch of "ORBITAL BREACH") {
      if (ch === " ") { titleEl.appendChild(document.createTextNode(" ")); continue; }
      const s = document.createElement("span");
      s.className = "ob-letter";
      s.textContent = ch;
      titleEl.appendChild(s);
    }
  }

  // ── 4. Sine wave canvas on title hover ──
  if (titleEl && wavesCvs) {
    const ctx = wavesCvs.getContext("2d");
    if (ctx) {
      let W = 0, H = 0, rafWave = 0, waveRunning = false;
      const DPR = Math.min(window.devicePixelRatio || 1, 2);

      const resizeWave = () => {
        const r = wavesCvs.getBoundingClientRect();
        W = Math.max(1, Math.floor(r.width));
        H = Math.max(1, Math.floor(r.height));
        wavesCvs.width  = W * DPR;
        wavesCvs.height = H * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      };
      requestAnimationFrame(() => requestAnimationFrame(resizeWave));
      const ro = new ResizeObserver(resizeWave);
      ro.observe(titleEl);

      const drawWave = (t: number, color: string, phase: number, amp: number, freq: number, speed: number, offset: number) => {
        const mid = H / 2;
        const passes = [
          { dOff: -6, a: 0.06, w: 14 }, { dOff: -3, a: 0.10, w: 8 },
          { dOff:  0, a: 0.28, w:  3 }, { dOff:  3, a: 0.10, w: 8 },
          { dOff:  6, a: 0.06, w: 14 },
        ];
        for (const p of passes) {
          ctx.beginPath(); ctx.strokeStyle = color;
          ctx.globalAlpha = p.a; ctx.lineWidth = p.w; ctx.lineCap = "round";
          for (let x = 0; x <= W; x += 4) {
            const nx = x / W;
            const y = mid
              + Math.sin(nx * freq + t * speed + phase) * amp
              + Math.sin(nx * (freq * 0.47) - t * speed * 0.6 + phase * 1.3) * (amp * 0.45)
              + offset + p.dOff;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };

      let waveStart = performance.now();
      const frameWave = (now: number) => {
        if (!waveRunning) return;
        const t = (now - waveStart) / 1000;
        ctx.clearRect(0, 0, W, H);
        const cs = getComputedStyle(document.documentElement);
        const c  = cs.getPropertyValue("--ob-cyan").trim()    || "#5ccfff";
        const m  = cs.getPropertyValue("--ob-magenta").trim() || "#ff5cd0";
        const amp = Math.min(H * 0.18, 42);
        drawWave(t, c, 0,          amp,       7,  1.6, -amp * 0.4);
        drawWave(t, m, Math.PI,    amp,       7, -1.6,  amp * 0.4);
        drawWave(t, c, Math.PI * 0.5, amp * 0.55, 11, -1.1, 0);
        drawWave(t, m, Math.PI * 1.5, amp * 0.55, 11,  1.1, 0);
        rafWave = requestAnimationFrame(frameWave);
      };
      titleEl.addEventListener("mouseenter", () => {
        waveRunning = true; waveStart = performance.now();
        rafWave = requestAnimationFrame(frameWave);
      });
      titleEl.addEventListener("mouseleave", () => {
        waveRunning = false;
        setTimeout(() => { if (!waveRunning) ctx.clearRect(0, 0, W, H); }, 500);
      });
    }
  }

  // ── 5. Cursor + orbit tilt + letter parallax loop ──
  const cursorEl = root.querySelector<HTMLElement>("#ob-cursor");
  const orbitEl  = root.querySelector<HTMLElement>("#ob-orbit-tilt");
  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let cx = mx, cy = my;
  let rafMain = 0;

  const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
  const onDown = () => cursorEl?.classList.add("ob-hot");
  const onUp   = () => cursorEl?.classList.remove("ob-hot");
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mousedown", onDown);
  window.addEventListener("mouseup",   onUp);

  const mainLoop = () => {
    if (!root.isConnected) return;
    cx += (mx - cx) * 0.25;
    cy += (my - cy) * 0.25;
    if (cursorEl) cursorEl.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    if (orbitEl && !touch) {
      const nx = (mx / window.innerWidth  - 0.5) * 2;
      const ny = (my / window.innerHeight - 0.5) * 2;
      orbitEl.style.transform = `rotateX(${62 + ny * 5}deg) rotateZ(${-nx * 13}deg)`;
    }
    if (titleEl && !touch) {
      titleEl.querySelectorAll<HTMLElement>(".ob-letter").forEach((l) => {
        const r = l.getBoundingClientRect();
        const dx = mx - (r.left + r.width  / 2);
        const dy = my - (r.top  + r.height / 2);
        const d  = Math.sqrt(dx * dx + dy * dy);
        const pull = Math.max(0, 1 - d / 340);
        l.style.transform = `translate(${-(dx / 340) * 12 * pull}px, ${-(dy / 340) * 6 * pull}px)`;
      });
    }
    rafMain = requestAnimationFrame(mainLoop);
  };
  rafMain = requestAnimationFrame(mainLoop);

  // ── 5b. Touch/Windows orbit: auto-animation (no gyro) ──
  if (touch && orbitEl) {
    let autoT = 0;
    let rafMobile = 0;

    const applyOrbit = (nx: number, ny: number) => {
      orbitEl!.style.transform = `rotateX(${62 + ny * 5}deg) rotateZ(${-nx * 13}deg)`;
    };

    const mobileOrbitLoop = () => {
      if (!root.isConnected) return;
      autoT += 0.008;
      applyOrbit(Math.sin(autoT * 0.7), Math.sin(autoT * 0.4) * 0.4);
      rafMobile = requestAnimationFrame(mobileOrbitLoop);
    };

    const reducedMotionMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    const startLoop = () => { if (!rafMobile) rafMobile = requestAnimationFrame(mobileOrbitLoop); };
    const stopLoop  = () => { cancelAnimationFrame(rafMobile); rafMobile = 0; };

    if (!reducedMotionMq?.matches) startLoop();

    reducedMotionMq?.addEventListener("change", (e) => { e.matches ? stopLoop() : startLoop(); });

    const mobMo = new MutationObserver(() => {
      if (!root.isConnected) {
        stopLoop();
        reducedMotionMq?.removeEventListener("change", stopLoop);
        mobMo.disconnect();
      }
    });
    mobMo.observe(document.body, { childList: true });
  }

  // Cleanup once container leaves the DOM
  const mo = new MutationObserver(() => {
    if (!root.isConnected) {
      cancelAnimationFrame(rafMain);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup",   onUp);
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true });

  // ── 6. Button radial hover ──
  root.querySelectorAll<HTMLElement>(".ob-btn, .ob-match-card, .ob-tutorial-btn").forEach((el) => {
    el.addEventListener("mousemove", (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((e.clientX - r.left) / r.width  * 100) + "%");
      el.style.setProperty("--my", ((e.clientY - r.top)  / r.height * 100) + "%");
    });
  });
  root.querySelectorAll<HTMLElement>(".ob-btn-primary, .ob-match-card").forEach((el) => {
    el.addEventListener("mouseenter", () => cursorEl?.classList.add("ob-hot"));
    el.addEventListener("mouseleave", () => cursorEl?.classList.remove("ob-hot"));
  });
  const tutorialBtn = root.querySelector<HTMLElement>(".ob-tutorial-btn");
  tutorialBtn?.addEventListener("mouseenter", () => cursorEl?.classList.add("ob-hot"));
  tutorialBtn?.addEventListener("mouseleave", () => cursorEl?.classList.remove("ob-hot"));

  // ── 7. UTC clock ──
  const clockEl = root.querySelector<HTMLElement>("#ob-clock");
  if (clockEl) {
    const tick = () => {
      if (!root.isConnected) return;
      const d = new Date();
      clockEl.textContent = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
        .map((n) => String(n).padStart(2, "0")).join(":") + " UTC";
      setTimeout(tick, 1000);
    };
    tick();
  }
}

/* ─────────────────────────────────────────────
   UTIL
───────────────────────────────────────────── */
function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":  return "&amp;";
      case "<":  return "&lt;";
      case ">":  return "&gt;";
      case '"':  return "&quot;";
      case "'":  return "&#39;";
      default:   return ch;
    }
  });
}
