/**
 * Lobby screen — shown while waiting for players before a match starts.
 * Neon laser-tag space aesthetic.
 */
import type { LobbyStateMsg } from '../../../shared/schema';

export class LobbyScreen {
  private el: HTMLDivElement | null = null;
  public onAddBots: (() => void) | null = null;
  public onToggleReady: ((ready: boolean) => void) | null = null;
  public onBack: (() => void) | null = null;
  public onSwitchTeam: (() => void) | null = null;
  public onRemoveBot: ((team: 0 | 1) => void) | null = null;

  public show(msg: LobbyStateMsg): void {
    this.hide();
    this.el = document.createElement('div');

    const team0 = msg.players.filter(p => p.team === 0);
    const team1 = msg.players.filter(p => p.team === 1);
    const humanPlayers = msg.players.filter(p => !p.isBot);
    const humanCount = humanPlayers.length;
    const readyHumans = humanPlayers.filter(p => p.ready).length;
    const botCount = msg.players.length - humanCount;
    const total = msg.matchSize * 2;
    const selfPlayer = msg.players.find(p => p.id === msg.selfId);
    const selfReady = selfPlayer?.ready ?? false;
    const countdownLabel = msg.countdown
      ? `ROUND START IN ${msg.countdown}`
      : `READY STATUS ${readyHumans}/${humanCount} HUMANS`;

    this.el.innerHTML = `
      <style>
        .lobby-root {
          position: fixed; inset: 0; background: rgba(8,12,20,0.92);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-family: monospace; color: #ccc; z-index: 200;
        }
        .lobby-back {
          position: absolute; top: 20px; left: 20px;
        }
        .lobby-title {
          font-size: 28px; letter-spacing: 6px; color: #00ffff;
          text-shadow: 0 0 20px #00ffff, 0 0 40px #00ffff88; margin-bottom: 8px;
        }
        .lobby-sub {
          font-size: 12px; color: #556; letter-spacing: 4px; margin-bottom: 18px;
        }
        .lobby-countdown {
          min-height: 18px; margin-bottom: 18px; font-size: 12px; letter-spacing: 3px; color: #8ab8d8;
        }
        .lobby-teams {
          display: flex; gap: 40px;
        }
        .lobby-team {
          width: 240px;
        }
        .lobby-team-header {
          font-size: 13px; letter-spacing: 3px; padding: 6px 0;
          border-bottom: 1px solid; margin-bottom: 8px; text-align: center;
        }
        .lobby-team-header.cyan  { color: #00ffff; border-color: #00ffff55; text-shadow: 0 0 10px #00ffff; }
        .lobby-team-header.mag   { color: #ff00ff; border-color: #ff00ff55; text-shadow: 0 0 10px #ff00ff; }
        .lobby-player {
          display: flex; justify-content: space-between; gap: 12px;
          font-size: 13px; padding: 5px 8px; margin-bottom: 4px;
          background: rgba(255,255,255,0.04); border-radius: 3px;
        }
        .lobby-player.bot { color: #7a7a7a; }
        .lobby-player.self { outline: 1px solid rgba(255,255,255,0.14); }
        .lobby-ready { color: #6dffb3; }
        .lobby-unready { color: #5d677c; }
        .lobby-waiting { font-size: 12px; color: #444; font-style: italic; padding: 4px 8px; }
        .lobby-status {
          margin-top: 24px; font-size: 12px; color: #556; letter-spacing: 2px;
        }
        .lobby-status span { color: #aaa; }
        .lobby-controls {
          display: flex; gap: 12px; margin-top: 20px;
        }
        .lobby-btn {
          background: rgba(0,255,255,0.08);
          border: 1px solid #00ffff44;
          color: #00d5ff;
          font-family: monospace;
          font-size: 12px;
          letter-spacing: 2px;
          padding: 10px 18px;
          cursor: pointer;
          text-transform: uppercase;
        }
        .lobby-btn:hover {
          background: rgba(0,255,255,0.14);
          border-color: #00ffffaa;
          color: #7cf7ff;
        }
        .lobby-btn.primary {
          border-color: #ff00ff55;
          color: #ff6bff;
        }
        .lobby-btn.primary:hover {
          background: rgba(255,0,255,0.14);
          border-color: #ff00ffaa;
          color: #ffb0ff;
        }
      </style>
      <div class="lobby-root">
        <div class="lobby-back">
          <button class="lobby-btn" id="lobby-back">Back</button>
        </div>
        <div class="lobby-title">ORBITAL BREACH</div>
        <div class="lobby-sub">MATCHMAKING — ${msg.matchSize}v${msg.matchSize}</div>
        <div class="lobby-countdown">${countdownLabel}</div>
        <div class="lobby-teams">
          <div class="lobby-team">
            <div class="lobby-team-header cyan">CYAN TEAM</div>
            ${team0.map(p => this._playerRow(p, msg.selfId)).join('')}
            ${Array(msg.matchSize - team0.length).fill('<div class="lobby-waiting">waiting...</div>').join('')}
          </div>
          <div class="lobby-team">
            <div class="lobby-team-header mag">MAGENTA TEAM</div>
            ${team1.map(p => this._playerRow(p, msg.selfId)).join('')}
            ${Array(msg.matchSize - team1.length).fill('<div class="lobby-waiting">waiting...</div>').join('')}
          </div>
        </div>
        <div class="lobby-status">
          PLAYERS: <span>${msg.players.length}</span>/<span>${total}</span>
          • HUMANS: <span>${humanCount}</span>
          • BOTS: <span>${botCount}</span>
        </div>
        <div class="lobby-controls">
          <button class="lobby-btn" id="lobby-add-bots">Add Bots</button>
          <button class="lobby-btn" id="lobby-rem-bot-0">Remove Bot (Cyan)</button>
          <button class="lobby-btn" id="lobby-rem-bot-1">Remove Bot (Mag)</button>
          <button class="lobby-btn" id="lobby-switch-team">Switch Team</button>
          <button class="lobby-btn primary" id="lobby-ready">${selfReady ? 'Unready' : 'Ready'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);
    this.el.querySelector('#lobby-add-bots')?.addEventListener('click', () => this.onAddBots?.());
    this.el.querySelector('#lobby-rem-bot-0')?.addEventListener('click', () => this.onRemoveBot?.(0));
    this.el.querySelector('#lobby-rem-bot-1')?.addEventListener('click', () => this.onRemoveBot?.(1));
    this.el.querySelector('#lobby-switch-team')?.addEventListener('click', () => this.onSwitchTeam?.());
    this.el.querySelector('#lobby-ready')?.addEventListener('click', () => this.onToggleReady?.(!selfReady));
    this.el.querySelector('#lobby-back')?.addEventListener('click', () => this.onBack?.());
  }

  private _playerRow(
    player: LobbyStateMsg['players'][number],
    selfId: string,
  ): string {
    const classes = ['lobby-player'];
    if (player.isBot) classes.push('bot');
    if (player.id === selfId) classes.push('self');

    const statusLabel = player.isBot
      ? 'BOT'
      : player.ready
        ? 'READY'
        : 'WAIT';
    const statusClass = player.ready || player.isBot ? 'lobby-ready' : 'lobby-unready';

    return `
      <div class="${classes.join(' ')}">
        <span>${player.isBot ? '[BOT] ' : ''}${player.name}</span>
        <span class="${statusClass}">${statusLabel}</span>
      </div>
    `;
  }

  public hide(): void {
    this.el?.remove();
    this.el = null;
  }
}
