import type { NextConfig } from "next";

const isHostedProduction =
  process.env.VERCEL_ENV === "production" || process.env.DOCKER_BUILD === "1";

const contentSecurityPolicy = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  ...(isHostedProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Next.js' minimal production server is used by the VPS Docker image. Local
  // builds keep the standard output so existing development workflows stay the
  // same.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  deploymentId: process.env.DEPLOYMENT_VERSION,
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
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
