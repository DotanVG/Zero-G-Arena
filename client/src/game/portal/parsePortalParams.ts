export interface PortalParams {
  avatar_url?: string;
  color?: string;
  hp?: number;
  portal?: boolean;
  ref?: string;
  rotation_x?: number;
  rotation_y?: number;
  rotation_z?: number;
  speed?: number;
  speed_x?: number;
  speed_y?: number;
  speed_z?: number;
  team?: string;
  username?: string;
}

function optionalString(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(params: URLSearchParams, key: string): number | undefined {
  const value = optionalString(params, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRelativeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return true;
  }
}

function optionalRef(params: URLSearchParams): string | undefined {
  const value = optionalString(params, "ref");
  if (value === undefined) return undefined;

  const lower = value.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    return undefined;
  }

  if (!isRelativeUrl(value)) {
    return undefined;
  }

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://example.com";
    const parsed = new URL(value, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return value;
}

export function parsePortalParams(): PortalParams {
  try {
    if (typeof window === "undefined") return {};

    const searchParams = new URLSearchParams(window.location.search);
    return {
      avatar_url: optionalString(searchParams, "avatar_url"),
      color: optionalString(searchParams, "color"),
      hp: optionalNumber(searchParams, "hp"),
      portal: searchParams.get("portal") === "true" ? true : undefined,
      ref: optionalRef(searchParams),
      rotation_x: optionalNumber(searchParams, "rotation_x"),
      rotation_y: optionalNumber(searchParams, "rotation_y"),
      rotation_z: optionalNumber(searchParams, "rotation_z"),
      speed: optionalNumber(searchParams, "speed"),
      speed_x: optionalNumber(searchParams, "speed_x"),
      speed_y: optionalNumber(searchParams, "speed_y"),
      speed_z: optionalNumber(searchParams, "speed_z"),
      team: optionalString(searchParams, "team"),
      username: optionalString(searchParams, "username"),
    };
  } catch {
    return {};
  }
}
