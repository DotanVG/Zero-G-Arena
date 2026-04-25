import { getProbeUrl } from "./endpoint";

let wakeStarted = false;

export function wakeBackend(): void {
  if (wakeStarted) return;
  wakeStarted = true;

  const wakeUrl = getProbeUrl("/wake");
  const healthUrl = getProbeUrl("/health");
  if (!wakeUrl) {
    if (import.meta.env.PROD) {
      console.warn("[wake] VITE_COLYSEUS_ENDPOINT not set — online multiplayer disabled.");
    }
    return;
  }

  const TIMEOUT_MS = 7000;

  const ping = async (url: string): Promise<boolean> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        signal: ctrl.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  void (async () => {
    const okWake = await ping(wakeUrl);
    if (okWake) {
      console.log("[wake] backend ready");
      return;
    }
    if (!healthUrl) return;
    const okHealth = await ping(healthUrl);
    console.log(
      okHealth ? "[wake] backend ready (via /health)" : "[wake] backend unreachable",
    );
  })();
}
