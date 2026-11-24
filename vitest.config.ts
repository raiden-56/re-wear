import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env" });
const testDb = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false, // integration tests share one database
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDb ?? "",
      AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      OTP_PROVIDER: "console",
      DEMO_OTP_ENABLED: "false",
      PAYOUT_PROVIDER: "sandbox",
      PAYMENT_PROVIDER: "sandbox",
      PAYOUT_WEBHOOK_SECRET: "test-webhook-secret",
      PAYMENT_WEBHOOK_SECRET: "test-payment-secret",
      STORAGE_DRIVER: "local",
    },
  },
});
