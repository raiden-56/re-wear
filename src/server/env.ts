import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  OTP_PROVIDER: z.enum(["console", "msg91", "twilio"]).default("console"),
  DEMO_OTP_ENABLED: z.string().optional(),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  WHATSAPP_PROVIDER: z.enum(["console", "meta"]).default("console"),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("ReWear <hello@rewear.example>"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  PAYOUT_PROVIDER: z.enum(["sandbox", "razorpayx"]).default("sandbox"),
  RAZORPAYX_KEY_ID: z.string().optional(),
  RAZORPAYX_KEY_SECRET: z.string().optional(),
  RAZORPAYX_ACCOUNT_NUMBER: z.string().optional(),
  PAYOUT_WEBHOOK_SECRET: z.string().default("dev-webhook-secret"),
  PAYMENT_PROVIDER: z.enum(["sandbox", "razorpay"]).default("sandbox"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().default("dev-payment-webhook-secret"),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default("rewear-private"),
  NEXT_PUBLIC_MAPS_PROVIDER: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().default("dev-cron-secret"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid environment configuration: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_SECRET.startsWith("dev-only")) {
    throw new Error("Refusing to start in production with the development AUTH_SECRET.");
  }
  cached = parsed.data;
  return cached;
}

/** Demo OTP (123456 for seeded accounts) is never available in production. */
export function demoOtpEnabled() {
  const e = env();
  return e.NODE_ENV !== "production" && e.DEMO_OTP_ENABLED === "true";
}
