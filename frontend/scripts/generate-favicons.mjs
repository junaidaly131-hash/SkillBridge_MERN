import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "branding", "favicon-source.svg");
const PUBLIC = join(ROOT, "public");

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("Chrome/Chromium was not found. Set CHROME_PATH and run the command again.");
  return chrome;
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Rasterizer did not produce PNG data.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function visiblePixelCount(buffer) {
  let offset = 8;
  let width;
  let height;
  let colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error("Expected an 8-bit RGBA PNG from Chrome.");
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    offset += length + 12;
  }
  if (!width || !height || colorType !== 6) throw new Error("PNG is missing a supported IHDR chunk.");

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let input = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[input++];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[input++];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upLeft)
                : (() => { throw new Error(`Unsupported PNG filter ${filter}.`); })();
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }

  let visible = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible += 1;
  return visible;
}

function renderPng(chrome, source, size, destination) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    "--force-device-scale-factor=1",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1000",
    `--window-size=${size},${size}`,
    `--screenshot=${destination}`,
    pathToFileURL(source).href,
  ];
  const result = spawnSync(chrome, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Chrome exited with status ${result.status}.`);
}

function createIco(images) {
  const headerSize = 6 + images.length * 16;
  const totalSize = headerSize + images.reduce((sum, image) => sum + image.data.length, 0);
  const ico = Buffer.alloc(totalSize);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(images.length, 4);

  let dataOffset = headerSize;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    ico.writeUInt8(image.size === 256 ? 0 : image.size, entry);
    ico.writeUInt8(image.size === 256 ? 0 : image.size, entry + 1);
    ico.writeUInt8(0, entry + 2);
    ico.writeUInt8(0, entry + 3);
    ico.writeUInt16LE(1, entry + 4);
    ico.writeUInt16LE(32, entry + 6);
    ico.writeUInt32LE(image.data.length, entry + 8);
    ico.writeUInt32LE(dataOffset, entry + 12);
    image.data.copy(ico, dataOffset);
    dataOffset += image.data.length;
  });
  return ico;
}

const chrome = findChrome();
const tempDirectory = await mkdtemp(join(tmpdir(), "skillbridge-favicon-"));

try {
  const sourceSvg = await readFile(SOURCE, "utf8");
  const requested = [16, 32, 48, 96, 180];
  for (const size of requested) {
    // Chrome enforces a minimum layout viewport on some platforms even when
    // the screenshot is smaller. Give the SVG an explicit pixel box at 0,0 so
    // it cannot be centered outside a 16/32/48px screenshot crop.
    const renderSource = join(tempDirectory, `render-${size}.html`);
    await writeFile(renderSource, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${sourceSvg}</body></html>`);
    renderPng(chrome, renderSource, size, join(tempDirectory, `${size}.png`));
  }

  const images = new Map();
  for (const size of requested) {
    const data = await readFile(join(tempDirectory, `${size}.png`));
    const dimensions = pngDimensions(data);
    if (dimensions.width !== size || dimensions.height !== size) {
      throw new Error(`Expected ${size}x${size}, received ${dimensions.width}x${dimensions.height}.`);
    }
    const visible = visiblePixelCount(data);
    if (visible < size * size * 0.08) throw new Error(`${size}x${size} raster contains too few visible pixels (${visible}).`);
    images.set(size, data);
  }

  await writeFile(join(PUBLIC, "favicon-96x96.png"), images.get(96));
  await writeFile(join(PUBLIC, "apple-touch-icon.png"), images.get(180));
  await writeFile(
    join(PUBLIC, "favicon.ico"),
    createIco([16, 32, 48].map((size) => ({ size, data: images.get(size) }))),
  );
  console.log("Generated favicon-96x96.png, favicon.ico (16/32/48), and apple-touch-icon.png.");
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
