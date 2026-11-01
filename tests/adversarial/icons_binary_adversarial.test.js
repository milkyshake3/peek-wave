/**
 * icons_binary_adversarial.test.js
 * 
 * Empirical Binary Verification Suite for Peek Wave Icon Assets (16x16, 32x32, 48x48, 128x128).
 * 
 * Verifies:
 * 1. 8-byte PNG magic header byte-by-byte (RFC 2083 standard).
 * 2. Complete chunk-level stream dissection (Length, Type, Data, CRC-32).
 * 3. Independent IEEE 802.3 CRC-32 calculation & comparison for all chunks (IHDR, IDAT, IEND, etc.).
 * 4. IHDR specification adherence: 8-bit depth, Color type 6 (RGBA), compression 0, filter 0, interlace 0.
 * 5. Dimension verification across all sizes: 16x16, 32x32, 48x48, 128x128.
 * 6. Deflate stream decompression via zlib with exact uncompressed scanline byte count assertion.
 * 7. RFC 2083 scanline defiltering (types 0-4) to reconstruct exact RGBA pixel matrix.
 * 8. Alpha channel & visual asset integrity analysis:
 *    - Full-bleed background opacity (corner pixels matching authentic new icon characteristics).
 *    - Center pixel opacity (alpha > 0 / solid brand mark core).
 *    - Antialiased boundary/resampling pixels (0 <= alpha <= 255).
 *    - High opacity dynamic range (max alpha = 255).
 * 9. IEND chunk validation: length 0, CRC 0xAE426082, and zero trailing garbage bytes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

// IEEE 802.3 CRC-32 Table
let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c;
  }
  return crcTable;
}

/**
 * Calculates standard IEEE 802.3 CRC-32 checksum.
 * @param {Buffer} buf 
 * @returns {number} Unsigned 32-bit integer
 */
function computeCrc32(buf) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Standard PNG Paeth Predictor function (RFC 2083 Section 6.6)
 */
function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Defilters uncompressed PNG scanlines into raw RGBA pixel buffer.
 * @param {Buffer} scanlinesBuffer 
 * @param {number} width 
 * @param {number} height 
 * @param {number} bpp Bytes per pixel (4 for RGBA)
 * @returns {Buffer}
 */
function defilterPngScanlines(scanlinesBuffer, width, height, bpp = 4) {
  const scanlineLength = 1 + width * bpp;
  const rawPixels = Buffer.alloc(width * height * bpp);

  let priorRowOffset = -1;

  for (let y = 0; y < height; y++) {
    const srcOffset = y * scanlineLength;
    const filterType = scanlinesBuffer[srcOffset];
    const dstOffset = y * width * bpp;

    for (let x = 0; x < width * bpp; x++) {
      const rawByte = scanlinesBuffer[srcOffset + 1 + x];
      const a = x >= bpp ? rawPixels[dstOffset + x - bpp] : 0; // Left
      const b = priorRowOffset >= 0 ? rawPixels[priorRowOffset + x] : 0; // Above
      const c = (priorRowOffset >= 0 && x >= bpp) ? rawPixels[priorRowOffset + x - bpp] : 0; // Above-left

      let reconstructedByte;
      switch (filterType) {
        case 0: // None
          reconstructedByte = rawByte;
          break;
        case 1: // Sub
          reconstructedByte = (rawByte + a) & 0xff;
          break;
        case 2: // Up
          reconstructedByte = (rawByte + b) & 0xff;
          break;
        case 3: // Average
          reconstructedByte = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4: // Paeth
          reconstructedByte = (rawByte + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`Unknown PNG filter type ${filterType} at scanline ${y}`);
      }

      rawPixels[dstOffset + x] = reconstructedByte;
    }

    priorRowOffset = dstOffset;
  }

  return rawPixels;
}

/**
 * Comprehensive Binary Inspection of a PNG icon file.
 */
function inspectPngBinary(filePath, expectedDimension) {
  const fileBytes = fs.readFileSync(filePath);
  const results = {
    filePath,
    fileSize: fileBytes.length,
    chunks: [],
    validSignature: false,
    ihdr: null,
    alphaStats: null,
    errors: []
  };

  // 1. Check Magic Header (8 bytes)
  const EXPECTED_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (fileBytes.length < 8) {
    results.errors.push('File length less than 8 bytes');
    return results;
  }

  const actualSig = fileBytes.subarray(0, 8);
  results.validSignature = actualSig.equals(EXPECTED_SIG);
  if (!results.validSignature) {
    results.errors.push(`Invalid PNG magic signature: got ${actualSig.toString('hex')}, expected ${EXPECTED_SIG.toString('hex')}`);
    return results;
  }

  // 2. Dissect all chunks
  let offset = 8;
  const idatChunks = [];

  while (offset < fileBytes.length) {
    if (offset + 8 > fileBytes.length) {
      results.errors.push(`Incomplete chunk header at offset ${offset}`);
      break;
    }

    const chunkLen = fileBytes.readUInt32BE(offset);
    const chunkType = fileBytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLen;

    if (dataEnd + 4 > fileBytes.length) {
      results.errors.push(`Chunk data or CRC overflows file buffer (type=${chunkType}, len=${chunkLen})`);
      break;
    }

    const chunkData = fileBytes.subarray(dataStart, dataEnd);
    const storedCrc = fileBytes.readUInt32BE(dataEnd);

    // Compute CRC over Type + Data
    const crcPayload = fileBytes.subarray(offset + 4, dataEnd);
    const computedCrc = computeCrc32(crcPayload);

    const crcMatches = computedCrc === storedCrc;
    if (!crcMatches) {
      results.errors.push(`CRC mismatch in ${chunkType} chunk at offset ${offset}: stored 0x${storedCrc.toString(16)}, computed 0x${computedCrc.toString(16)}`);
    }

    results.chunks.push({
      type: chunkType,
      offset,
      length: chunkLen,
      storedCrc: `0x${storedCrc.toString(16).toUpperCase()}`,
      computedCrc: `0x${computedCrc.toString(16).toUpperCase()}`,
      crcValid: crcMatches
    });

    if (chunkType === 'IHDR') {
      if (chunkLen !== 13) {
        results.errors.push(`IHDR length must be exactly 13 bytes, got ${chunkLen}`);
      } else {
        results.ihdr = {
          width: chunkData.readUInt32BE(0),
          height: chunkData.readUInt32BE(4),
          bitDepth: chunkData.readUInt8(8),
          colorType: chunkData.readUInt8(9),
          compression: chunkData.readUInt8(10),
          filter: chunkData.readUInt8(11),
          interlace: chunkData.readUInt8(12)
        };
      }
    } else if (chunkType === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (chunkType === 'IEND') {
      if (chunkLen !== 0) {
        results.errors.push(`IEND chunk length must be 0, got ${chunkLen}`);
      }
      if (dataEnd + 4 !== fileBytes.length) {
        results.errors.push(`Trailing data found after IEND chunk: ${fileBytes.length - (dataEnd + 4)} extra bytes`);
      }
    }

    offset = dataEnd + 4;
  }

  // 3. Validate IHDR parameters
  if (results.ihdr) {
    const { width, height, bitDepth, colorType, compression, filter, interlace } = results.ihdr;
    if (width !== expectedDimension || height !== expectedDimension) {
      results.errors.push(`Dimension mismatch: expected ${expectedDimension}x${expectedDimension}, got ${width}x${height}`);
    }
    if (bitDepth !== 8) {
      results.errors.push(`Expected 8-bit channel depth, got ${bitDepth}`);
    }
    if (colorType !== 6) { // RGBA Truecolor with alpha
      results.errors.push(`Expected Color Type 6 (RGBA Truecolor with alpha), got ${colorType}`);
    }
    if (compression !== 0) {
      results.errors.push(`Expected compression method 0 (deflate), got ${compression}`);
    }
    if (filter !== 0) {
      results.errors.push(`Expected filter method 0 (adaptive), got ${filter}`);
    }
    if (interlace !== 0) {
      results.errors.push(`Expected interlace 0 (non-interlaced), got ${interlace}`);
    }
  } else {
    results.errors.push('Missing required IHDR chunk');
  }

  // 4. Validate and Decompress IDAT Stream
  if (idatChunks.length === 0) {
    results.errors.push('Missing IDAT image data chunk(s)');
  } else {
    const combinedIdat = Buffer.concat(idatChunks);
    let decompressed;
    try {
      decompressed = zlib.inflateSync(combinedIdat);
    } catch (err) {
      results.errors.push(`zlib inflate failed: ${err.message}`);
    }

    if (decompressed && results.ihdr) {
      const W = results.ihdr.width;
      const H = results.ihdr.height;
      const expectedScanlineBytes = H * (1 + W * 4);

      if (decompressed.length !== expectedScanlineBytes) {
        results.errors.push(`Decompressed scanline size mismatch: expected ${expectedScanlineBytes} bytes, got ${decompressed.length}`);
      } else {
        // Defilter and inspect alpha channel
        try {
          const rawPixels = defilterPngScanlines(decompressed, W, H, 4);

          let minAlpha = 255;
          let maxAlpha = 0;
          let transparentPixels = 0;
          let translucentPixels = 0;
          let opaquePixels = 0;

          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const alpha = rawPixels[(y * W + x) * 4 + 3];
              if (alpha < minAlpha) minAlpha = alpha;
              if (alpha > maxAlpha) maxAlpha = alpha;

              if (alpha === 0) transparentPixels++;
              else if (alpha === 255) opaquePixels++;
              else translucentPixels++;
            }
          }

          // Corner pixels test: top-left (0,0), top-right (W-1,0), bottom-left (0,H-1), bottom-right (W-1,H-1)
          const cornerAlphaTL = rawPixels[3];
          const cornerAlphaTR = rawPixels[(W - 1) * 4 + 3];
          const cornerAlphaBL = rawPixels[((H - 1) * W) * 4 + 3];
          const cornerAlphaBR = rawPixels[((H - 1) * W + (W - 1)) * 4 + 3];

          // Center pixel test
          const midX = Math.floor(W / 2);
          const midY = Math.floor(H / 2);
          const centerAlpha = rawPixels[(midY * W + midX) * 4 + 3];

          results.alphaStats = {
            totalPixels: W * H,
            minAlpha,
            maxAlpha,
            transparentPixels,
            translucentPixels,
            opaquePixels,
            cornerAlphaTL,
            cornerAlphaTR,
            cornerAlphaBL,
            cornerAlphaBR,
            centerAlpha
          };

          // Assertions on alpha and visual asset integrity
          if (minAlpha < 0 || minAlpha > 255) {
            results.errors.push(`Alpha channel minimum out of 8-bit bounds [0, 255]: ${minAlpha}`);
          }
          if (maxAlpha !== 255) {
            results.errors.push(`Expected fully opaque pixels with alpha=255, but maxAlpha is ${maxAlpha}`);
          }
          if (opaquePixels === 0) {
            results.errors.push('No opaque foreground pixels found');
          }
          if (transparentPixels + translucentPixels + opaquePixels !== W * H) {
            results.errors.push(`Pixel count mismatch: ${transparentPixels} transparent + ${translucentPixels} translucent + ${opaquePixels} opaque !== ${W * H} total`);
          }
          // Authentic icon validation: full-bleed background without obsolete squircle corner cutouts
          if (cornerAlphaTL < 180 || cornerAlphaTR < 180 || cornerAlphaBL < 180 || cornerAlphaBR < 180) {
            results.errors.push(`Corner pixels lack authentic full-bleed opacity: TL=${cornerAlphaTL}, TR=${cornerAlphaTR}, BL=${cornerAlphaBL}, BR=${cornerAlphaBR}`);
          }
          if (centerAlpha === 0) {
            results.errors.push(`Center pixel (midpoint) is completely transparent (missing icon core visual)`);
          }
        } catch (filterErr) {
          results.errors.push(`Scanline defiltering failed: ${filterErr.message}`);
        }
      }
    }
  }

  return results;
}

// ============================================================================
// Runner
// ============================================================================

function runAdversarialIconTests() {
  console.log('\n===============================================================');
  console.log('   CHALLENGER TEST SUITE: ICONS BINARY ADVERSARIAL VALIDATION  ');
  console.log('===============================================================\n');

  const iconsDir = path.resolve(__dirname, '../../icons');
  const targetIcons = [
    { name: 'icon16.png', size: 16 },
    { name: 'icon32.png', size: 32 },
    { name: 'icon48.png', size: 48 },
    { name: 'icon128.png', size: 128 }
  ];

  let totalPass = 0;
  let totalFail = 0;
  const overallResults = [];

  for (const { name, size } of targetIcons) {
    const iconPath = path.join(iconsDir, name);
    console.log(`Inspecting ${name} (${size}x${size})...`);

    if (!fs.existsSync(iconPath)) {
      console.error(`  [FAIL] Missing file: ${iconPath}`);
      totalFail++;
      overallResults.push({ name, size, passed: false, errors: ['File does not exist'] });
      continue;
    }

    const report = inspectPngBinary(iconPath, size);

    if (report.errors.length > 0) {
      console.error(`  [FAIL] ${name} failed binary verification:`);
      report.errors.forEach(e => console.error(`    - ${e}`));
      totalFail++;
      overallResults.push({ name, size, passed: false, report });
    } else {
      console.log(`  [PASS] 8-Byte Magic Header verified`);
      console.log(`  [PASS] IHDR verified: ${report.ihdr.width}x${report.ihdr.height}, 8-bit RGBA (ColorType=6)`);
      console.log(`  [PASS] Chunk CRC checksums verified:`);
      report.chunks.forEach(c => {
        console.log(`         • ${c.type} (${c.length} bytes): Stored=${c.storedCrc}, Computed=${c.computedCrc} [CRC-OK]`);
      });
      console.log(`  [PASS] Decompressed & Defiltered Scanlines verified`);
      console.log(`  [PASS] Alpha channel verified:`);
      console.log(`         • Min Alpha: ${report.alphaStats.minAlpha}, Max Alpha: ${report.alphaStats.maxAlpha}`);
      console.log(`         • Transparent: ${report.alphaStats.transparentPixels}, Translucent: ${report.alphaStats.translucentPixels}, Opaque: ${report.alphaStats.opaquePixels}`);
      console.log(`         • Corners (TL/TR/BL/BR): ${report.alphaStats.cornerAlphaTL}/${report.alphaStats.cornerAlphaTR}/${report.alphaStats.cornerAlphaBL}/${report.alphaStats.cornerAlphaBR} (Authentic Full-Bleed Opacity)`);
      console.log(`         • Center Alpha: ${report.alphaStats.centerAlpha} (Solid Icon Core)`);
      console.log(`  [PASS] No trailing data after IEND (Zero garbage bytes)\n`);
      totalPass++;
      overallResults.push({ name, size, passed: true, report });
    }
  }

  // Also verify master SVG
  const svgPath = path.join(iconsDir, 'icon.svg');
  if (fs.existsSync(svgPath)) {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    if (svgContent.includes('<svg') && svgContent.includes('</svg>') && svgContent.includes('viewBox="0 0 128 128"')) {
      console.log(`[PASS] Master SVG asset valid (icon.svg: ${svgContent.length} bytes)\n`);
      totalPass++;
    } else {
      console.error(`[FAIL] Master SVG asset invalid\n`);
      totalFail++;
    }
  } else {
    console.error(`[FAIL] Master SVG asset missing: ${svgPath}\n`);
    totalFail++;
  }

  console.log('---------------------------------------------------------------');
  console.log(`Icon Binary Verification Results: ${totalPass} Passed, ${totalFail} Failed`);
  console.log('---------------------------------------------------------------\n');

  return { totalPass, totalFail, overallResults };
}

if (require.main === module) {
  const { totalFail } = runAdversarialIconTests();
  process.exit(totalFail > 0 ? 1 : 0);
}

module.exports = { runAdversarialIconTests, inspectPngBinary, defilterPngScanlines, computeCrc32 };
