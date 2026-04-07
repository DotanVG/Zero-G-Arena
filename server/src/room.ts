import WebSocket from "ws";
import Sim from "./sim";
import ServerPlayer from "./player";
import { TICK_RATE } from "../../shared/constants";

export class Room {
  public readonly id: string;
  public clients: Map<WebSocket, ServerPlayer> = new Map();
  public sim: Sim = new Sim();
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  public constructor(id: string) {
    this.id = id;
  }

  public addClient(ws: WebSocket, name: string): ServerPlayer {
    const team: 0 | 1 = this.clients.size % 2 === 0 ? 0 : 1;
    const player = new ServerPlayer(name, team);
    this.clients.set(ws, player);
    this.sim.addPlayer(player);
    return player;
  }

  public removeClient(ws: WebSocket): void {
    const player = this.clients.get(ws);
    if (player) {
      this.sim.removePlayer(player.id);
    }
    this.clients.delete(ws);
  }

  public start(): void {
    if (this.tickInterval) {
      return;
    }

    this.tickInterval = setInterval(() => {
      this.sim.tick(1 / TICK_RATE);
      const snap = this.sim.getSnapshot();
      this.broadcast(snap);
    }, 1000 / TICK_RATE);
  }

  public broadcast(msg: unknown): void {
    const str = JSON.stringify(msg);
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(str);
      }
    }
  }

  public stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}
