/**
 * Minimal ZIP reader for locally produced archives (store + deflate-raw).
 * Used by the legacy import converter to offer direct CSV downloads.
 */

function readU16(view, offset) {
  return view.getUint16(offset, true);
}

function readU32(view, offset) {
  return view.getUint32(offset, true);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress ZIP entries.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * @param {Blob|ArrayBuffer} zipBlob
 * @returns {Promise<Record<string, string>>} filename => utf-8 text
 */
export async function unzipTextFiles(zipBlob) {
  const buffer = zipBlob instanceof ArrayBuffer ? zipBlob : await zipBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = {};

  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature = readU32(view, offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const compression = readU16(view, offset + 8);
    const compSize = readU32(view, offset + 18);
    const nameLen = readU16(view, offset + 26);
    const extraLen = readU16(view, offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + compSize;

    if (dataEnd > bytes.length) {
      throw new Error("ZIP file is truncated or corrupt.");
    }

    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd));
    const payload = bytes.subarray(dataStart, dataEnd);

    let raw;
    if (compression === 0) {
      raw = payload;
    } else if (compression === 8) {
      raw = await inflateRaw(payload);
    } else {
      throw new Error(`Unsupported ZIP compression method (${compression}) for ${name}.`);
    }

    files[name] = new TextDecoder().decode(raw);
    offset = dataEnd;
  }

  if (Object.keys(files).length === 0) {
    throw new Error("No files found in ZIP archive.");
  }

  return files;
}
