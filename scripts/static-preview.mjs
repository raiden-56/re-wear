#!/usr/bin/env node
/**
 * Builds a static, read-only preview of ReWear's public website for GitHub Pages.
 *
 * GitHub Pages only serves files, so this preview cannot sign anyone in, take
 * bookings or move money. It renders the public pages from a production build
 * (against the seeded local database) and saves them as HTML under ./out.
 *
 *   PREVIEW_BASE_PATH=/re-wear node scripts/static-preview.mjs
 *
 * Requires the local database to be running and seeded (npm run db:local, db:seed).
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const base = (process.env.PREVIEW_BASE_PATH || "/re-wear").replace(/\/$/, "");
const repoUrl = process.env.PREVIEW_REPO_URL || "https://github.com/raiden-56/re-wear";
const port = Number(process.env.PREVIEW_PORT || 3017);
const distDir = ".next-preview";
const outDir = path.join(root, "out");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const env = {
  ...process.env,
  PREVIEW_BASE_PATH: base,
  PREVIEW_DIST_DIR: distDir,
  NEXT_PUBLIC_STATIC_PREVIEW: "true",
  NODE_ENV: "production",
  // Throwaway secret: the preview server only renders public pages, then exits.
  AUTH_SECRET: randomBytes(32).toString("hex"),
};

const PAGES = [
  "/", "/how-it-works", "/pricing", "/faq", "/about", "/sustainability", "/b2b",
  "/guidelines", "/contact", "/install", "/privacy", "/terms", "/shop", "/partners/register", "/offline",
];

function run(args) {
  const r = spawnSync(process.execPath, [nextBin, ...args], { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`next ${args.join(" ")} failed`);
}

async function waitForServer(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Preview server did not start");
}

const banner = `<script>addEventListener("load",function(){setTimeout(function(){var d=document.createElement("div");d.setAttribute("role","note");d.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:640px;margin:0 auto;padding:10px 14px;border-radius:12px;background:#292e2b;color:#f4f0e7;font:13px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)";d.innerHTML='<b>Static preview.</b> This GitHub Pages copy shows the public site only. Sign-in, pickups, payouts and the role portals need the full server deployment. <a href="${repoUrl}#readme" style="color:#e9b96e;text-decoration:underline">Run it yourself</a> <button aria-label="Dismiss" style="float:right;background:none;border:0;color:inherit;font-size:16px;cursor:pointer">\\u00d7</button>';d.querySelector("button").onclick=function(){d.remove()};document.body.appendChild(d)},800)});</script>`;

/** Root-relative URLs that Next didn't prefix (plain <a>, manifest icons) get the base path. */
function rewrite(html) {
  const b = base.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(\\s(?:href|src|action)=")/(?!/)(?!${b}/|${b}")`, "g");
  const prefixed = html.replace(re, (_, attr) => `${attr}${base}/`);
  return prefixed.replace("</head>", `${banner}</head>`);
}

function fileFor(route) {
  if (route === "/") return "index.html";
  return route.slice(1) + ".html";
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(`Building preview (basePath ${base})…`);
  run(["build"]);

  const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { cwd: root, env, stdio: "ignore" });
  try {
    const origin = `http://localhost:${port}`;
    await waitForServer(origin + base);

    const shop = await (await fetch(origin + base + "/shop")).text();
    const slugs = [...new Set([...shop.matchAll(new RegExp(`href="${base}/shop/([a-z0-9-]+)"`, "g"))].map((m) => m[1]))]
      .filter((s) => !["cart", "wishlist", "pay"].includes(s));
    const routes = [...PAGES, ...slugs.map((s) => `/shop/${s}`)];

    for (const route of routes) {
      const res = await fetch(origin + base + (route === "/" ? "" : route));
      if (res.status !== 200) throw new Error(`${route} returned ${res.status}`);
      const file = path.join(outDir, fileFor(route));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, rewrite(await res.text()));
      console.log(`  ${route}`);
    }

    // 404 page for anything not in the preview (sign-in, portals, cart…); the banner explains why.
    const notFound = await (await fetch(origin + base + "/__preview-404")).text();
    fs.writeFileSync(path.join(outDir, "404.html"), rewrite(notFound));
  } finally {
    server.kill();
  }

  fs.cpSync(path.join(root, distDir, "static"), path.join(outDir, "_next", "static"), { recursive: true });
  for (const entry of fs.readdirSync(path.join(root, "public"))) {
    if (entry === "sw.js") continue; // no service worker in the preview
    fs.cpSync(path.join(root, "public", entry), path.join(outDir, entry), { recursive: true });
  }
  fs.writeFileSync(path.join(outDir, ".nojekyll"), ""); // let Pages serve the _next folder
  console.log(`Static preview written to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
