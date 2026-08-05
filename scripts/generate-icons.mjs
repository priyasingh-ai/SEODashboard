/**
 * Rasterises `app/icon.svg` into the fallback icons Next.js can't derive itself.
 *
 * Why this exists: Safari only gained `<link rel="icon" type="image/svg+xml">`
 * support in version 26, so roughly a tenth of real traffic — Safari and every
 * iOS browser below that — falls back to `favicon.ico`. Without one they show a
 * blank default mark.
 *
 * Run after editing `app/icon.svg`:
 *
 *   npm install --no-save sharp && node scripts/generate-icons.mjs
 *
 * `sharp` is deliberately NOT a project dependency. This runs by hand on the
 * rare occasion the logo changes; the generated files are committed. Nobody
 * should pay a ~30MB native install on every `npm install` for that.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(join(root, "app/icon.svg"));

const png = (size, input = svg) =>
  sharp(input, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/**
 * Pack PNGs into an ICO container.
 *
 * ICO is a directory format: a 6-byte header, then one 16-byte entry per image,
 * then the payloads. Every Windows/Safari version that matters reads PNG-in-ICO
 * (Vista+), so there's no need for the legacy BMP encoding.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 encodes 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

// favicon.ico — 16/32/48, the sizes browsers and Windows actually request.
const ico = buildIco(
  await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(size) }))),
);
await writeFile(join(root, "app/favicon.ico"), ico);

/**
 * apple-icon: iOS applies its own corner mask and composites on an unknown
 * background, so this variant is full-bleed and square — our own rounded corners
 * would get clipped a second time and the transparent margin would go white.
 */
const appleSvg = Buffer.from(
  svg
    .toString()
    .replace('rx="7"', 'rx="0"')
    .replace('viewBox="0 0 32 32" width="32" height="32"', 'viewBox="0 0 32 32" width="180" height="180"'),
);
await writeFile(join(root, "app/apple-icon.png"), await png(180, appleSvg));

console.log("wrote app/favicon.ico (16/32/48) and app/apple-icon.png (180)");
