import { db } from "../db";
import { demoOtpEnabled, env } from "../env";
import { hmacSha256, numericCode, safeEqual } from "../domain/codes";
import { AppError } from "../domain/errors";
import { enforceRateLimit } from "../rate-limit";
import { sendSms } from "../providers/messaging";

const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;
export const DEMO_OTP = "123456";

/** Normalise Indian mobile numbers to E.164 (+91XXXXXXXXXX). */
export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw new AppError("VALIDATION", "Enter a valid 10-digit Indian mobile number.");
  return `+91${local}`;
}

const hashOtp = (phone: string, purpose: string, code: string) => hmacSha256(env().AUTH_SECRET, `${purpose}:${phone}:${code}`);

/** Seeded demo accounts can sign in with 123456 outside production. */
async function isDemoAccount(phone: string) {
  if (!demoOtpEnabled()) return false;
  const u = await db.user.findUnique({ where: { phone }, select: { id: true } });
  return !!u && phone.startsWith("+9190000");
}

export async function requestOtp(rawPhone: string, ip: string, purpose = "LOGIN") {
  const phone = normalizePhone(rawPhone);
  await enforceRateLimit(`otp:phone:${phone}`, 5, 15 * 60, "Too many OTP requests for this number. Try again in 15 minutes.");
  await enforceRateLimit(`otp:ip:${ip}`, 20, 15 * 60, "Too many OTP requests from your network. Try again later.");

  const demo = await isDemoAccount(phone);
  const code = demo ? DEMO_OTP : numericCode(6);
  await db.otpChallenge.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  await db.otpChallenge.create({
    data: { phone, purpose, codeHash: hashOtp(phone, purpose, code), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000), ip },
  });
  if (!demo) {
    await sendSms(phone, `${code} is your ReWear verification code. It expires in 5 minutes. Never share it with anyone.`, { otp: code });
  }
  return { phone, expiresInSeconds: OTP_TTL_SECONDS, demo };
}

export async function verifyOtp(rawPhone: string, code: string, purpose = "LOGIN") {
  const phone = normalizePhone(rawPhone);
  if (!/^\d{4,6}$/.test(code)) throw new AppError("VALIDATION", "Enter the code we sent you.");
  const challenge = await db.otpChallenge.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt < new Date()) throw new AppError("VALIDATION", "This code has expired. Request a new one.");
  if (challenge.attempts >= MAX_ATTEMPTS) throw new AppError("RATE_LIMITED", "Too many incorrect attempts. Request a new code.");

  const ok = safeEqual(challenge.codeHash, hashOtp(phone, purpose, code));
  if (!ok) {
    await db.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new AppError("VALIDATION", "That code is incorrect.");
  }
  // Atomic consume — a code can only ever be used once.
  const consumed = await db.otpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new AppError("VALIDATION", "This code has already been used.");
  return phone;
}
