import { MATCH_TEAM_SIZES, type MatchTeamSize } from "../../../shared/match";
import {
  getLobbyMemberCounts,
  type LobbyEventMessage,
  type MultiplayerRoomSnapshot,
} from "../../../shared/multiplayer";

const CYAN = "#7ffcff";
const MAGENTA = "#ff7df8";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@300;400;500&display=swap');

  .ob-mp-root {
    --mp-cyan: oklch(0.82 0.15 210);
    --mp-magenta: oklch(0.72 0.25 330);
    --mp-panel: rgba(7, 10, 18, 0.82);
    --mp-panel-strong: rgba(7, 10, 18, 0.94);
    --mp-border: rgba(210, 220, 240, 0.16);
    --mp-muted: #9aa5b8;
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background:
      radial-gradient(circle at top, rgba(18, 41, 64, 0.82), rgba(4, 8, 18, 0.94) 55%, rgba(0, 0, 0, 0.98)),
      linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.44));
    z-index: 350;
    color: #e8ecf4;
    font-family: "Cormorant Garamond", serif;
  }

  .ob-mp-root * {
    box-sizing: border-box;
  }

  .ob-mp-shell {
    width: min(1120px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow: auto;
    border: 1px solid var(--mp-border);
    border-radius: 0;
    background:
      radial-gradient(circle at top left, rgba(127, 252, 255, 0.11), rgba(127, 252, 255, 0) 24%),
      radial-gradient(circle at bottom right, rgba(255, 125, 248, 0.12), rgba(255, 125, 248, 0) 28%),
      var(--mp-panel);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(16px);
  }

  .ob-mp-header,
  .ob-mp-status,
  .ob-mp-controls,
  .ob-mp-summary-card,
  .ob-mp-team {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  .ob-mp-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    padding: 22px 24px 18px;
    border-radius: 0;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
      var(--mp-panel-strong);
  }

  .ob-mp-kicker,
  .ob-mp-phase,
  .ob-mp-meta,
  .ob-mp-card-label,
  .ob-mp-team-meta,
  .ob-mp-badge,
  .ob-mp-roster-meta,
  .ob-mp-button,
  .ob-mp-select,
  .ob-mp-empty {
    font-family: "JetBrains Mono", monospace;
    text-transform: uppercase;
  }

  .ob-mp-kicker {
    color: var(--mp-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
  }

  .ob-mp-title {
    margin-top: 10px;
    font-size: clamp(34px, 4vw, 50px);
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 0.95;
    text-transform: uppercase;
  }

  .ob-mp-subtitle {
    margin-top: 10px;
    max-width: 620px;
    color: #d6edf5;
    font-size: 15px;
    line-height: 1.6;
  }

  .ob-mp-phase-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .ob-mp-phase {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 2px;
    color: #defdff;
    background: rgba(127, 252, 255, 0.12);
    border: 1px solid rgba(127, 252, 255, 0.2);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }

  .ob-mp-meta {
    color: var(--mp-muted);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-align: right;
  }

  .ob-mp-score {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-shadow: 0 0 16px rgba(127, 252, 255, 0.16);
  }

  .ob-mp-body {
    padding: 18px 24px 24px;
  }

  .ob-mp-status {
    padding: 13px 15px;
    border-radius: 0;
    font-size: 14px;
    line-height: 1.5;
  }

  .ob-mp-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
    padding: 14px;
    border-radius: 0;
  }

  .ob-mp-select-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 172px;
  }

  .ob-mp-select-label {
    color: var(--mp-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .ob-mp-select,
  .ob-mp-button {
    min-height: 44px;
    border-radius: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #effcff;
    font-size: 12px;
    letter-spacing: 0.08em;
  }

  .ob-mp-select {
    padding: 0 12px;
    outline: none;
    appearance: none;
  }

  .ob-mp-select option {
    color: #effcff;
    background: #071019;
  }

  .ob-mp-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    cursor: pointer;
    font-weight: 700;
    transition: transform 0.14s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .ob-mp-button:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.24);
    background: rgba(255, 255, 255, 0.06);
  }

  .ob-mp-button:disabled,
  .ob-mp-select:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ob-mp-button--ready {
    border-color: rgba(127, 252, 255, 0.26);
    box-shadow: 0 0 18px rgba(127, 252, 255, 0.08) inset;
  }

  .ob-mp-button--switch {
    border-color: rgba(255, 125, 248, 0.26);
    box-shadow: 0 0 18px rgba(255, 125, 248, 0.08) inset;
  }

  .ob-mp-button--bots {
    border-color: rgba(118, 255, 179, 0.24);
  }

  .ob-mp-button--clear {
    border-color: rgba(255, 209, 102, 0.24);
  }

  .ob-mp-button--leave {
    border-color: rgba(255, 140, 160, 0.24);
  }

  .ob-mp-button--settings {
    border-color: rgba(127, 252, 255, 0.24);
  }

  .ob-mp-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 16px;
  }

  .ob-mp-summary-card {
    padding: 14px 16px;
    border-radius: 0;
  }

  .ob-mp-card-label {
    color: var(--mp-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }

  .ob-mp-card-value {
    margin-top: 6px;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .ob-mp-card-copy {
    margin-top: 6px;
    color: #cfe3ed;
    font-size: 13px;
    line-height: 1.45;
  }

  .ob-mp-rosters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 16px;
  }

  .ob-mp-team {
    padding: 16px;
    border-radius: 0;
  }

  .ob-mp-team--cyan {
    box-shadow: 0 0 0 1px rgba(127, 252, 255, 0.08) inset;
  }

  .ob-mp-team--magenta {
    box-shadow: 0 0 0 1px rgba(255, 125, 248, 0.08) inset;
  }

  .ob-mp-team-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .ob-mp-team-title {
    font-family: "Cormorant Garamond", serif;
    font-size: 26px;
    font-weight: 300;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .ob-mp-team-meta {
    margin-top: 3px;
    color: var(--mp-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }

  .ob-mp-team-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--mp-muted);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: right;
  }

  .ob-mp-roster {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
  }

  .ob-mp-roster-card {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 12px 13px;
    border-radius: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .ob-mp-roster-card--self {
    box-shadow: 0 0 0 1px rgba(127, 252, 255, 0.08) inset;
  }

  .ob-mp-roster-name {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .ob-mp-roster-meta {
    margin-top: 4px;
    color: var(--mp-muted);
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .ob-mp-roster-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .ob-mp-badge {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 2px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .ob-mp-badge--self {
    color: #dffcff;
    background: rgba(127, 252, 255, 0.16);
    border: 1px solid rgba(127, 252, 255, 0.28);
  }

  .ob-mp-badge--human {
    color: #dfe9f4;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .ob-mp-badge--bot {
    color: #d8ffe7;
    background: rgba(118, 255, 179, 0.12);
    border: 1px solid rgba(118, 255, 179, 0.2);
  }

  .ob-mp-badge--ready {
    color: #e0fbff;
    background: rgba(127, 252, 255, 0.16);
    border: 1px solid rgba(127, 252, 255, 0.24);
  }

  .ob-mp-badge--waiting {
    color: #ffecc8;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.2);
  }

  .ob-mp-empty {
    padding: 18px 14px;
    border-radius: 0;
    color: var(--mp-muted);
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-align: center;
  }

  @media (max-width: 920px) {
    .ob-mp-summary {
      grid-template-columns: 1fr;
    }

    .ob-mp-rosters {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 680px) {
    .ob-mp-header {
      grid-template-columns: 1fr;
    }

    .ob-mp-phase-block {
      align-items: flex-start;
    }

    .ob-mp-meta {
      text-align: left;
    }

    .ob-mp-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .ob-mp-select-wrap {
      min-width: 0;
    }

    .ob-mp-button,
    .ob-mp-select {
      width: 100%;
    }

    .ob-mp-roster-card {
      flex-direction: column;
      align-items: flex-start;
    }

    .ob-mp-roster-badges {
      justify-content: flex-start;
    }
  }

  /* ===== BRIEFING 3-COLUMN LAYOUT ===== */
  .ob-mp-briefing-layout {
    display: grid;
    grid-template-columns: 280px 1fr 280px;
    gap: 14px;
    margin-top: 14px;
  }

  .ob-mp-brief-panel {
    border: 1px solid var(--mp-border);
    background: rgba(7, 10, 18, 0.55);
    backdrop-filter: blur(10px);
    padding: 16px;
  }
  .ob-mp-brief-panel--cyan  { box-shadow: inset 0 0 0 1px rgba(127, 252, 255, 0.06); }
  .ob-mp-brief-panel--magenta { box-shadow: inset 0 0 0 1px rgba(255, 125, 248, 0.06); }

  .ob-mp-panel-head {
    display: flex; justify-content: space-between; align-items: center;
    font-family: "JetBrains Mono", monospace; font-size: 9px; letter-spacing: 4px;
    color: var(--mp-muted); text-transform: uppercase;
    padding-bottom: 10px; margin-bottom: 12px;
    border-bottom: 1px solid rgba(210, 220, 240, 0.06);
  }
  .ob-mp-panel-title {
    margin: 0; font-family: "JetBrains Mono", monospace; font-weight: 400;
    color: var(--mp-muted); font-size: 9px; letter-spacing: 4px;
  }
  .ob-mp-panel-idx { color: var(--mp-cyan); }

  .ob-mp-brief-team-head {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 8px;
  }
  .ob-mp-brief-team-name {
    font-family: "Cormorant Garamond", serif;
    font-size: 20px; font-weight: 300; letter-spacing: 0.1em;
  }
  .ob-mp-brief-team-count {
    font-family: "JetBrains Mono", monospace; font-size: 10px;
    color: var(--mp-muted); letter-spacing: 3px;
  }

  .ob-mp-brief-roster {
    display: flex; flex-direction: column; gap: 1px;
  }
  .ob-mp-brief-row {
    display: grid;
    grid-template-columns: 18px 1fr auto auto;
    gap: 10px; align-items: center;
    padding: 8px 8px; border: 1px solid transparent;
    font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: 2px;
    color: var(--mp-muted);
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .ob-mp-brief-row:hover {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--mp-border);
    color: #e8ecf4;
  }
  .ob-mp-brief-row--self-cyan    { background: rgba(100, 190, 255, 0.06); border-color: var(--mp-cyan); color: #e8ecf4; }
  .ob-mp-brief-row--self-magenta { background: oklch(0.72 0.25 330 / 0.08); border-color: var(--mp-magenta); color: #e8ecf4; }
  .ob-mp-brief-row--pending      { opacity: 0.5; }
  .ob-mp-brief-slot { font-size: 9px; color: var(--mp-muted); opacity: 0.7; }
  .ob-mp-brief-kd   { font-size: 9px; color: var(--mp-muted); opacity: 0.7; }
  .ob-mp-brief-ready-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    background: var(--mp-cyan); box-shadow: 0 0 6px var(--mp-cyan);
  }
  .ob-mp-brief-ready-dot--magenta { background: var(--mp-magenta); box-shadow: 0 0 6px var(--mp-magenta); }
  .ob-mp-brief-ready-dot--pending { background: var(--mp-muted); box-shadow: none; opacity: 0.3; }

  /* Stage preview (center) */
  .ob-mp-stage-preview {
    border: 1px solid var(--mp-border);
    background: rgba(7, 10, 18, 0.55);
    backdrop-filter: blur(10px);
    padding: 18px;
    display: grid; grid-template-rows: auto 1fr auto;
    gap: 10px; overflow: hidden;
  }
  .ob-mp-stage-head { display: flex; justify-content: space-between; align-items: baseline; }
  .ob-mp-stage-title {
    margin: 0;
    font-family: "Cormorant Garamond", serif;
    font-weight: 300; font-size: 26px; letter-spacing: 0.06em;
    color: #e8ecf4;
  }
  .ob-mp-stage-meta {
    font-family: "JetBrains Mono", monospace; font-size: 9px; letter-spacing: 3px;
    color: var(--mp-muted); text-transform: uppercase;
  }
  .ob-mp-map { display: grid; place-items: center; padding: 8px 0; }
  .ob-mp-map-inner { width: 100%; max-width: 280px; aspect-ratio: 1; }
  .ob-mp-arena-svg { width: 100%; height: 100%; overflow: visible; }

  .ob-mp-loadout-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .ob-mp-loadout-item {
    border: 1px solid rgba(210, 220, 240, 0.06); padding: 10px 10px;
    font-family: "JetBrains Mono", monospace; font-size: 9px; letter-spacing: 2px;
    text-transform: uppercase; display: grid; gap: 3px;
    transition: border-color 0.2s;
  }
  .ob-mp-loadout-item:hover { border-color: rgba(210, 220, 240, 0.12); }
  .ob-mp-loadout-key { color: var(--mp-muted); font-size: 8px; letter-spacing: 2px; }
  .ob-mp-loadout-val {
    color: #e8ecf4; font-family: "Cormorant Garamond", serif;
    font-size: 13px; letter-spacing: 0.05em; text-transform: none;
  }

  /* Mission briefing (right panel bottom) */
  .ob-mp-rule { height: 1px; background: rgba(210, 220, 240, 0.06); margin: 12px 0; }
  .ob-mp-mission-brief {
    font-family: "Cormorant Garamond", serif; font-size: 13px; line-height: 1.7;
    color: var(--mp-muted);
  }
  .ob-mp-mission-brief p { margin: 0; }
  .ob-mp-mission-brief strong { color: #e8ecf4; font-weight: 400; }

  @media (max-width: 1100px) {
    .ob-mp-briefing-layout { grid-template-columns: 1fr; }
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

export class MultiplayerLobby {
  private root: HTMLDivElement;
  private status: HTMLDivElement;
  private phase: HTMLDivElement;
  private meta: HTMLDivElement;
  private score: HTMLDivElement;
  private playlistCard: HTMLDivElement;
  private queueCard: HTMLDivElement;
  private teamCard: HTMLDivElement;
  private readyButton: HTMLButtonElement;
  private switchTeamButton: HTMLButtonElement;
  private fillBotsButton: HTMLButtonElement;
  private clearBotsButton: HTMLButtonElement;
  private settingsButton: HTMLButtonElement;
  private leaveButton: HTMLButtonElement;
  private teamSizeSelect: HTMLSelectElement;
  private team0Title: HTMLDivElement;
  private team1Title: HTMLDivElement;
  private team0Count: HTMLDivElement;
  private team1Count: HTMLDivElement;
  private team0Roster: HTMLDivElement;
  private team1Roster: HTMLDivElement;
  private latestState: MultiplayerRoomSnapshot | null = null;

  public onLeaveLobby: (() => void) | null = null;
  public onReadyChange: ((ready: boolean) => void) | null = null;
  public onSwitchTeam: ((team: 0 | 1) => void) | null = null;
  public onFillBots: ((fill: boolean) => void) | null = null;
  public onOpenSettings: (() => void) | null = null;
  public onTeamSizeChange: ((teamSize: MatchTeamSize) => void) | null = null;

  public constructor() {
    injectStyle();

    this.root = document.createElement("div");
    this.root.className = "ob-mp-root";
    this.root.innerHTML = buildMarkup();
    document.body.appendChild(this.root);

    this.status = this.query("#mp-status");
    this.phase = this.query("#mp-phase");
    this.meta = this.query("#mp-meta");
    this.score = this.query("#mp-score");
    this.playlistCard = this.query("#mp-playlist-card");
    this.queueCard = this.query("#mp-queue-card");
    this.teamCard = this.query("#mp-team-card");
    this.readyButton = this.query("#mp-ready");
    this.switchTeamButton = this.query("#mp-switch-team");
    this.fillBotsButton = this.query("#mp-fill-bots");
    this.clearBotsButton = this.query("#mp-clear-bots");
    this.settingsButton = this.query("#mp-settings");
    this.leaveButton = this.query("#mp-leave");
    this.teamSizeSelect = this.query("#mp-team-size");
    this.team0Title = this.query("#mp-team0-title");
    this.team1Title = this.query("#mp-team1-title");
    this.team0Count = this.query("#mp-team0-count");
    this.team1Count = this.query("#mp-team1-count");
    this.team0Roster = this.query("#mp-team0-roster");
    this.team1Roster = this.query("#mp-team1-roster");

    this.teamSizeSelect.innerHTML = MATCH_TEAM_SIZES.map((size) =>
      `<option value="${size}">${playlistLabel(size)}</option>`).join("");

    this.readyButton.addEventListener("click", () => {
      const state = this.latestState;
      if (!state) return;
      const self = this.getSelf(state);
      this.onReadyChange?.(!self?.ready);
    });
    this.switchTeamButton.addEventListener("click", () => {
      const state = this.latestState;
      if (!state) return;
      this.onSwitchTeam?.(state.selfTeam === 0 ? 1 : 0);
    });
    this.fillBotsButton.addEventListener("click", () => this.onFillBots?.(true));
    this.clearBotsButton.addEventListener("click", () => this.onFillBots?.(false));
    this.settingsButton.addEventListener("click", () => this.onOpenSettings?.());
    this.leaveButton.addEventListener("click", () => this.onLeaveLobby?.());
    this.teamSizeSelect.addEventListener("change", () => {
      const teamSize = Number(this.teamSizeSelect.value);
      if (MATCH_TEAM_SIZES.includes(teamSize as MatchTeamSize)) {
        this.onTeamSizeChange?.(teamSize as MatchTeamSize);
      }
    });
  }

  public showConnecting(playerName: string): void {
    this.root.style.display = "flex";
    this.phase.textContent = "Handshake";
    this.meta.textContent = "Establishing room session";
    this.score.textContent = "0 - 0";
    this.playlistCard.innerHTML = renderSummaryCard("playlist", "Connecting", "Contacting the online room.");
    this.queueCard.innerHTML = renderSummaryCard("queue", "Assembling", "Waiting for the queue state.");
    this.teamCard.innerHTML = renderSummaryCard("team", "Seat", "Finding your squad slot.");
    this.team0Title.textContent = "Cyan squad";
    this.team1Title.textContent = "Magenta squad";
    this.team0Count.textContent = "Loading";
    this.team1Count.textContent = "Loading";
    this.team0Roster.innerHTML = `<div class="ob-mp-empty">Joining room...</div>`;
    this.team1Roster.innerHTML = `<div class="ob-mp-empty">Joining room...</div>`;
    this.setStatus(`Connecting ${escapeHtml(playerName)} to the live queue...`, "info");
  }

  public show(): void {
    this.root.style.display = "flex";
  }

  public hide(): void {
    this.root.style.display = "none";
    this.latestState = null;
  }

  public setStatus(text: string, kind: LobbyEventMessage["type"]): void {
    this.status.textContent = text;
    this.status.style.color = kind === "error" ? "#ffb1c0" : "#dffcff";
    this.status.style.borderColor = kind === "error"
      ? "rgba(255, 120, 150, 0.38)"
      : "rgba(127, 252, 255, 0.16)";
    this.status.style.boxShadow = kind === "error"
      ? "0 0 0 1px rgba(255, 120, 150, 0.08) inset"
      : "0 0 0 1px rgba(127, 252, 255, 0.05) inset";
  }

  public render(state: MultiplayerRoomSnapshot): void {
    this.latestState = state;
    this.show();

    const counts = getLobbyMemberCounts(state.members);
    const self = this.getSelf(state);
    const isLobby = state.phase === "LOBBY";
    const selfTeamLabel = state.selfTeam === 0 ? "Cyan squad" : "Magenta squad";
    const readyHumans = state.members.filter((member) => !member.isBot && member.ready).length;

    this.phase.textContent = describePhase(state);
    this.meta.textContent =
      `Room ${state.roomId} · ${playlistLabel(state.teamSize)} · Round ${Math.max(1, state.roundNumber || 1)}`;
    this.score.textContent = `${state.score.team0} - ${state.score.team1}`;
    this.teamSizeSelect.value = String(state.teamSize);

    this.readyButton.disabled = !self || !isLobby;
    this.readyButton.textContent = self?.ready ? "Cancel Ready" : "Ready Check";
    this.switchTeamButton.disabled = !self || !isLobby;
    this.switchTeamButton.textContent = state.selfTeam === 0 ? "Move To Magenta" : "Move To Cyan";
    this.fillBotsButton.disabled = !isLobby;
    this.fillBotsButton.textContent = "Fill Lobby";
    this.clearBotsButton.disabled = !isLobby;
    this.clearBotsButton.textContent = "Humans Only";
    this.settingsButton.disabled = false;
    this.settingsButton.textContent = "Settings";
    this.teamSizeSelect.disabled = !isLobby;

    this.playlistCard.innerHTML = renderSummaryCard(
      "playlist",
      playlistLabel(state.teamSize),
      state.phase === "LOBBY"
        ? "Choose the playlist size before the ready check starts."
        : "Playlist is locked while the round cycle is active.",
    );
    this.queueCard.innerHTML = renderSummaryCard(
      "queue",
      `${readyHumans}/${counts.humans} ready`,
      describeQueueState(state, counts.humans),
    );
    this.teamCard.innerHTML = renderSummaryCard(
      "seat",
      selfTeamLabel,
      `Cyan ${counts.team0}/${state.teamSize} · Magenta ${counts.team1}/${state.teamSize}`,
    );

    if (state.phase === "COUNTDOWN") {
      this.setStatus(`Ready check passed. Deployment in ${Math.ceil(state.countdownRemaining)}...`, "info");
    } else if (state.phase === "PLAYING") {
      this.setStatus(`Round live. ${formatTime(state.roundTimeRemaining)} remaining.`, "info");
    } else if (state.phase === "ROUND_END") {
      this.setStatus("Round complete. Rebuilding the arena for the next point...", "info");
    } else {
      this.setStatus("Form up, balance the squads, and lock ready when both sides are full.", "info");
    }

    const team0Members = state.members.filter((member) => member.team === 0);
    const team1Members = state.members.filter((member) => member.team === 1);

    this.team0Title.textContent = "Cyan squad";
    this.team1Title.textContent = "Magenta squad";
    this.team0Count.textContent = `${team0Members.length}/${state.teamSize} queued`;
    this.team1Count.textContent = `${team1Members.length}/${state.teamSize} queued`;
    this.team0Roster.innerHTML = renderRoster(team0Members, state.sessionId, CYAN);
    this.team1Roster.innerHTML = renderRoster(team1Members, state.sessionId, MAGENTA);
  }

  private getSelf(state: MultiplayerRoomSnapshot) {
    return state.members.find((member) => member.id === state.sessionId) ?? null;
  }

  private query<T extends HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector) as T;
  }
}

function buildMarkup(): string {
  return `
    <div class="ob-mp-shell">
      <div class="ob-mp-header">
        <div>
          <div class="ob-mp-kicker">Online queue</div>
          <div class="ob-mp-title">Orbital Breach</div>
          <div class="ob-mp-subtitle">
            Balance the squads, ready the room, and deploy straight into the live round cycle.
          </div>
        </div>

        <div class="ob-mp-phase-block">
          <div id="mp-phase" class="ob-mp-phase">Lobby Open</div>
          <div id="mp-meta" class="ob-mp-meta"></div>
          <div id="mp-score" class="ob-mp-score">0 - 0</div>
        </div>
      </div>

      <div class="ob-mp-body">
        <div id="mp-status" class="ob-mp-status"></div>

        <div class="ob-mp-controls">
          <label class="ob-mp-select-wrap">
            <span class="ob-mp-select-label">Playlist</span>
            <select id="mp-team-size" class="ob-mp-select"></select>
          </label>

          <button id="mp-ready" class="ob-mp-button ob-mp-button--ready">Ready Check</button>
          <button id="mp-switch-team" class="ob-mp-button ob-mp-button--switch">Move Team</button>
          <button id="mp-fill-bots" class="ob-mp-button ob-mp-button--bots">Fill Lobby</button>
          <button id="mp-clear-bots" class="ob-mp-button ob-mp-button--clear">Humans Only</button>
          <button id="mp-settings" class="ob-mp-button ob-mp-button--settings">Settings</button>
          <button id="mp-leave" class="ob-mp-button ob-mp-button--leave">Main Menu</button>
        </div>

        <div style="display:none">
          <div id="mp-playlist-card"></div>
          <div id="mp-queue-card"></div>
          <div id="mp-team-card"></div>
        </div>

        <div class="ob-mp-briefing-layout">

          <div class="ob-mp-brief-panel ob-mp-brief-panel--cyan">
            <div class="ob-mp-panel-head">
              <h3 class="ob-mp-panel-title">Team Cyan <span class="ob-mp-panel-idx">// 01</span></h3>
              <span>Friendly</span>
            </div>
            <div class="ob-mp-brief-team-head">
              <span id="mp-team0-title" class="ob-mp-brief-team-name" style="color:${CYAN}">Cyan</span>
              <span id="mp-team0-count" class="ob-mp-brief-team-count"></span>
            </div>
            <div id="mp-team0-roster" class="ob-mp-brief-roster"></div>
          </div>

          <div class="ob-mp-stage-preview">
            <div class="ob-mp-stage-head">
              <h2 class="ob-mp-stage-title">Zero-G Arena</h2>
              <div class="ob-mp-stage-meta">Orbital Station</div>
            </div>
            <div class="ob-mp-map">
              <div class="ob-mp-map-inner">
                <svg class="ob-mp-arena-svg" viewBox="-200 -200 400 400">
                  <rect x="-190" y="-190" width="380" height="380" fill="none" stroke="rgba(210,220,240,0.1)"/>
                  <line x1="0" y1="-190" x2="0" y2="190" stroke="rgba(210,220,240,0.05)" stroke-dasharray="2 4"/>
                  <line x1="-190" y1="0" x2="190" y2="0" stroke="rgba(210,220,240,0.05)" stroke-dasharray="2 4"/>
                  <g stroke="rgba(210,220,240,0.25)" fill="none">
                    <path d="M -170 -130 L -80 -130 L -80 -60 L -170 -60 Z"/>
                    <path d="M 170 130 L 80 130 L 80 60 L 170 60 Z"/>
                  </g>
                  <text x="-125" y="-142" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="oklch(0.82 0.15 210)" letter-spacing="2">CYAN BREACH</text>
                  <text x="125" y="150" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="oklch(0.72 0.25 330)" letter-spacing="2">MAGENTA BREACH</text>
                  <circle cx="-80" cy="-95" r="10" fill="none" stroke="oklch(0.82 0.15 210)" stroke-opacity="0.7"/>
                  <circle cx="-80" cy="-95" r="3" fill="oklch(0.82 0.15 210)"/>
                  <circle cx="80" cy="95" r="10" fill="none" stroke="oklch(0.72 0.25 330)" stroke-opacity="0.7"/>
                  <circle cx="80" cy="95" r="3" fill="oklch(0.72 0.25 330)"/>
                  <g stroke="rgba(210,220,240,0.18)">
                    <line x1="-40" y1="-40" x2="40" y2="40"/>
                    <line x1="40" y1="-40" x2="-40" y2="40"/>
                    <line x1="-60" y1="0" x2="60" y2="0"/>
                    <line x1="0" y1="-60" x2="0" y2="60"/>
                  </g>
                  <circle cx="0" cy="0" r="4" fill="rgba(210,220,240,0.3)"/>
                  <circle cx="0" cy="0" r="18" fill="none" stroke="rgba(210,220,240,0.1)"/>
                  <circle cx="0" cy="0" r="45" fill="none" stroke="rgba(210,220,240,0.05)"/>
                  <path d="M -80 -95 Q -20 0 80 95" fill="none" stroke="oklch(0.82 0.15 210)" stroke-opacity="0.35" stroke-dasharray="3 4"/>
                  <text x="-185" y="185" font-family="JetBrains Mono" font-size="7" fill="rgba(87,99,122,1)">400m</text>
                  <text x="148" y="-178" font-family="JetBrains Mono" font-size="7" fill="rgba(87,99,122,1)">&#8593; ZENITH</text>
                </svg>
              </div>
            </div>
            <div class="ob-mp-loadout-row">
              <div class="ob-mp-loadout-item">
                <span class="ob-mp-loadout-key">Weapon</span>
                <span class="ob-mp-loadout-val">Freeze Pistol</span>
              </div>
              <div class="ob-mp-loadout-item">
                <span class="ob-mp-loadout-key">Module</span>
                <span class="ob-mp-loadout-val">Grip Glove</span>
              </div>
              <div class="ob-mp-loadout-item">
                <span class="ob-mp-loadout-key">Mode</span>
                <span class="ob-mp-loadout-val">Freeze &amp; Breach</span>
              </div>
            </div>
          </div>

          <div class="ob-mp-brief-panel ob-mp-brief-panel--magenta">
            <div class="ob-mp-panel-head">
              <h3 class="ob-mp-panel-title">Team Magenta <span class="ob-mp-panel-idx" style="color:oklch(0.72 0.25 330)">// 02</span></h3>
              <span>Hostile</span>
            </div>
            <div class="ob-mp-brief-team-head">
              <span id="mp-team1-title" class="ob-mp-brief-team-name" style="color:${MAGENTA}">Magenta</span>
              <span id="mp-team1-count" class="ob-mp-brief-team-count"></span>
            </div>
            <div id="mp-team1-roster" class="ob-mp-brief-roster"></div>

            <div class="ob-mp-rule"></div>

            <div class="ob-mp-mission-brief">
              <p><strong>Objective.</strong> Slip a pilot through the opposing portal. Freeze shots disable movement for the remainder of the round.</p>
              <p><strong>Scoring.</strong> Each successful breach scores one point. First team to fill their round quota wins the match.</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

function renderSummaryCard(label: string, value: string, copy: string): string {
  return `
    <div class="ob-mp-card-label">${escapeHtml(label)}</div>
    <div class="ob-mp-card-value">${escapeHtml(value)}</div>
    <div class="ob-mp-card-copy">${escapeHtml(copy)}</div>
  `;
}

function renderRoster(
  members: MultiplayerRoomSnapshot["members"],
  sessionId: string,
  accent: string,
): string {
  if (members.length === 0) {
    return `<div class="ob-mp-empty">Open lane</div>`;
  }

  const isMagentaTeam = accent === MAGENTA;
  return members.map((member, i) => {
    const isSelf = member.id === sessionId;
    const selfCls = isSelf
      ? (isMagentaTeam ? "ob-mp-brief-row--self-magenta" : "ob-mp-brief-row--self-cyan")
      : "";
    const pendingCls = !member.ready ? "ob-mp-brief-row--pending" : "";
    const dotCls = !member.ready
      ? "ob-mp-brief-ready-dot--pending"
      : isMagentaTeam ? "ob-mp-brief-ready-dot--magenta" : "";
    const slot = String(i + 1).padStart(2, "0");
    const nameLabel = escapeHtml(member.name)
      + (member.isBot ? `<small style="opacity:.4;font-size:8px;letter-spacing:1px"> [bot]</small>` : "");
    return `
      <div class="ob-mp-brief-row ${selfCls} ${pendingCls}">
        <span class="ob-mp-brief-slot">${slot}</span>
        <span>${nameLabel}</span>
        <span class="ob-mp-brief-kd">${member.connected ? "—" : "dc"}</span>
        <span class="ob-mp-brief-ready-dot ${dotCls}"></span>
      </div>
    `;
  }).join("");
}

function describePhase(state: MultiplayerRoomSnapshot): string {
  switch (state.phase) {
    case "COUNTDOWN":
      return `Ready Check · ${Math.ceil(state.countdownRemaining)}`;
    case "PLAYING":
      return `Round Live · ${formatTime(state.roundTimeRemaining)}`;
    case "ROUND_END":
      return "Round Complete";
    default:
      return "Lobby Open";
  }
}

function describeQueueState(state: MultiplayerRoomSnapshot, humans: number): string {
  if (state.phase === "COUNTDOWN") {
    return "Both squads are full and the ready check passed.";
  }
  if (state.phase === "PLAYING") {
    return "Match is deployed. Menu access and settings stay available between points.";
  }
  if (state.phase === "ROUND_END") {
    return "Point resolved. The next round will auto-cycle while the room stays checked in.";
  }
  if (humans === 0) {
    return "Waiting for pilots to join the room.";
  }
  return "Bots can backfill open seats until more humans connect.";
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function playlistLabel(size: MatchTeamSize): string {
  switch (size) {
    case 1:
      return "1v1 Duel";
    case 2:
      return "2v2 Duos";
    case 5:
      return "5v5 Squads";
    case 10:
      return "10v10 Rush";
    case 20:
      return "20v20 War";
  }
}

function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}
