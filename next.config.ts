import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones/other devices on the LAN to load the dev server's assets
  // (Next.js blocks cross-origin dev requests by default). Covers the current
  // LAN IP plus the whole 192.168.0.x subnet in case DHCP reassigns it.
  allowedDevOrigins: ["192.168.0.55", "192.168.0.*"],
};

export default nextConfig;
