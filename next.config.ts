import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Static-preview build for GitHub Pages (see scripts/static-preview.mjs): served
// under a sub-path and without the image optimizer, which needs a server.
const previewBasePath = process.env.PREVIEW_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath: previewBasePath,
  distDir: process.env.PREVIEW_DIST_DIR || ".next",
  // Authenticated, per-user application: we use the request-time rendering model.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    unoptimized: Boolean(previewBasePath),
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  serverExternalPackages: ["exceljs"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
