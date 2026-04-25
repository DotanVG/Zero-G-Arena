const RAW = import.meta.env.VITE_COLYSEUS_ENDPOINT as string | undefined;

export function getColyseusEndpoint(): string | null {
  if (RAW && RAW.trim()) {
    const endpoint = RAW.trim().replace(/\/+$/, "");
    if (import.meta.env.PROD && !isSafeProductionEndpoint(endpoint)) {
      console.error(
        "[net] VITE_COLYSEUS_ENDPOINT must be an HTTPS/WSS production URL, not localhost or insecure HTTP/WS.",
      );
      return null;
    }
    return endpoint;
  }
  if (import.meta.env.PROD) return null;
  return `${location.protocol}//${location.host}`;
}

export function getProbeUrl(path: "/wake" | "/health"): string | null {
  const base = getColyseusEndpoint();
  if (!base) return null;
  const httpBase = base.replace(/^ws(s?):\/\//i, (_m, s) => `http${s}://`);
  return `${httpBase}${path}`;
}

function isSafeProductionEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && url.protocol !== "wss:") return false;
    return url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}
