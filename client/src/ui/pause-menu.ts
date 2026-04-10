/**
 * In-game pause menu — toggled by Escape key.
 * Game loop continues running; only pointer lock is released.
 */
export class PauseMenu {
  private el: HTMLDivElement | null = null;
  private visible = false;

  public onResume:       (() => void) | null = null;
  public onReturnToMenu: (() => void) | null = null;
  public onSensitivityChange: ((v: number) => number) | null = null;

  public isVisible(): boolean { return this.visible; }

  public toggle(currentSensitivity: number): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show(currentSensitivity);
    }
  }

  public show(currentSensitivity: number): void {
    if (this.visible) return;
    this.visible = true;

    this.el = document.createElement('div');
    const sens = (currentSensitivity * 1000).toFixed(0); // 0.002 → "2"

    this.el.innerHTML = `
      <style>
        .pm-root {
          position: fixed; inset: 0;
          background: rgba(4,7,13,0.78);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: monospace; color: #ccc;
          z-index: 500;
        }
        .pm-title {
          font-size: 26px; letter-spacing: 8px; color: #00ffff;
          text-shadow: 0 0 20px #00ffff; margin-bottom: 32px;
        }
        .pm-row {
          display: flex; align-items: center; gap: 16px;
          margin-bottom: 16px; font-size: 13px; letter-spacing: 2px;
        }
        .pm-label { color: #778; width: 160px; text-align: right; }
        .pm-input {
          background: rgba(0,255,255,0.06); border: 1px solid #00ffff44;
          color: #cff; font-family: monospace; font-size: 13px;
          padding: 6px 10px; width: 80px;
        }
        .pm-btn {
          background: rgba(0,255,255,0.08);
          border: 1px solid #00ffff44;
          color: #00d5ff; font-family: monospace;
          font-size: 13px; letter-spacing: 3px;
          padding: 12px 28px; cursor: pointer;
          text-transform: uppercase; margin: 6px;
        }
        .pm-btn:hover { background: rgba(0,255,255,0.16); border-color: #00ffffaa; }
        .pm-btn.danger { border-color: #ff4444aa; color: #ff8888; }
        .pm-btn.danger:hover { background: rgba(255,0,0,0.14); }
        .pm-sep { width: 280px; border: none; border-top: 1px solid #1a2233; margin: 16px 0; }
      </style>
      <div class="pm-root">
        <div class="pm-title">PAUSED</div>
        <div class="pm-row">
          <span class="pm-label">MOUSE SENS</span>
          <input class="pm-input" type="number" id="pm-sens" min="0.1" max="9.9" step="0.1" value="${sens}">
        </div>
        <hr class="pm-sep">
        <button class="pm-btn" id="pm-resume">Resume</button>
        <button class="pm-btn danger" id="pm-menu">Return to Menu</button>
      </div>
    `;

    document.body.appendChild(this.el);

    this.el.querySelector('#pm-resume')?.addEventListener('click', () => {
      this.hide();
      this.onResume?.();
    });
    this.el.querySelector('#pm-menu')?.addEventListener('click', () => {
      this.hide();
      this.onReturnToMenu?.();
    });
    this.el.querySelector('#pm-sens')?.addEventListener('change', (e) => {
      const raw = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(raw) && this.onSensitivityChange) {
        this.onSensitivityChange(raw / 1000);
      }
    });
  }

  public hide(): void {
    this.el?.remove();
    this.el = null;
    this.visible = false;
  }
}
