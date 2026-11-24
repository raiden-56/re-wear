import { execSync } from "node:child_process";
import { config } from "dotenv";

/** Apply migrations to the dedicated test database (never the development database). */
export default function setup() {
  config({ path: ".env" });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL not set — integration tests will be skipped.");
    return;
  }
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
