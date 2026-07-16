import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Allow phones/other devices on the LAN to load the dev server's assets
  // (Next.js blocks cross-origin dev requests by default). Covers the current
  // LAN IP plus the whole 192.168.0.x subnet in case DHCP reassigns it.
  allowedDevOrigins: ["192.168.0.55", "192.168.0.*"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
