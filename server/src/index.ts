import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MULTIPLAYER_ROOM_NAME } from "../../shared/multiplayer";
import { OrbitalLobbyRoom } from "./colyseus/OrbitalLobbyRoom";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const PORT = Number(process.env.PORT) || 3001;

async function main(): Promise<void> {
  const transport = new WebSocketTransport();
  const gameServer = new Server({
    transport,
    publicAddress: `localhost:${PORT}`,
    express: (app) => {
      app.use((req: any, res: any, next: () => void) => {
        res.header("Access-Control-Allow-Origin", "http://localhost:5173");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        if (req.method === "OPTIONS") {
          res.sendStatus(204);
          return;
        }
        next();
      });
      app.get("/health", (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json({
          ok: true,
          transport: "colyseus",
          room: MULTIPLAYER_ROOM_NAME,
        });
      });
    },
  });

  gameServer.define(MULTIPLAYER_ROOM_NAME, OrbitalLobbyRoom);
  await gameServer.listen(PORT);

  console.log("Orbital Breach Colyseus server running on port", PORT);
}

void main().catch((error) => {
  console.error("Failed to start Orbital Breach server.", error);
  process.exitCode = 1;
});
