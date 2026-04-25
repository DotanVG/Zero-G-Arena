/* ─────────────────────────────────────────────
   WELCOME SCREEN VIEW
   Parallax landing page before the main menu.
───────────────────────────────────────────── */

const CSS = `
  .wc-root {
    position: fixed; inset: 0; z-index: 20;
    background: #04060e;
    overflow: hidden;
    cursor: none;
    touch-action: none;
    animation: wc-fade-in .6s ease both;
  }
  @media (pointer: coarse) { .wc-root { cursor: auto; } }

  @keyframes wc-fade-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes wc-fade-out { from { opacity: 1; } to { opacity: 0; } }
  .wc-root.wc-fadeout { animation: wc-fade-out .3s ease forwards; }

  .wc-stage { position: fixed; inset: 0; overflow: hidden; }

  .wc-layer {
    position: absolute;
    background: url('/orbital-breach-art.png') center / contain no-repeat;
    background-color: #04060e;
    will-change: transform;
    transform-origin: center center;
    inset: -6%;
  }

  /* ── Bottom UI bar ── */
  .wc-ui {
    position: fixed; inset: 0; z-index: 10;
    display: flex; align-items: flex-end; justify-content: center;
    padding-bottom: clamp(48px, 22vh, 160px);
    pointer-events: none;
  }

  /* ── BREACH button ── */
  .wc-btn {
    pointer-events: auto;
    position: relative;
    padding: clamp(14px,2vh,22px) clamp(44px,8vw,96px);
    background: rgba(4, 6, 14, 0.48);
    border: 1px solid rgba(255,255,255,0.28);
    color: #fff;
    font-family: var(--ob-mono, "JetBrains Mono", monospace);
    font-size: clamp(11px, 1.5vw, 15px);
    letter-spacing: clamp(4px, 1vw, 9px);
    text-transform: uppercase;
    cursor: none;
    overflow: hidden;
    touch-action: manipulation;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    transition: border-color .3s, box-shadow .3s, transform .15s;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  @media (pointer: coarse) { .wc-btn { cursor: pointer; } }

  .wc-btn::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(
      circle at var(--bx,50%) var(--by,50%),
      rgba(0,229,255,.30) 0%,
      rgba(255,28,255,.22) 45%,
      transparent 70%
    );
    opacity: 0;
    transition: opacity .35s;
  }

  .wc-btn:hover::before,
  .wc-btn:focus::before { opacity: 1; }

  .wc-btn:hover,
  .wc-btn:focus {
    border-color: rgba(255,255,255,.7);
    box-shadow:
      0 0 0 1px rgba(0,229,255,.25),
      0 0 40px rgba(0,229,255,.15),
      0 0 40px rgba(255,28,255,.15);
  }

  .wc-btn:active { transform: scale(0.975); }

  /* Corner tick marks */
  .wc-c {
    position: absolute; width: 8px; height: 8px;
    border: 1px solid rgba(255,255,255,.45);
    transition: width .3s, height .3s, border-color .3s;
  }
  .wc-btn:hover .wc-c { width: 13px; height: 13px; border-color: #fff; }
  .wc-c.tl { top:    4px; left:  4px; border-right: none; border-bottom: none; }
  .wc-c.tr { top:    4px; right: 4px; border-left:  none; border-bottom: none; }
  .wc-c.bl { bottom: 4px; left:  4px; border-right: none; border-top:    none; }
  .wc-c.br { bottom: 4px; right: 4px; border-left:  none; border-top:    none; }

  .wc-btn-label {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: 12px;
  }

  .wc-arrow {
    font-size: 1.3em; letter-spacing: 0;
    transition: transform .3s cubic-bezier(.2,.8,.2,1);
  }
  .wc-btn:hover .wc-arrow { transform: translateX(8px); }
`;

let styleEl: HTMLStyleElement | null = null;

export function injectWelcomeStyle(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

export interface WelcomeElements {
  root: HTMLDivElement;
  layer: HTMLDivElement;
  btn: HTMLButtonElement;
}

export function createWelcomeView(): WelcomeElements {
  const root = document.createElement('div');
  root.className = 'wc-root';
  root.innerHTML = `
    <div class="wc-stage">
      <div class="wc-layer" id="wc-layer" data-depth="0.012"></div>
    </div>
    <div class="wc-ui">
      <button class="wc-btn" id="wc-btn">
        <span class="wc-c tl"></span>
        <span class="wc-c tr"></span>
        <span class="wc-c bl"></span>
        <span class="wc-c br"></span>
        <span class="wc-btn-label">Click to BREACH <span class="wc-arrow">→</span></span>
      </button>
    </div>
  `;
  document.body.appendChild(root);

  const layer = root.querySelector<HTMLDivElement>('#wc-layer')!;
  const btn   = root.querySelector<HTMLButtonElement>('#wc-btn')!;
  return { root, layer, btn };
}

export function startWelcomeEffects(
  root: HTMLDivElement,
  layer: HTMLDivElement,
  btn: HTMLButtonElement,
): () => void {
  const depth = parseFloat(layer.dataset['depth'] ?? '0.012');
  let mouseNx = 0;
  let mouseNy = 0;
  let gyroX = 0;
  let gyroY = 0;
  let usingGyro = false;
  let rafId = 0;

  const onMove = (e: MouseEvent) => {
    mouseNx = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouseNy = (e.clientY / window.innerHeight - 0.5) * 2;
  };

  const onGyro = (e: DeviceOrientationEvent) => {
    if (e.gamma == null) return;
    usingGyro = true;
    gyroX = Math.max(-12, Math.min(12, e.gamma)) / 12;
    gyroY = Math.max(-10, Math.min(10, (e.beta ?? 0) - 30)) / 10;
  };

  const onBtnMove = (e: MouseEvent) => {
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--bx', ((e.clientX - r.left) / r.width  * 100) + '%');
    btn.style.setProperty('--by', ((e.clientY - r.top)  / r.height * 100) + '%');
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('deviceorientation', onGyro);
  btn.addEventListener('mousemove', onBtnMove);

  const tick = () => {
    if (!root.isConnected) return;
    const px = usingGyro ? gyroX : mouseNx;
    const py = usingGyro ? gyroY : mouseNy;
    const ox = px * depth * window.innerWidth;
    const oy = py * depth * window.innerHeight;
    layer.style.transform = `translate(${ox}px,${oy}px)`;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('deviceorientation', onGyro);
    btn.removeEventListener('mousemove', onBtnMove);
  };
}
