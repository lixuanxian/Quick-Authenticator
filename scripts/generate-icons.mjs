import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const svgSource = readFileSync(join(root, 'public/icons/icon.svg'), 'utf-8');
const svgBuffer = Buffer.from(svgSource);

// Android foreground variant: white keyhole + deeper green (derived from icon.svg)
const androidSvg = svgSource
  .replace(/#059669/g, '#10b981')   // gradient end → brighter (replace first to avoid chain conflict)
  .replace(/#34d399/g, '#34d399')   // gradient start → keep original bright
  .replace(/fill-opacity="[^"]*"/, 'fill-opacity="0.15"')  // shield fill more visible
  .replace(/fill="#0d1117"/g, 'fill="#ffffff"');             // keyhole → white
const androidSvgBuffer = Buffer.from(androidSvg);

// Ensure directories exist
mkdirSync(join(root, 'src-tauri/icons'), { recursive: true });
mkdirSync(join(root, 'public/icons'), { recursive: true });

const tasks = [
  // PWA icons
  { path: 'public/icons/192.png', size: 192 },
  { path: 'public/icons/512.png', size: 512 },
  // Tauri desktop icons
  { path: 'src-tauri/icons/32x32.png', size: 32 },
  { path: 'src-tauri/icons/128x128.png', size: 128 },
  { path: 'src-tauri/icons/128x128@2x.png', size: 256 },
  { path: 'src-tauri/icons/tray-icon.png', size: 64 },
];

for (const { path: outPath, size } of tasks) {
  const fullPath = join(root, outPath);
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(fullPath);
  console.log(`Generated ${outPath} (${size}x${size})`);
}

// Generate ICO (contains 16, 32, 48, 256)
const icoSizes = [16, 32, 48, 256];
const icoPngs = await Promise.all(
  icoSizes.map(size =>
    sharp(svgBuffer).resize(size, size).png().toBuffer()
  )
);
const icoBuffer = await pngToIco(icoPngs);
writeFileSync(join(root, 'src-tauri/icons/icon.ico'), icoBuffer);
console.log('Generated src-tauri/icons/icon.ico');

// Android mipmap icons
// Density: mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192
const androidBase = 'src-tauri/gen/android/app/src/main/res';
const androidDensities = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

// Adaptive icon foreground: 108dp with icon in center 66% area
// mdpi=108, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432
const foregroundSizes = [
  { dir: 'mipmap-mdpi',    size: 108 },
  { dir: 'mipmap-hdpi',    size: 162 },
  { dir: 'mipmap-xhdpi',   size: 216 },
  { dir: 'mipmap-xxhdpi',  size: 324 },
  { dir: 'mipmap-xxxhdpi', size: 432 },
];

for (const { dir, size } of androidDensities) {
  const outDir = join(root, androidBase, dir);
  mkdirSync(outDir, { recursive: true });

  // ic_launcher & ic_launcher_round — full icon
  const iconBuf = await sharp(androidSvgBuffer).resize(size, size).png().toBuffer();
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    writeFileSync(join(outDir, name), iconBuf);
  }
  console.log(`Generated ${dir}/ic_launcher[_round].png (${size}x${size})`);
}

for (const { dir, size } of foregroundSizes) {
  const outDir = join(root, androidBase, dir);
  // Foreground: icon at 66% centered on transparent canvas
  const innerSize = Math.round(size * 0.66);
  const innerBuf = await sharp(androidSvgBuffer).resize(innerSize, innerSize).png().toBuffer();
  const foreground = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: innerBuf, gravity: 'centre' }])
    .png()
    .toBuffer();
  writeFileSync(join(outDir, 'ic_launcher_foreground.png'), foreground);
  console.log(`Generated ${dir}/ic_launcher_foreground.png (${size}x${size})`);
}

console.log('\nAll icons generated successfully!');
