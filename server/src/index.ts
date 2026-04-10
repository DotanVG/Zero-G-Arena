import { WebSocketServer, WebSocket } from 'ws';
import { Room, type MatchSize } from './room';
import type { ClientMessage, RoomListMsg } from '../../shared/schema';

declare const process: {
  env: Record<string, string | undefined>;
};

const PORT = Number(process.env.PORT) || 3001;
const wss  = new WebSocketServer({ port: PORT });

// ── Room Manager ─────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
let roomCounter = 0;

function createRoom(matchSize: MatchSize): Room {
  const id   = `room-${++roomCounter}`;
  const room = new Room(id, matchSize);
  room.onEmpty = (r) => { rooms.delete(r.id); };
  rooms.set(id, room);
  room.start();
  return room;
}

function findOrCreateRoom(matchSize: MatchSize): Room {
  // Find a non-full room of the same match size that is still in LOBBY
  for (const room of rooms.values()) {
    if (room.matchSize === matchSize && !room.isFull() && room.getPhase() === 'LOBBY') {
      return room;
    }
  }
  return createRoom(matchSize);
}

// ── Connection handler ────────────────────────────────────────────────────────

wss.on('connection', (ws: WebSocket, req) => {
  const url  = new URL(req.url ?? '/', 'http://localhost');
  const name = url.searchParams.get('name') ?? 'Player';

  // Parse match size from URL (default 5v5 for quick join)
  const sizeParam = Number(url.searchParams.get('size') ?? '5') as MatchSize;
  const matchSize: MatchSize = [5, 10, 20].includes(sizeParam)
    ? sizeParam
    : 5;

  const mode   = url.searchParams.get('mode') ?? 'quick';
  const roomId = url.searchParams.get('roomId');

  let room: Room;

  if (mode === 'browse' && roomId && rooms.has(roomId)) {
    room = rooms.get(roomId)!;
    if (room.isFull() || room.getPhase() !== 'LOBBY') {
      ws.send(JSON.stringify({ t: 'error', message: 'Room is unavailable' }));
      ws.close();
      return;
    }
  } else {
    room = findOrCreateRoom(matchSize);
  }

  const player = room.addClient(ws, name);

  ws.on('message', (raw) => {
    const msg = parseClientMsg(raw.toString());
    if (!msg) return;

    switch (msg.t) {
      case 'input':
        room.handleInput(ws, msg);
        break;
      case 'ready':
        room.handleReady(ws, msg.ready);
        break;
      case 'requestRoomList':
        sendRoomList(ws);
        break;
      case 'lobbyAction':
        room.handleLobbyAction(ws, msg.action, msg.team);
        break;
      case 'join':
        // Already handled on connection — ignore duplicate joins
        break;
    }
  });

  ws.on('close', () => room.removeClient(ws));
  ws.on('error', () => { ws.terminate(); room.removeClient(ws); });
});

function sendRoomList(ws: WebSocket): void {
  const msg: RoomListMsg = {
    t:     'roomList',
    rooms: [...rooms.values()].map(r => r.toRoomInfo()),
  };
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function parseClientMsg(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      't' in parsed &&
      typeof (parsed as { t?: unknown }).t === 'string'
    ) {
      return parsed as ClientMessage;
    }
  } catch { /* ignore */ }
  return null;
}

console.log(`Orbital Breach server running on port ${PORT}`);
