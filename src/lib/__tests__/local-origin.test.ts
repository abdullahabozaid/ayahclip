import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { isLocalNetworkHostname, localMutationAllowed } from "../local-origin";

function mutationRequest(
  url: string,
  origin?: string,
  forwardedHost?: string,
  forwardedProto?: string,
): NextRequest {
  const parsed = new URL(url);
  const headers = new Headers({ host: parsed.host });
  if (origin) headers.set("origin", origin);
  if (forwardedHost) headers.set("x-forwarded-host", forwardedHost);
  if (forwardedProto) headers.set("x-forwarded-proto", forwardedProto);
  return new NextRequest(url, { method: "POST", headers });
}

describe("local filesystem origin boundary", () => {
  it("recognises loopback and valid private IPv4 hosts only", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]", "10.2.3.4", "172.16.0.1", "172.31.255.254", "192.168.1.9"]) {
      expect(isLocalNetworkHostname(host), host).toBe(true);
    }
    for (const host of ["localhost.attacker.test", "8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.1.9", "192.168.999.1"]) {
      expect(isLocalNetworkHostname(host), host).toBe(false);
    }
  });

  it("accepts the exact local origin serving AyahClip", () => {
    expect(localMutationAllowed(mutationRequest(
      "http://192.168.1.10:3000/api/library",
      "http://192.168.1.10:3000",
    ))).toBe(true);
    expect(localMutationAllowed(mutationRequest(
      "http://localhost:3000/api/library",
      "http://localhost:3000",
    ))).toBe(true);
  });

  it("rejects another private-LAN origin, a port mismatch, and a missing origin", () => {
    expect(localMutationAllowed(mutationRequest(
      "http://192.168.1.10:3000/api/library",
      "http://192.168.1.20:3000",
    ))).toBe(false);
    expect(localMutationAllowed(mutationRequest(
      "http://192.168.1.10:3000/api/library",
      "http://192.168.1.10:4000",
    ))).toBe(false);
    expect(localMutationAllowed(mutationRequest(
      "http://192.168.1.10:3000/api/library",
      "https://192.168.1.10:3000",
    ))).toBe(false);
    expect(localMutationAllowed(mutationRequest(
      "http://192.168.1.10:3000/api/library",
    ))).toBe(false);
  });

  it("uses the trusted proxy host when present", () => {
    expect(localMutationAllowed(mutationRequest(
      "http://127.0.0.1:3000/api/library",
      "https://192.168.1.10",
      "192.168.1.10",
      "https",
    ))).toBe(true);
    expect(localMutationAllowed(mutationRequest(
      "http://127.0.0.1:3000/api/library",
      "https://192.168.1.20",
      "192.168.1.10",
      "https",
    ))).toBe(false);
  });
});
