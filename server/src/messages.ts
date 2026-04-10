import type { ClientMessage, ServerEventMsg } from '../../shared/schema';
import WebSocket from 'ws';

export function parseClientMsg(raw: string): ClientMessage | null {
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

export function sendMsg(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function sendEvent(ws: WebSocket, type: ServerEventMsg['type'], data: unknown): void {
  sendMsg(ws, { t: 'event', type, data } satisfies ServerEventMsg);
}
