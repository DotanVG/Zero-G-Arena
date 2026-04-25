# Render Colyseus Deployment

Production deployment notes for Orbital Breach online multiplayer.

## Target Architecture

Frontend:
- Vercel
- `https://orbital-breach.vercel.app`

Backend:
- Render Web Service
- Node.js Colyseus server
- Public backend URL placeholder: `https://orbital-breach-server.onrender.com`

Runtime flow:
1. Player opens the Vercel game.
2. Client loads.
3. Client sends one lightweight GET request to `<Render backend>/wake`.
4. If `/wake` fails, client tries `<Render backend>/health`.
5. Client does not auto-join an online room.
6. Player chooses online multiplayer.
7. Client connects to Colyseus using the configured production backend endpoint.

## Render Web Service Settings

```text
Service type: Web Service
Environment: Node
Branch: feature/render-colyseus-online-deploy first, then staging/main later
Root directory: server
Build command: npm install && npm run build
Start command: npm start
```

Render injects `PORT` automatically. Do not add `PORT` manually unless Render support asks you to.

## Render Env Vars

```env
NODE_ENV=production
CLIENT_ORIGIN=https://orbital-breach.vercel.app
```

`CLIENT_ORIGIN` also supports comma-separated origins:

```env
CLIENT_ORIGIN=https://orbital-breach.vercel.app,https://some-preview-domain.vercel.app
```

Optional:

```env
PUBLIC_ADDRESS=orbital-breach-server.onrender.com
```

Use `PUBLIC_ADDRESS` without protocol if Colyseus seat reservations advertise the wrong host. Render normally provides the correct request host, so this can be omitted at first.

## Vercel Env Var

```env
VITE_COLYSEUS_ENDPOINT=https://orbital-breach-server.onrender.com
```

Vite bakes env vars into the client bundle. After changing this value in Vercel, redeploy the frontend.

## Health And Wake Tests

```text
https://orbital-breach-server.onrender.com/health
https://orbital-breach-server.onrender.com/wake
```

Both endpoints should return only:

```json
{
  "ok": true,
  "service": "orbital-breach-colyseus",
  "time": "<ISO timestamp>",
  "uptime": 123
}
```

## Manual Deployment Flow

1. Make code changes on `feature/render-colyseus-online-deploy`.
2. Merge the feature branch into `staging`.
3. Deploy Render from `staging`, or from the feature branch for the first test.
4. Add `VITE_COLYSEUS_ENDPOINT` in Vercel.
5. Redeploy the Vercel preview or production frontend.
6. Smoke test online multiplayer.
7. Open a PR from `staging` to `main`.
8. Final deploy from `main`.

## Security Checklist

- No frontend secrets.
- CORS is not wildcard in production.
- Production CORS allows `https://orbital-breach.vercel.app`.
- Localhost origins still work in development.
- `/wake` and `/health` expose no sensitive data.
- Production does not use `localhost` or `127.0.0.1`.
- Public admin/monitor tooling is disabled or not mounted in production.
- Production frontend uses an HTTPS/WSS-safe backend endpoint.
- Error responses do not leak stack traces in production.
- Wake ping sends no credentials, auth headers, localStorage tokens, or player identifiers.
- Wake ping runs once per page load and does not auto-join a room.

## Troubleshooting

**CORS error**
Add the exact Vercel origin to Render's `CLIENT_ORIGIN`, then restart or redeploy the Render service. For preview deploys, include the preview domain in the comma-separated list.

**Mixed content error**
Use `https://...` for `VITE_COLYSEUS_ENDPOINT`. Do not use `http://...` or `ws://...` from a production HTTPS frontend.

**WebSocket failed**
Confirm Render is awake, `/health` works, the room name is `orbital_lobby`, and `PUBLIC_ADDRESS` is either omitted or set to the Render hostname without protocol.

**Render cold start**
The first request on the free tier can be slow. The client wakes the backend on page load, but the first join may still need a retry after several seconds.

**Client still connects to localhost**
Set `VITE_COLYSEUS_ENDPOINT` in Vercel and redeploy. Existing Vite builds do not pick up new env vars automatically.

**Health endpoint works but room join fails**
Check Render logs for Colyseus matchmake or WebSocket upgrade errors. If the seat reservation points to the wrong host, set `PUBLIC_ADDRESS=<render-service>.onrender.com`.

**Render build fails**
Confirm the root directory is `server`. Build command should be `npm install && npm run build`; start command should be `npm start`.

**Vercel env var missing**
Production builds without `VITE_COLYSEUS_ENDPOINT` intentionally do not fall back to localhost. Add the env var and redeploy.
