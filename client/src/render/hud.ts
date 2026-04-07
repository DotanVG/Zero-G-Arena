export class HUD {
  private el: HTMLDivElement;

  public constructor() {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      fontFamily: "monospace",
      color: "white",
    });

    this.el.innerHTML = `
      <div id="hud-start" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);font-size:28px;letter-spacing:0.08em;text-transform:uppercase;">
        Click to breach orbit
      </div>
      <div id="hud-crosshair" style="position:absolute;left:50%;top:50%;width:4px;height:4px;background:#fff;border-radius:999px;transform:translate(-50%,-50%);"></div>
      <div id="hud-score" style="position:absolute;top:20px;left:50%;transform:translateX(-50%);font-size:20px;">
        0 - 0
      </div>
      <div id="hud-frozen" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;color:#ff5555;font-size:32px;text-align:center;">
        FROZEN
      </div>
    `;

    document.body.appendChild(this.el);
  }

  public update(
    score: { team0: number; team1: number },
    playerState: string,
    frozenTime: number,
  ): void {
    const scoreEl = this.el.querySelector<HTMLDivElement>("#hud-score");
    if (scoreEl) {
      scoreEl.textContent = `${score.team0} - ${score.team1}`;
    }

    const frozenEl = this.el.querySelector<HTMLDivElement>("#hud-frozen");
    if (!frozenEl) {
      return;
    }

    if (playerState === "FROZEN") {
      frozenEl.style.display = "block";
      frozenEl.textContent = `FROZEN ${frozenTime.toFixed(1)}s`;
    } else {
      frozenEl.style.display = "none";
    }
  }

  public showStart(): void {
    const startEl = this.el.querySelector<HTMLDivElement>("#hud-start");
    if (startEl) {
      startEl.style.display = "flex";
    }
  }

  public hideStart(): void {
    const startEl = this.el.querySelector<HTMLDivElement>("#hud-start");
    if (startEl) {
      startEl.style.display = "none";
    }
  }
}
