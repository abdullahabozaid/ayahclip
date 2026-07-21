import type { NextRequest } from "next/server";

function ipv4Parts(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

/** True only for the loopback/private-LAN hosts supported by the on-device
 * filesystem features. Domain names and public IP addresses are rejected. */
export function isLocalNetworkHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") {
    return true;
  }
  const octets = ipv4Parts(normalized);
  if (!octets) return false;
  const [first, second] = octets;
  return first === 127
    || first === 10
    || (first === 192 && second === 168)
    || (first === 172 && second >= 16 && second <= 31);
}

function requestHost(request: NextRequest): string | null {
  const value = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const first = value?.split(",", 1)[0]?.trim().toLowerCase();
  return first || null;
}

function requestProtocol(request: NextRequest): "http:" | "https:" | null {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  const protocol = forwarded ? `${forwarded}:` : request.nextUrl.protocol.toLowerCase();
  return protocol === "http:" || protocol === "https:" ? protocol : null;
}

/** Filesystem-backed features (disk library, save-export) run ONLY when the
 * operator explicitly enables them on a machine they own. Request headers can
 * never turn this on — headers refine WHICH origin may call; the env decides IF.
 * Dev default: on unless explicitly "0". Production default: off unless "1", so
 * the public VPS is browser-storage-only regardless of forged X-Forwarded-* /
 * Origin headers (which could otherwise reach these routes via the shared
 * Docker network, bypassing Caddy). */
export function filesystemFeaturesEnabled(): boolean {
  return process.env.AYAHCLIP_ENABLE_DISK_LIBRARY === "1"
    || (process.env.AYAHCLIP_ENABLE_DISK_LIBRARY !== "0" && process.env.NODE_ENV !== "production");
}

/** Browser mutations of the local filesystem must come from the exact origin
 * serving AyahClip. Merely being another private-LAN origin is not sufficient:
 * otherwise any page on the same Wi-Fi could submit a cross-origin write. */
export function localMutationAllowed(request: NextRequest): boolean {
  if (!filesystemFeaturesEnabled()) return false;
  const origin = request.headers.get("origin");
  const host = requestHost(request);
  const protocol = requestProtocol(request);
  if (!origin || !host || !protocol) return false;

  try {
    const parsed = new URL(origin);
    return parsed.origin.toLowerCase() === `${protocol}//${host}`
      && isLocalNetworkHostname(parsed.hostname);
  } catch {
    return false;
  }
}
