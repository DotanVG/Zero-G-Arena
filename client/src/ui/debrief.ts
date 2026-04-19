import { injectDesignTokens } from "./designTokens";

export interface DebriefPlayer {
  id: string;
  name: string;
  team: 0 | 1;
  breaches: number;
  frozen: number;
  isBot: boolean;
  isSelf: boolean;
}

export interface DebriefData {
  winningTeam: 0 | 1 | null;
  score: { team0: number; team1: number };
  players: DebriefPlayer[];
  playerTeam: 0 | 1;
  matchLabel: string;
}

const CSS = `
  .ob-debrief-root {
    position: fixed; inset: 0; z-index: 450;
    display: none; align-items: center; justify-content: center; padding: 18px;
    background:
      radial-gradient(circle at top, rgba(18, 41, 64, 0.82), rgba(4, 8, 18, 0.96) 55%, rgba(0, 0, 0, 0.99));
    color: #e8ecf4;
    font-family: "Cormorant Garamond", serif;
  }
  .ob-debrief-root * { box-sizing: border-box; }
  .ob-debrief-root.ob-debrief-visible { display: flex; }

  .ob-debrief-wrap {
    width: min(1100px, 94vw);
    max-height: calc(100vh - 36px);
    overflow: auto;
    display: grid;
    gap: 22px;
  }

  /* ── Score head ── */
  .ob-debrief-head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(210, 220, 240, 0.08);
  }
  .ob-debrief-team-score { text-align: center; }
  .ob-debrief-team-score .ob-ds-name {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px; letter-spacing: 5px;
    color: #9aa5b8; text-transform: uppercase;
  }
  .ob-debrief-team-score .ob-ds-num {
    font-size: 96px; font-weight: 300; line-height: 0.9;
  }
  .ob-debrief-team-score.ob-win  .ob-ds-num { color: oklch(0.82 0.15 210); text-shadow: 0 0 40px oklch(0.82 0.15 210 / 0.2); }
  .ob-debrief-team-score.ob-loss .ob-ds-num { color: #57637a; }

  .ob-debrief-verdict {
    font-size: 38px; letter-spacing: 0.1em; text-align: center; white-space: nowrap;
  }
  .ob-debrief-verdict .ob-dv-sub {
    display: block;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px; letter-spacing: 4px;
    color: #57637a; margin-top: 8px; text-transform: uppercase;
  }

  /* ── Main grid ── */
  .ob-debrief-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 18px;
    align-items: start;
  }

  .ob-debrief-panel {
    border: 1px solid rgba(210, 220, 240, 0.16);
    background: rgba(7, 10, 18, 0.55);
    backdrop-filter: blur(10px);
    padding: 20px 22px;
  }
  .ob-debrief-panel-head {
    display: flex; justify-content: space-between; align-items: center;
    font-family: "JetBrains Mono", monospace; font-size: 9px; letter-spacing: 4px;
    color: #57637a; text-transform: uppercase;
    padding-bottom: 12px; margin-bottom: 16px;
    border-bottom: 1px solid rgba(210, 220, 240, 0.08);
  }
  .ob-debrief-panel-head h3 {
    margin: 0; font-weight: 400; color: #9aa5b8; font-size: 10px; letter-spacing: 4px;
  }
  .ob-debrief-panel-head h3 .ob-dph-idx { color: oklch(0.82 0.15 210); }

  /* ── Stats table ── */
  .ob-stats-table {
    width: 100%; border-collapse: collapse;
    font-family: "JetBrains Mono", monospace; font-size: 11px;
  }
  .ob-stats-table th, .ob-stats-table td {
    text-align: left; padding: 10px 12px;
    border-bottom: 1px solid rgba(210, 220, 240, 0.06);
    letter-spacing: 2px;
  }
  .ob-stats-table th {
    font-size: 9px; color: #57637a; letter-spacing: 3px;
    font-weight: 400; text-transform: uppercase;
  }
  .ob-stats-table td { color: #9aa5b8; }
  .ob-stats-table td.ob-pname {
    color: #e8ecf4;
    font-family: "Cormorant Garamond", serif;
    font-size: 15px; letter-spacing: 0.04em;
  }
  .ob-stats-table tr:hover td { background: rgba(255,255,255,0.03); color: #e8ecf4; }
  .ob-t-cyan    td.ob-pname::before,
  .ob-t-magenta td.ob-pname::before {
    content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    margin-right: 10px; vertical-align: middle;
  }
  .ob-t-cyan    td.ob-pname::before { background: oklch(0.82 0.15 210); }
  .ob-t-magenta td.ob-pname::before { background: oklch(0.72 0.25 330); }
  .ob-stats-table .ob-self td { color: #e8ecf4; }
  .ob-stats-table .ob-self td.ob-pname { font-weight: 500; }

  /* ── Awards ── */
  .ob-awards { display: grid; gap: 10px; }
  .ob-award {
    border: 1px solid rgba(210, 220, 240, 0.08);
    padding: 14px 16px;
    background: rgba(7, 10, 18, 0.45);
    display: grid; gap: 3px;
    transition: border-color 0.22s, background 0.22s;
  }
  .ob-award:hover { border-color: oklch(0.82 0.15 210); background: rgba(24, 52, 82, 0.3); }
  .ob-award-key {
    font-family: "JetBrains Mono", monospace; font-size: 9px; letter-spacing: 3px;
    color: #57637a; text-transform: uppercase;
  }
  .ob-award-val { font-size: 20px; letter-spacing: 0.04em; color: #e8ecf4; }
  .ob-award-note {
    font-family: "JetBrains Mono", monospace; font-size: 9px; letter-spacing: 2px;
    color: oklch(0.82 0.15 210); margin-top: 2px;
  }

  /* ── Action buttons ── */
  .ob-debrief-actions { display: flex; gap: 12px; margin-top: 10px; }
  .ob-debrief-btn {
    flex: 1; position: relative;
    padding: 15px 20px;
    background: rgba(7, 10, 18, 0.55); backdrop-filter: blur(8px);
    border: 1px solid rgba(210, 220, 240, 0.16); color: #e8ecf4;
    font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: 5px;
    text-transform: uppercase; cursor: pointer;
    transition: border-color 0.22s, background 0.22s, transform 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .ob-debrief-btn:hover { border-color: rgba(210,220,240,0.3); background: rgba(20,30,50,0.7); transform: translateY(-1px); }
  .ob-debrief-btn--primary { border-color: oklch(0.82 0.15 210 / 0.28); }
  .ob-debrief-btn--primary:hover { border-color: oklch(0.82 0.15 210); color: oklch(0.9 0.1 210); }

  @media (max-width: 900px) {
    .ob-debrief-grid { grid-template-columns: 1fr; }
    .ob-debrief-head { grid-template-columns: 1fr; gap: 12px; text-align: center; }
  }
`;

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

function rating(breaches: number, frozen: number): string {
  const r = (breaches * 3) / (frozen + 1);
  if (r >= 3.5) return "A+";
  if (r >= 2.2) return "A";
  if (r >= 1.2) return "B+";
  if (r >= 0.6) return "B";
  if (r >= 0.2) return "C+";
  return "C";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

export class DebriefScreen {
  private readonly root: HTMLDivElement;
  public onMainMenu: (() => void) | null = null;
  public onPlayAgain: (() => void) | null = null;

  public constructor() {
    injectDesignTokens();
    injectStyle();
    this.root = document.createElement("div");
    this.root.className = "ob-debrief-root";
    document.body.appendChild(this.root);
  }

  public isVisible(): boolean {
    return this.root.classList.contains("ob-debrief-visible");
  }

  public show(data: DebriefData): void {
    this.root.innerHTML = this.buildHtml(data);
    this.root.classList.add("ob-debrief-visible");

    this.root.querySelector<HTMLButtonElement>("#debrief-main-menu")
      ?.addEventListener("click", () => { this.hide(); this.onMainMenu?.(); });
    this.root.querySelector<HTMLButtonElement>("#debrief-play-again")
      ?.addEventListener("click", () => { this.hide(); this.onPlayAgain?.(); });
  }

  public hide(): void {
    this.root.classList.remove("ob-debrief-visible");
  }

  public dispose(): void {
    this.root.remove();
  }

  private buildHtml(data: DebriefData): string {
    const { score, winningTeam, players, playerTeam, matchLabel } = data;

    const cyan0 = winningTeam === 0 ? "ob-win" : "ob-loss";
    const cyan1 = winningTeam === 1 ? "ob-win" : "ob-loss";
    const verdictText = winningTeam === playerTeam ? "VICTORY"
      : winningTeam === null ? "DRAW"
      : "DEFEAT";

    const sortedPlayers = [...players].sort((a, b) => {
      if (a.team !== b.team) return a.team - b.team;
      return b.breaches - a.breaches;
    });

    const tableRows = sortedPlayers.map((p, i) => {
      const teamCls = p.team === 0 ? "ob-t-cyan" : "ob-t-magenta";
      const selfCls = p.isSelf ? " ob-self" : "";
      const r = rating(p.breaches, p.frozen);
      return `<tr class="${teamCls}${selfCls}">
        <td class="ob-pname">${escapeHtml(p.name)}${p.isBot ? " <small style='opacity:.4;font-size:9px;font-family:var(--ob-mono,monospace)'>[BOT]</small>" : ""}</td>
        <td>${p.breaches}</td>
        <td>${p.frozen}</td>
        <td>${r}</td>
      </tr>`;
    }).join("");

    const awards = this.buildAwards(players);

    return `
      <div class="ob-debrief-wrap">
        <div class="ob-debrief-head">
          <div class="ob-debrief-team-score ${cyan0}">
            <div class="ob-ds-name">Team Cyan</div>
            <div class="ob-ds-num">${score.team0}</div>
          </div>
          <div class="ob-debrief-verdict">
            ${verdictText}
            <span class="ob-dv-sub">${escapeHtml(matchLabel)}</span>
          </div>
          <div class="ob-debrief-team-score ${cyan1}">
            <div class="ob-ds-name">Team Magenta</div>
            <div class="ob-ds-num">${score.team1}</div>
          </div>
        </div>

        <div class="ob-debrief-grid">
          <div class="ob-debrief-panel">
            <div class="ob-debrief-panel-head">
              <h3>Scoreboard <span class="ob-dph-idx">// final</span></h3>
              <span>${players.length} PILOTS</span>
            </div>
            <table class="ob-stats-table">
              <thead>
                <tr><th>Pilot</th><th>Breaches</th><th>Frozen</th><th>Rating</th></tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>

          <div>
            <div class="ob-awards">${awards}</div>
            <div class="ob-debrief-actions">
              <button class="ob-debrief-btn" id="debrief-main-menu">Main Menu →</button>
              <button class="ob-debrief-btn ob-debrief-btn--primary" id="debrief-play-again">Play Again →</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private buildAwards(players: DebriefPlayer[]): string {
    const humans = players.filter((p) => !p.isBot);
    const all = players;

    const mostBreaches = all.reduce<DebriefPlayer | null>(
      (best, p) => (!best || p.breaches > best.breaches ? p : best), null,
    );
    const ironPilot = humans.find((p) => p.frozen === 0);
    const topKd = all.reduce<DebriefPlayer | null>(
      (best, p) => {
        const scoreA = p.breaches * 3 / (p.frozen + 1);
        const scoreB = best ? best.breaches * 3 / (best.frozen + 1) : -1;
        return scoreA > scoreB ? p : best;
      }, null,
    );

    const award = (key: string, val: string, note: string) =>
      `<div class="ob-award">
        <span class="ob-award-key">${key}</span>
        <span class="ob-award-val">${escapeHtml(val)}</span>
        <span class="ob-award-note">${escapeHtml(note)}</span>
      </div>`;

    const parts: string[] = [];
    if (mostBreaches && mostBreaches.breaches > 0) {
      parts.push(award("Most Breaches", mostBreaches.name, `${mostBreaches.breaches} portal traversals`));
    }
    if (ironPilot) {
      parts.push(award("Iron Pilot", ironPilot.name, "never frozen this match"));
    }
    if (topKd) {
      parts.push(award("Top Rating", topKd.name, `${rating(topKd.breaches, topKd.frozen)} · ${topKd.breaches} breaches / ${topKd.frozen} frozen`));
    }
    if (parts.length === 0) {
      parts.push(award("Round Complete", "—", "match concluded"));
    }

    return parts.join("");
  }
}
