export interface GlobalCursor {
  show(): void;
  hide(): void;
  setHot(hot: boolean): void;
  dispose(): void;
}

const STYLE = `
  * { cursor: none !important; }
  @media (pointer: coarse) { * { cursor: auto !important; } }

  .gc-cursor {
    position: fixed; top: 0; left: 0; z-index: 9999;
    width: 28px; height: 28px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    mix-blend-mode: screen;
    color: var(--ob-cyan, #00e5ff);
  }
  .gc-cursor::before {
    content: ""; position: absolute; inset: 0; border-radius: 50%;
    border: 1px solid var(--ob-cyan, #00e5ff);
    transition: transform .2s ease, border-color .2s ease;
  }
  .gc-cursor::after {
    content: ""; position: absolute;
    width: 3px; height: 3px; left: 50%; top: 50%;
    transform: translate(-50%,-50%);
    border-radius: 50%;
    background: var(--ob-cyan, #00e5ff);
    box-shadow: 0 0 8px var(--ob-cyan, #00e5ff);
  }
  .gc-cursor.gc-hot::before { transform: scale(1.7); border-color: var(--ob-magenta, #ff00ff); }
  .gc-cursor.gc-hot::after  { background: var(--ob-magenta, #ff00ff); box-shadow: 0 0 10px var(--ob-magenta, #ff00ff); }
  .gc-cursor svg { position: absolute; inset: -6px; width: 40px; height: 40px; opacity: .6; }
  .gc-cursor.gc-hidden { display: none; }
`;

function isInteractive(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'LABEL') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type === 'checkbox' || type === 'radio' || type === 'range' || type === 'submit' || type === 'button';
  }
  const role = el.getAttribute('role');
  if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem') return true;
  return false;
}

export function initGlobalCursor(): GlobalCursor {
  if (window.matchMedia('(pointer: coarse)').matches) {
    return { show: () => {}, hide: () => {}, setHot: () => {}, dispose: () => {} };
  }

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'gc-cursor';
  el.innerHTML = `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width=".8">
    <line x1="20" y1="0"  x2="20" y2="10"/>
    <line x1="20" y1="30" x2="20" y2="40"/>
    <line x1="0"  y1="20" x2="10" y2="20"/>
    <line x1="30" y1="20" x2="40" y2="20"/>
  </svg>`;
  document.body.appendChild(el);

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let cx = mx;
  let cy = my;
  let rafId = 0;
  let manualHot = false; // set via setHot() from external callers
  let delegateHot = false; // set via mouseover delegation

  const applyHot = () => el.classList.toggle('gc-hot', manualHot || delegateHot);

  const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
  const onDown = () => { manualHot = true; applyHot(); };
  const onUp   = () => { manualHot = false; applyHot(); };

  // Global delegation: hot state on any interactive element
  const onOver = (e: MouseEvent) => {
    const hit = (e.target as Element)?.closest('button, a, label, [role="button"], [role="link"], [role="tab"]');
    if (hit && isInteractive(hit)) {
      delegateHot = true;
    } else if (isInteractive(e.target as Element)) {
      delegateHot = true;
    } else {
      delegateHot = false;
    }
    applyHot();
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  document.addEventListener('mouseover', onOver);

  const tick = () => {
    cx += (mx - cx) * 0.25;
    cy += (my - cy) * 0.25;
    el.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    show()      { el.classList.remove('gc-hidden'); },
    hide()      { el.classList.add('gc-hidden'); },
    setHot(hot) { manualHot = hot; applyHot(); },
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseover', onOver);
      el.remove();
      style.remove();
    },
  };
}
