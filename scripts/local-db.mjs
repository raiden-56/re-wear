#!/usr/bin/env node
/**
 * Local development database helper.
 *
 * Creates and runs an isolated PostgreSQL cluster inside `.data/postgres`
 * (port 5433 by default) using the PostgreSQL binaries already installed on the
 * machine. It never touches any other cluster on the machine.
 *
 *   node scripts/local-db.mjs start   # initialise (first run) + start
 *   node scripts/local-db.mjs stop
 *   node scripts/local-db.mjs status
 *
 * Alternative: `docker compose up -d db` (see docker-compose.yml).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const dataDir = path.join(root, ".data", "postgres");
const logFile = path.join(root, ".data", "postgres.log");
const port = process.env.LOCAL_PG_PORT ?? "5433";
const user = "rewear";
const password = "rewear_local_dev";

function findBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const candidates = [];
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\PostgreSQL";
    if (existsSync(base)) {
      for (const v of readdirSync(base).sort((a, b) => Number(b) - Number(a))) candidates.push(path.join(base, v, "bin"));
    }
  } else {
    for (const v of ["18", "17", "16", "15"]) {
      candidates.push(`/usr/lib/postgresql/${v}/bin`, `/opt/homebrew/opt/postgresql@${v}/bin`, `/usr/local/opt/postgresql@${v}/bin`);
    }
  }
  const exe = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
  const found = candidates.find((c) => existsSync(path.join(c, exe)));
  if (!found) throw new Error("PostgreSQL binaries not found. Set PG_BIN or use docker compose.");
  return found;
}

const bin = findBin();
const tool = (name) => path.join(bin, process.platform === "win32" ? `${name}.exe` : name);

function init() {
  if (existsSync(path.join(dataDir, "PG_VERSION"))) return;
  mkdirSync(dataDir, { recursive: true });
  const pwFile = path.join(root, ".data", "pw.tmp");
  writeFileSync(pwFile, password);
  try {
    execFileSync(tool("initdb"), ["-D", dataDir, "-U", user, "--pwfile", pwFile, "--auth=scram-sha-256", "-E", "UTF8", "--locale=C"], { stdio: "inherit" });
  } finally {
    rmSync(pwFile, { force: true });
  }
}

function running() {
  const r = spawnSync(tool("pg_ctl"), ["-D", dataDir, "status"], { encoding: "utf8" });
  return r.status === 0;
}

function start() {
  init();
  if (!running()) {
    execFileSync(tool("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-p ${port} -c listen_addresses=127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  }
  const env = { ...process.env, PGPASSWORD: password };
  for (const db of ["rewear", "rewear_test"]) {
    const exists = spawnSync(tool("psql"), ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${db}'`], { env, encoding: "utf8" });
    if (!exists.stdout?.includes("1")) execFileSync(tool("createdb"), ["-h", "127.0.0.1", "-p", port, "-U", user, db], { env, stdio: "inherit" });
  }
  console.log(`\nLocal Postgres ready:\n  DATABASE_URL="postgresql://${user}:${password}@127.0.0.1:${port}/rewear"\n  TEST_DATABASE_URL="postgresql://${user}:${password}@127.0.0.1:${port}/rewear_test"`);
}

const cmd = process.argv[2] ?? "start";
if (cmd === "start") start();
else if (cmd === "stop") execFileSync(tool("pg_ctl"), ["-D", dataDir, "-m", "fast", "stop"], { stdio: "inherit" });
else if (cmd === "status") console.log(running() ? "running" : "stopped");
else console.error("Usage: local-db.mjs start|stop|status");
