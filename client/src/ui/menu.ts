/**
 * Main Menu — neon laser-tag space aesthetic.
 * Rendered as DOM over the Three.js scene (scene still renders behind).
 */
import type { RoomListMsg, RoomInfo } from '../../../shared/schema';

export type MatchSize = 5 | 10 | 20;

const CSS = `
  @keyframes glowPulse {
    0%,100% { text-shadow: 0 0 10px #00ffff, 0 0 30px #00ffff88; }
    50%      { text-shadow: 0 0 20px #00ffff, 0 0 60px #00ffff, 0 0 80px #00ffff44; }
  }
  @keyframes flicker {
    0%,96%,98%,100% { opacity:1; }
    97%,99%         { opacity:0.7; }
  }
  @keyframes scanline {
    0%   { background-position: 0 0; }
    100% { background-position: 0 4px; }
  }
  @keyframes menuFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .menu-root {
    position: fixed; inset: 0;
    background: rgba(8,12,20,0.88);
    background-image: repeating-linear-gradient(
      0deg, transparent, transparent 3px, rgba(0,255,255,0.02) 3px, rgba(0,255,255,0.02) 4px
    );
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: monospace; color: #aaa; z-index: 300;
    animation: scanline 0.1s linear infinite, menuFadeIn 0.35s ease-out both;
    transition: opacity 0.22s ease-out, transform 0.22s ease-out;
  }
  .menu-title {
    font-size: 52px; letter-spacing: 12px; font-weight: bold;
    color: #00ffff; animation: glowPulse 2.5s ease-in-out infinite, flicker 8s infinite;
    margin-bottom: 6px;
  }
  .menu-subtitle {
    font-size: 13px; letter-spacing: 6px; color: #4477bb; margin-bottom: 48px;
    text-transform: uppercase;
  }
  .menu-section { margin-bottom: 28px; text-align: center; }
  .menu-label {
    font-size: 10px; letter-spacing: 4px; color: #556; margin-bottom: 12px;
    text-transform: uppercase;
  }
  .menu-buttons { display: flex; gap: 12px; }
  .menu-btn {
    background: rgba(0,255,255,0.05);
    border: 1px solid #00ffff44;
    color: #00cccc; font-family: monospace; font-size: 14px;
    letter-spacing: 3px; padding: 12px 24px; cursor: pointer;
    text-transform: uppercase; transition: all 0.15s ease;
    border-radius: 2px;
  }
  .menu-btn:hover {
    background: rgba(0,255,255,0.15); border-color: #00ffff;
    color: #00ffff; text-shadow: 0 0 10px #00ffff;
    box-shadow: 0 0 20px rgba(0,255,255,0.2) inset, 0 0 10px rgba(0,255,255,0.1);
  }
  .menu-btn.mag {
    border-color: #ff00ff44; color: #cc00cc;
  }
  .menu-btn.mag:hover {
    background: rgba(255,0,255,0.15); border-color: #ff00ff;
    color: #ff00ff; text-shadow: 0 0 10px #ff00ff;
    box-shadow: 0 0 20px rgba(255,0,255,0.2) inset, 0 0 10px rgba(255,0,255,0.1);
  }
  .menu-input {
    background: rgba(0,0,0,0.5); border: 1px solid #334;
    color: #0cf; font-family: monospace; font-size: 13px;
    padding: 8px 14px; outline: none; letter-spacing: 2px;
    border-radius: 2px; width: 200px; text-align: center;
  }
  .menu-input:focus { border-color: #00ffff88; }
  .menu-divider {
    width: 300px; height: 1px; background: linear-gradient(90deg, transparent, #224, transparent);
    margin: 8px 0 24px;
  }
  .menu-hidden { display: none; }
  .menu-back {
    position: fixed; top: 20px; left: 20px;
  }
  .menu-room-list {
    max-height: 180px; overflow-y: auto; width: 480px;
    background: rgba(0,0,0,0.4); border: 1px solid #223; border-radius: 2px;
    margin-bottom: 12px;
  }
  .menu-room-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; border-bottom: 1px solid #1a2030;
    font-size: 12px; cursor: pointer; transition: background 0.1s;
  }
  .menu-room-row:hover { background: rgba(0,255,255,0.08); }
  .menu-room-row:last-child { border-bottom: none; }
  .menu-ping { color: #556; font-size: 11px; }
  .menu-version { position: fixed; bottom: 12px; right: 16px; font-size: 10px; color: #334; letter-spacing: 2px; }
`;

export class MainMenu {
  private el:    HTMLDivElement | null  = null;
  private styleEl: HTMLStyleElement | null = null;

  // Callbacks
  public onQuickPlay:   ((size: MatchSize) => void) | null = null;
  public onBrowseRooms: (() => void)                | null = null;
  public onJoinRoom:    ((roomId: string, size: MatchSize) => void) | null = null;

  public show(): void {
    this.hide();
    this._injectStyle();

    const playerName = localStorage.getItem('orbital_player_name') ?? '';

    this.el = document.createElement('div');
    this.el.innerHTML = `
      <div class="menu-root" id="menu-root">
        <div class="menu-title">ORBITAL BREACH</div>
        <div class="menu-subtitle">Zero-G Arena Shooter · Vibe Jam 2026</div>

        <div class="menu-section" id="menu-name-section">
          <div class="menu-label">Call Sign</div>
          <input class="menu-input" id="menu-name" type="text"
            placeholder="ENTER NAME" maxlength="16" value="${playerName}" />
        </div>

        <div class="menu-divider" id="menu-divider"></div>

        <div class="menu-section" id="menu-quickplay-section">
          <div class="menu-label">Quick Play</div>
          <div class="menu-buttons">
            <button class="menu-btn" id="btn-5v5">5v5</button>
            <button class="menu-btn" id="btn-10v10">10v10</button>
            <button class="menu-btn mag" id="btn-20v20">20v20</button>
          </div>
        </div>

        <div class="menu-section" id="menu-browse-section">
          <button class="menu-btn" id="btn-browse" style="font-size:12px;padding:8px 20px">
            Browse Rooms
          </button>
        </div>

        <div class="menu-version">v0.1.0 · ORBITAL BREACH</div>
        <div class="menu-section menu-hidden" id="menu-room-browser">
          <div class="menu-back">
            <button class="menu-btn" id="btn-back" style="font-size:12px;padding:8px 20px">
              Back
            </button>
          </div>
          <div class="menu-label">Open Rooms</div>
          <div class="menu-room-list" id="menu-room-list">
            <div class="menu-room-row" style="color:#444;justify-content:center">No open rooms</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    // Event listeners
    this.el.querySelector('#btn-5v5')!.addEventListener('click', () => this._quickPlay(5));
    this.el.querySelector('#btn-10v10')!.addEventListener('click', () => this._quickPlay(10));
    this.el.querySelector('#btn-20v20')!.addEventListener('click', () => this._quickPlay(20));
    this.el.querySelector('#btn-browse')!.addEventListener('click', () => {
      this._saveName();
      this._setBrowseMode(true);
      this.onBrowseRooms?.();
    });
    this.el.querySelector('#btn-back')!.addEventListener('click', () => this._setBrowseMode(false));
    this.el.querySelector('#menu-room-list')!.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('.menu-room-row[data-room]');
      if (!row) return;
      const roomId = row.dataset.room;
      const size = Number(row.dataset.size) as MatchSize;
      if (!roomId || !size) return;
      this._saveName();
      this.onJoinRoom?.(roomId, size);
    });

    const nameInput = this.el.querySelector('#menu-name') as HTMLInputElement;
    nameInput.addEventListener('input', () => {
      if (nameInput.value.trim()) {
        localStorage.setItem('orbital_player_name', nameInput.value.trim());
      }
    });
  }

  public updateRoomList(msg: RoomListMsg): void {
    const list = this.el?.querySelector('#menu-room-list');
    if (!list) return;
    list.innerHTML = msg.rooms.length === 0
      ? '<div class="menu-room-row" style="color:#444;justify-content:center">No open rooms</div>'
      : msg.rooms.map(r => this._roomRow(r)).join('');
  }

  public hide(): void {
    this.el?.remove();
    this.el = null;
  }

  /** Fade the menu out, then call cb (or just call cb immediately if nothing to fade). */
  public fadeOut(cb?: () => void): void {
    const root = this.el?.querySelector<HTMLElement>('#menu-root');
    if (!root) { cb?.(); return; }
    root.style.opacity = '0';
    root.style.transform = 'scale(1.04)';
    root.style.pointerEvents = 'none';
    setTimeout(() => { this.hide(); cb?.(); }, 230);
  }

  public isVisible(): boolean { return this.el !== null; }

  private _quickPlay(size: MatchSize): void {
    this._saveName();
    this.onQuickPlay?.(size);
  }

  private _saveName(): void {
    const input = this.el?.querySelector('#menu-name') as HTMLInputElement | null;
    const name  = input?.value.trim();
    if (name) localStorage.setItem('orbital_player_name', name);
  }

  private _roomRow(r: RoomInfo): string {
    const fill = r.phase === 'LOBBY' ? '#0cf' : '#556';
    return `
      <div class="menu-room-row" data-room="${r.id}" data-size="${r.matchSize}">
        <span style="color:${fill}">${r.id}</span>
        <span>${r.matchSize}v${r.matchSize}</span>
        <span>${r.playerCount}/${r.maxPlayers}</span>
        <span style="color:${r.phase === 'LOBBY' ? '#0cf' : '#888'}">${r.phase}</span>
      </div>
    `;
  }

  private _setBrowseMode(active: boolean): void {
    this.el?.querySelector('#menu-name-section')?.classList.toggle('menu-hidden', active);
    this.el?.querySelector('#menu-divider')?.classList.toggle('menu-hidden', active);
    this.el?.querySelector('#menu-quickplay-section')?.classList.toggle('menu-hidden', active);
    this.el?.querySelector('#menu-browse-section')?.classList.toggle('menu-hidden', active);
    this.el?.querySelector('#menu-room-browser')?.classList.toggle('menu-hidden', !active);
  }

  private _injectStyle(): void {
    if (this.styleEl) return;
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);
  }

  public dispose(): void {
    this.hide();
    this.styleEl?.remove();
    this.styleEl = null;
  }
}
