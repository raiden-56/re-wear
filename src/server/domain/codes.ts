import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

export function randomCode(length: number) {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** e.g. RW-K7Q2-9XPF */
export function humanCode(prefix: string) {
  return `${prefix}-${randomCode(4)}-${randomCode(4)}`;
}

export function numericCode(digits: number) {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function hmacSha256(secret: string, payload: string | Buffer) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
