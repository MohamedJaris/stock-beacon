const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createSolidPng(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = width * 3 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 3;
      // Draw a clean Royal Blue inner square inside Deep Navy border
      const inBox =
        x > width * 0.22 &&
        x < width * 0.78 &&
        y > height * 0.22 &&
        y < height * 0.78;
      raw[px] = inBox ? 37 : r;
      raw[px + 1] = inBox ? 99 : g;
      raw[px + 2] = inBox ? 235 : b;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend),
  ]);
}

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const iconPng = createSolidPng(512, 512, 15, 23, 42);
fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconPng);
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), iconPng);
fs.writeFileSync(path.join(assetsDir, 'splash-icon.png'), iconPng);
fs.writeFileSync(path.join(assetsDir, 'favicon.png'), createSolidPng(64, 64, 15, 23, 42));
console.log('Generated valid PNG assets in ./assets');
