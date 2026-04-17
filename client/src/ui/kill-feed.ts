export class KillFeed {
  private container: HTMLDivElement;

  public constructor() {
    this.container = document.createElement("div");
    Object.assign(this.container.style, {
      position: "fixed",
      top: "60px",
      right: "16px",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "4px",
      pointerEvents: "none",
      zIndex: "100",
      fontFamily: "monospace",
      fontSize: "13px",
    });
    document.body.appendChild(this.container);
  }

  public addKill(killerName: string, killerTeam: 0 | 1, victimName: string, victimTeam: 0 | 1): void {
    const entry = document.createElement("div");
    const killerColor = killerTeam === 0 ? "#00ffff" : "#ff00ff";
    const victimColor = victimTeam === 0 ? "#00ffff" : "#ff00ff";

    entry.innerHTML =
      `<span style="color:${killerColor};text-shadow:0 0 6px ${killerColor}">${killerName}</span>`
      + `<span style="color:#888;margin:0 6px">froze</span>`
      + `<span style="color:${victimColor};text-shadow:0 0 6px ${victimColor}">${victimName}</span>`;

    Object.assign(entry.style, {
      background: "rgba(0,0,0,0.55)",
      border: "1px solid #333",
      borderRadius: "4px",
      padding: "2px 8px",
      transition: "opacity 0.5s ease",
      opacity: "1",
    });

    this.container.appendChild(entry);
    setTimeout(() => { entry.style.opacity = "0"; }, 3500);
    setTimeout(() => { entry.remove(); }, 4000);
  }

  public addScore(scorerName: string, scorerTeam: 0 | 1): void {
    const color = scorerTeam === 0 ? "#00ffff" : "#ff00ff";
    const entry = document.createElement("div");
    entry.innerHTML =
      `<span style="color:${color};text-shadow:0 0 8px ${color};font-weight:bold">${scorerName} BREACHED!</span>`;

    Object.assign(entry.style, {
      background: "rgba(0,0,0,0.65)",
      border: `1px solid ${color}`,
      borderRadius: "4px",
      padding: "3px 10px",
      transition: "opacity 0.5s ease",
      opacity: "1",
    });

    this.container.appendChild(entry);
    setTimeout(() => { entry.style.opacity = "0"; }, 4500);
    setTimeout(() => { entry.remove(); }, 5000);
  }
}
