import { MATCH_TEAM_SIZES, type MatchTeamSize } from "../../../shared/match";
import type { LobbyEventMessage, MultiplayerRoomSnapshot } from "../../../shared/multiplayer";

const CYAN = "#7ffcff";
const MAGENTA = "#ff7df8";

export class MultiplayerLobby {
  private root: HTMLDivElement;
  private status: HTMLDivElement;
  private phase: HTMLDivElement;
  private meta: HTMLDivElement;
  private score: HTMLDivElement;
  private readyButton: HTMLButtonElement;
  private switchTeamButton: HTMLButtonElement;
  private fillBotsButton: HTMLButtonElement;
  private clearBotsButton: HTMLButtonElement;
  private leaveButton: HTMLButtonElement;
  private teamSizeSelect: HTMLSelectElement;
  private team0Roster: HTMLDivElement;
  private team1Roster: HTMLDivElement;
  private latestState: MultiplayerRoomSnapshot | null = null;

  public onLeaveLobby: (() => void) | null = null;
  public onReadyChange: ((ready: boolean) => void) | null = null;
  public onSwitchTeam: ((team: 0 | 1) => void) | null = null;
  public onFillBots: ((fill: boolean) => void) | null = null;
  public onTeamSizeChange: ((teamSize: MatchTeamSize) => void) | null = null;

  public constructor() {
    this.root = document.createElement("div");
    this.root.innerHTML = buildMarkup();
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background:
        "radial-gradient(circle at top, rgba(15,33,54,0.8), rgba(4,8,18,0.94) 55%, rgba(0,0,0,0.98))",
      fontFamily: "'Share Tech Mono', monospace",
      color: "#dffcff",
      zIndex: "350",
    });
    document.body.appendChild(this.root);

    this.status = this.query("#mp-status");
    this.phase = this.query("#mp-phase");
    this.meta = this.query("#mp-meta");
    this.score = this.query("#mp-score");
    this.readyButton = this.query("#mp-ready");
    this.switchTeamButton = this.query("#mp-switch-team");
    this.fillBotsButton = this.query("#mp-fill-bots");
    this.clearBotsButton = this.query("#mp-clear-bots");
    this.leaveButton = this.query("#mp-leave");
    this.teamSizeSelect = this.query("#mp-team-size");
    this.team0Roster = this.query("#mp-team0-roster");
    this.team1Roster = this.query("#mp-team1-roster");

    this.teamSizeSelect.innerHTML = MATCH_TEAM_SIZES.map((size) =>
      `<option value="${size}">${size}v${size}</option>`).join("");

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
    this.setStatus(`Connecting ${escapeHtml(playerName)} to the Colyseus lobby...`, "info");
    this.phase.textContent = "Connecting";
    this.meta.textContent = "Waiting for the room handshake.";
    this.score.textContent = "0 - 0";
    this.team0Roster.innerHTML = `<div style="opacity:0.7">Joining room...</div>`;
    this.team1Roster.innerHTML = `<div style="opacity:0.7">Joining room...</div>`;
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
    this.status.style.color = kind === "error" ? "#ff9aa8" : "#9fe7ff";
    this.status.style.borderColor = kind === "error" ? "rgba(255,120,150,0.45)" : "rgba(0,255,255,0.22)";
    this.status.style.boxShadow = kind === "error"
      ? "0 0 20px rgba(255,80,120,0.12) inset"
      : "0 0 20px rgba(0,255,255,0.08) inset";
  }

  public render(state: MultiplayerRoomSnapshot): void {
    this.latestState = state;
    this.show();

    this.phase.textContent = describePhase(state);
    this.meta.textContent =
      `Room ${state.roomId} · ${state.teamSize}v${state.teamSize} · Round ${Math.max(1, state.roundNumber || 1)}`;
    this.score.textContent = `${state.score.team0} - ${state.score.team1}`;
    this.teamSizeSelect.value = String(state.teamSize);

    const self = this.getSelf(state);
    const isLobby = state.phase === "LOBBY";
    this.readyButton.disabled = !self || !isLobby;
    this.readyButton.textContent = self?.ready ? "Unready" : "Ready Up";
    this.switchTeamButton.disabled = !self || !isLobby;
    this.switchTeamButton.textContent = state.selfTeam === 0 ? "Switch To Magenta" : "Switch To Cyan";
    this.fillBotsButton.disabled = !isLobby;
    this.clearBotsButton.disabled = !isLobby;
    this.teamSizeSelect.disabled = !isLobby;

    if (state.phase === "COUNTDOWN") {
      this.setStatus(`Match starts in ${Math.ceil(state.countdownRemaining)}...`, "info");
    } else if (state.phase === "PLAYING") {
      this.setStatus(`Round live · ${formatTime(state.roundTimeRemaining)} left`, "info");
    } else if (state.phase === "ROUND_END") {
      this.setStatus("Round complete. Returning to lobby...", "info");
    } else {
      this.setStatus("Lobby ready. Fill teams, switch sides, then ready up.", "info");
    }

    this.team0Roster.innerHTML = renderRoster(
      state.members.filter((member) => member.team === 0),
      state.sessionId,
      CYAN,
    );
    this.team1Roster.innerHTML = renderRoster(
      state.members.filter((member) => member.team === 1),
      state.sessionId,
      MAGENTA,
    );
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
    <div style="
      width:min(980px, calc(100vw - 32px));
      border:1px solid rgba(110,180,220,0.25);
      background:rgba(6,10,18,0.88);
      box-shadow:0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,255,255,0.05) inset;
      border-radius:18px;
      padding:22px 24px 24px;
      backdrop-filter:blur(10px);
    ">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div style="font-size:28px;letter-spacing:0.12em;color:#dffcff;">COLYSEUS LOBBY</div>
          <div id="mp-phase" style="margin-top:6px;font-size:15px;letter-spacing:0.18em;color:#9fe7ff;"></div>
          <div id="mp-meta" style="margin-top:4px;font-size:12px;color:#6f91a5;"></div>
        </div>
        <div id="mp-score" style="
          font-size:30px;letter-spacing:0.2em;
          color:#ffffff;
          text-shadow:0 0 12px rgba(0,255,255,0.25);
        ">0 - 0</div>
      </div>

      <div id="mp-status" style="
        margin-top:14px;
        padding:10px 12px;
        border:1px solid rgba(0,255,255,0.22);
        border-radius:10px;
        font-size:13px;
        color:#9fe7ff;
        background:rgba(6,14,24,0.72);
      "></div>

      <div style="
        margin-top:18px;
        display:flex;
        gap:12px;
        flex-wrap:wrap;
        align-items:center;
      ">
        <label style="display:flex;gap:8px;align-items:center;font-size:12px;color:#87b0c6;">
          Team Size
          <select id="mp-team-size" style="
            background:rgba(0,0,0,0.45);
            border:1px solid rgba(110,180,220,0.28);
            color:#e9fcff;
            border-radius:8px;
            padding:8px 10px;
            font-family:inherit;
          "></select>
        </label>
        <button id="mp-ready" style="${buttonStyle("#00e7ff")}">Ready Up</button>
        <button id="mp-switch-team" style="${buttonStyle("#ff58ea")}">Switch Team</button>
        <button id="mp-fill-bots" style="${buttonStyle("#76ffb3")}">Fill Bots</button>
        <button id="mp-clear-bots" style="${buttonStyle("#ffd166")}">Clear Bots</button>
        <button id="mp-leave" style="${buttonStyle("#ff8ca0")}">Leave Lobby</button>
      </div>

      <div style="
        margin-top:20px;
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:16px;
      ">
        <section style="
          border:1px solid rgba(0,255,255,0.22);
          border-radius:14px;
          padding:14px;
          background:linear-gradient(180deg, rgba(0,255,255,0.08), rgba(0,0,0,0.12));
        ">
          <div style="font-size:14px;letter-spacing:0.12em;color:${CYAN};margin-bottom:10px;">CYAN TEAM</div>
          <div id="mp-team0-roster"></div>
        </section>
        <section style="
          border:1px solid rgba(255,0,255,0.22);
          border-radius:14px;
          padding:14px;
          background:linear-gradient(180deg, rgba(255,0,255,0.08), rgba(0,0,0,0.12));
        ">
          <div style="font-size:14px;letter-spacing:0.12em;color:${MAGENTA};margin-bottom:10px;">MAGENTA TEAM</div>
          <div id="mp-team1-roster"></div>
        </section>
      </div>
    </div>
  `;
}

function renderRoster(
  members: MultiplayerRoomSnapshot["members"],
  sessionId: string,
  accent: string,
): string {
  if (members.length === 0) {
    return `<div style="opacity:0.66;color:#90a9b8;">Empty slot lane</div>`;
  }

  return members.map((member) => {
    const labels = [
      member.id === sessionId ? "YOU" : "",
      member.isBot ? "BOT" : "HUMAN",
      member.ready ? "READY" : "WAITING",
    ].filter(Boolean).join(" · ");

    return `
      <div style="
        display:flex;
        justify-content:space-between;
        gap:12px;
        padding:8px 0;
        border-top:1px solid rgba(255,255,255,0.06);
      ">
        <div style="color:${accent};text-shadow:0 0 10px ${accent}33;">${escapeHtml(member.name)}</div>
        <div style="font-size:11px;color:#91afbe;">${labels}</div>
      </div>
    `;
  }).join("");
}

function describePhase(state: MultiplayerRoomSnapshot): string {
  switch (state.phase) {
    case "COUNTDOWN":
      return `Match Starting · ${Math.ceil(state.countdownRemaining)}`;
    case "PLAYING":
      return `Round Live · ${formatTime(state.roundTimeRemaining)}`;
    case "ROUND_END":
      return "Round Complete";
    default:
      return "Lobby Open";
  }
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function buttonStyle(glow: string): string {
  return `
    background:rgba(255,255,255,0.03);
    color:#effcff;
    border:1px solid ${glow}66;
    border-radius:999px;
    padding:10px 14px;
    font-family:inherit;
    letter-spacing:0.08em;
    cursor:pointer;
    box-shadow:0 0 18px ${glow}16 inset;
  `;
}

function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}
