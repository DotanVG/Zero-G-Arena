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
    express: (app) => {
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
