import { WebSocketServer, WebSocket } from "ws";
import { Room } from "./room";
import { parseClientMsg, sendState } from "./messages";

declare const process: {
  env: Record<string, string | undefined>;
};

const PORT = Number(process.env.PORT) || 3001;
const wss = new WebSocketServer({ port: PORT });
const defaultRoom = new Room("default");
defaultRoom.start();

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const name = url.searchParams.get("name") ?? "Player";
  defaultRoom.addClient(ws, name);
  sendState(ws, defaultRoom.sim.getSnapshot());

  ws.on("message", (raw) => {
    const msg = parseClientMsg(raw.toString());
    if (!msg) {
      return;
    }

    if (msg.t === "input") {
      const p = defaultRoom.clients.get(ws);
      if (p) {
        p.lastInput = msg;
      }
    }
  });

  ws.on("close", () => {
    defaultRoom.removeClient(ws);
  });

  ws.on("error", () => {
    ws.terminate();
  });
});

console.log("Orbital Breach server running on port", PORT);
