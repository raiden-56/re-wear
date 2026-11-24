import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ReWear",
    short_name: "ReWear",
    description: "Sell old clothes by the kilogram. Free doorstep pickup, transparent weighing, direct UPI payment.",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F0E7",
    theme_color: "#174B37",
    categories: ["shopping", "lifestyle", "finance"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Sell clothes", short_name: "Sell", url: "/app/sell", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My pickups", short_name: "Pickups", url: "/app/bookings", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Collector app", short_name: "Collect", url: "/collector", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
