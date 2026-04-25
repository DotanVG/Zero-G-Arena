import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { ErrorRequestHandler, Request, Response } from "express";
import { MULTIPLAYER_ROOM_NAME } from "../../shared/multiplayer";
import { OrbitalLobbyRoom } from "./colyseus/OrbitalLobbyRoom";

const PORT = Number(process.env.PORT || 2567);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PROD = NODE_ENV === "production";

const DEFAULT_ORIGINS = [
  "https://orbital-breach.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

const allowedOrigins = new Set<string>([
  ...DEFAULT_ORIGINS,
  ...(process.env.CLIENT_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

async function main(): Promise<void> {
  const transport = new WebSocketTransport();

  // Render terminates TLS in front of Node; let Colyseus advertise the request
  // host in production seat reservations. Dev keeps localhost so direct WS works.
  const publicAddress =
    process.env.PUBLIC_ADDRESS ?? (IS_PROD ? undefined : `localhost:${PORT}`);

  const gameServer = new Server({
    transport,
    ...(publicAddress ? { publicAddress } : {}),
    express: (app) => {
      app.disable("x-powered-by");

      app.use(
        helmet({
          contentSecurityPolicy: false,
          crossOriginResourcePolicy: { policy: "cross-origin" },
        }),
      );

      app.use(
        cors({
          origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (allowedOrigins.has(origin)) return cb(null, true);
            return cb(new Error("CORS: origin not allowed"));
          },
          methods: ["GET", "POST", "OPTIONS"],
          credentials: false,
        }),
      );

      const probeLimiter = rateLimit({
        windowMs: 60_000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
      });

      const probePayload = () => ({
        ok: true,
        service: "orbital-breach-colyseus",
        time: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
      });

      app.get("/health", probeLimiter, (_req: Request, res: Response) => {
        res.json(probePayload());
      });
      app.get("/wake", probeLimiter, (_req: Request, res: Response) => {
        res.json(probePayload());
      });

      const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
        if (!IS_PROD) console.error(err);
        res.status(500).json({
          ok: false,
          error: IS_PROD ? "internal_error" : String(err?.message ?? err),
        });
      };
      app.use(errorHandler);
    },
  });

  // Do not mount @colyseus/monitor in production without auth; it exposes
  // room state, client list, and admin actions to anyone with the URL.
  gameServer.define(MULTIPLAYER_ROOM_NAME, OrbitalLobbyRoom);
  await gameServer.listen(PORT);

  console.log(`Colyseus listening on port ${PORT}`);
}

void main().catch((error) => {
  console.error("Failed to start Orbital Breach server.", error);
  process.exitCode = 1;
});
