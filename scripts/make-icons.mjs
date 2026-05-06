import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const iconDir = path.join(process.cwd(), "public", "icons");
const faviconPath = path.join(process.cwd(), "public", "favicon.ico");

function iconSvg(size, safeZone = 0) {
  const fontSize = Math.round(size * (safeZone > 0 ? 0.48 : 0.62));
  return Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#0a0a0a"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800">B</text>
    </svg>
  `);
}

function icoFromPng(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);
  entry.writeUInt8(32, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

async function makePng(filename, size, safeZone = 0) {
  const png = await sharp(iconSvg(size, safeZone)).png().toBuffer();
  await writeFile(path.join(iconDir, filename), png);
  return png;
}

await mkdir(iconDir, { recursive: true });
await makePng("icon-192.png", 192);
await makePng("icon-512.png", 512);
await makePng("icon-maskable-512.png", 512, 0.2);
await makePng("apple-touch-icon.png", 180);
const faviconPng = await sharp(iconSvg(32)).png().toBuffer();
await writeFile(faviconPath, icoFromPng(faviconPng));

console.log("Generated Billy PWA icons.");
