// Makes small PNG images for the image diff tests, without dependencies.

const zlib = require("node:zlib");

// An image of one color. A color is [r, g, b, a].
function solid(width, height, color) {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
  return { width, height, pixels };
}

// A copy of the image with other colors at the given points.
function withPixels(image, points) {
  const pixels = new Uint8Array(image.pixels);
  for (const [x, y, color] of points) pixels.set(color, (y * image.width + x) * 4);
  return { ...image, pixels };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

// The image as PNG bytes: 8-bit RGBA, no filters.
function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rowLength = width * 4;
  const raw = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * rowLength, (y + 1) * rowLength), y * (rowLength + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { solid, withPixels, encodePng };
