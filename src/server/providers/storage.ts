import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { env } from "../env";
import { randomToken } from "../domain/codes";
import { AppError } from "../domain/errors";

/**
 * Private object storage. Files are never served from /public — they are streamed through
 * an authenticated route (/api/files/[...key]) that checks ownership or staff permission.
 */
const MAX_BYTES = 8 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
];

/** Sniff the real content type from magic bytes — the client-declared MIME type is not trusted. */
export function detectImageType(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf)) ?? null;
}

const localRoot = () => path.join(process.cwd(), ".data", "uploads");

export async function storeUpload(file: File, ownerId: string, purpose: string) {
  if (file.size === 0) throw new AppError("VALIDATION", "The file is empty.");
  if (file.size > MAX_BYTES) throw new AppError("VALIDATION", "Images must be smaller than 8 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectImageType(buf);
  if (!kind) throw new AppError("VALIDATION", "Only JPEG, PNG or WebP images are allowed.");
  const key = `${purpose.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomToken(18)}.${kind.ext}`;

  const e = env();
  if (e.STORAGE_DRIVER === "supabase") {
    if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) throw new AppError("PROVIDER_ERROR", "Storage is not configured");
    const res = await fetch(`${e.SUPABASE_URL}/storage/v1/object/${e.SUPABASE_BUCKET}/${key}`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": kind.type, "x-upsert": "false" },
      body: buf,
    });
    if (!res.ok) throw new AppError("PROVIDER_ERROR", "Upload failed");
  } else {
    const full = path.join(localRoot(), key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
  }
  await db.storedFile.create({ data: { key, ownerId, contentType: kind.type, sizeBytes: buf.length, purpose } });
  return key;
}

export async function readStoredFile(key: string): Promise<{ body: Buffer; contentType: string }> {
  if (key.includes("..")) throw new AppError("VALIDATION", "Invalid key");
  const meta = await db.storedFile.findUnique({ where: { key } });
  if (!meta) throw new AppError("NOT_FOUND", "File not found");
  const e = env();
  if (e.STORAGE_DRIVER === "supabase") {
    const res = await fetch(`${e.SUPABASE_URL}/storage/v1/object/authenticated/${e.SUPABASE_BUCKET}/${key}`, {
      headers: { authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new AppError("NOT_FOUND", "File not found");
    return { body: Buffer.from(await res.arrayBuffer()), contentType: meta.contentType };
  }
  return { body: await readFile(path.join(localRoot(), key)), contentType: meta.contentType };
}

export const fileUrl = (key: string) => `/api/files/${key}`;
