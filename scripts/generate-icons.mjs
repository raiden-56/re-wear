// Generates PWA icons from the ReWear mark. Run: npm run icons
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const mark = (size, padding = 0, rounded = true) => {
  const inner = size - padding * 2;
  const s = inner / 40;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" ${rounded ? `rx="${size * 0.22}"` : ""} fill="#174B37"/>
  <g transform="translate(${padding} ${padding}) scale(${s})">
    <path d="M20 12.5a3 3 0 1 1 3 3c-1.1 0-3 .7-3 2.6v1.2" fill="none" stroke="#E9B96E" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M20 19.3 9.5 26.2c-.9.6-.5 2 .6 2h19.8c1.1 0 1.5-1.4.6-2L20 19.3Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
  </g></svg>`);
};

mkdirSync("public/icons", { recursive: true });
await sharp(mark(192, 8)).png().toFile("public/icons/icon-192.png");
await sharp(mark(512, 24)).png().toFile("public/icons/icon-512.png");
await sharp(mark(512, 110, false)).png().toFile("public/icons/maskable-512.png");
await sharp(mark(180, 10, false)).png().toFile("public/icons/apple-touch-icon.png");
await sharp(mark(64, 2)).png().toFile("src/app/icon.png");
console.log("Icons generated.");
