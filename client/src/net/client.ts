/**
 * NetClient — manages the WebSocket connection to the game server.
 */
import type {
  ClientInputMsg,
  ServerStateMsg,
  ArenaLayoutMsg,
  LobbyStateMsg,
  RoomListMsg,
  ServerEventMsg,
  ServerMessage,
} from '../../../shared/schema';

export type MatchSize = 5 | 10 | 20;

export class NetClient {
  private ws:        WebSocket | null = null;
  private pingStart: number  = 0;
  private _ping:     number  = 0;
  private _serverTimeOffset  = 0; // Date.now() + offset ≈ server time

  // Callbacks — set by App before connecting
  public onState:    ((msg: ServerStateMsg)  => void) | null = null;
  public onLayout:   ((msg: ArenaLayoutMsg)  => void) | null = null;
  public onLobby:    ((msg: LobbyStateMsg)   => void) | null = null;
  public onRoomList: ((msg: RoomListMsg)     => void) | null = null;
  public onEvent:    ((msg: ServerEventMsg)  => void) | null = null;
  public onClose:    (() => void)                     | null = null;

  public connect(name: string, matchSize: MatchSize, mode: 'quick' | 'browse' = 'quick', roomId?: string): void {
    const params = new URLSearchParams({ name, size: String(matchSize), mode });
    if (roomId) params.set('roomId', roomId);

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws?${params}`;

    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => this._onMessage(ev.data as string);
    this.ws.onclose   = () => { this.ws = null; this.onClose?.(); };
    this.ws.onerror   = () => { this.ws?.close(); };
    this.pingStart = Date.now();
  }

  public disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  public sendInput(msg: ClientInputMsg): void {
    this._send(msg);
  }

  public requestRoomList(): void {
    this._send({ t: 'requestRoomList' });
  }

  public addBots(): void {
    this._send({ t: 'lobbyAction', action: 'addBots' });
  }

  public switchTeam(): void {
    this._send({ t: 'lobbyAction', action: 'switchTeam' });
  }

  public removeBotFromTeam(team: 0 | 1): void {
    this._send({ t: 'lobbyAction', action: 'removeBotFromTeam', team });
  }

  public setReady(ready: boolean): void {
    this._send({ t: 'ready', ready });
  }

  public getPing(): number  { return this._ping; }
  public getServerTime(): number { return Date.now() + this._serverTimeOffset; }
  public isConnected(): boolean  { return this.ws?.readyState === WebSocket.OPEN; }

  private _send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _onMessage(raw: string): void {
    let msg: ServerMessage;
    try { msg = JSON.parse(raw) as ServerMessage; }
    catch { return; }

    switch (msg.t) {
      case 'state':
        this._serverTimeOffset = msg.serverTime - Date.now();
        this._ping = Date.now() - this.pingStart;
        this.pingStart = Date.now();
        this.onState?.(msg);
        break;
      case 'layout':
        this.onLayout?.(msg);
        break;
      case 'lobby':
        this.onLobby?.(msg);
        break;
      case 'roomList':
        this.onRoomList?.(msg);
        break;
      case 'event':
        this.onEvent?.(msg);
        break;
    }
  }
}
