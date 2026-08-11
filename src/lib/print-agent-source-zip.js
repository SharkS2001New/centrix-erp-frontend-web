/**
 * Minimal ZIP writer (store / no compression) for packaging the print-agent source.
 * Avoids extra npm dependencies so this works in any Node runtime.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SKIP_DIR_NAMES = new Set([
  "bin",
  "obj",
  "publish",
  "node_modules",
  ".git",
  ".vs",
  ".idea",
]);

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

async function collectFiles(rootDir, relative = "", skipFiles = new Set()) {
  const abs = path.join(rootDir, relative);
  const entries = await readdir(abs, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;

    const rel = relative ? path.join(relative, entry.name) : entry.name;
    const relPosix = rel.split(path.sep).join("/");
    if (skipFiles.has(entry.name) || skipFiles.has(relPosix)) continue;

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, rel, skipFiles)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }

  return files;
}

function appendZipEntry(localParts, centralParts, offsetRef, { name, data, dosTime, dosDate }) {
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const size = data.length;

  const localHeader = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(0),
    u16(dosTime),
    u16(dosDate),
    u32(crc),
    u32(size),
    u32(size),
    u16(nameBuf.length),
    u16(0),
    nameBuf,
  ]);

  const centralHeader = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(0),
    u16(dosTime),
    u16(dosDate),
    u32(crc),
    u32(size),
    u32(size),
    u16(nameBuf.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(offsetRef.value),
    nameBuf,
  ]);

  localParts.push(localHeader, data);
  centralParts.push(centralHeader);
  offsetRef.value += localHeader.length + data.length;
}

/**
 * @param {string} rootDir absolute path to folder to package
 * @param {string} zipRootName folder name inside the zip
 * @param {{ skipFiles?: string[], extraFiles?: { name: string, content: string | Buffer }[] }} [options]
 * @returns {Promise<Buffer>}
 */
export async function zipDirectoryStore(rootDir, zipRootName = "print-agent-dotnet", options = {}) {
  const skipFiles = new Set(options.skipFiles ?? []);
  const extraFiles = options.extraFiles ?? [];
  const files = await collectFiles(rootDir, "", skipFiles);
  if (files.length === 0 && extraFiles.length === 0) {
    throw new Error("No source files found to package.");
  }

  const localParts = [];
  const centralParts = [];
  const offsetRef = { value: 0 };
  const { dosTime, dosDate } = dosDateTime();
  let entryCount = 0;

  for (const rel of files) {
    const data = await readFile(path.join(rootDir, rel));
    const name = `${zipRootName}/${rel.split(path.sep).join("/")}`;
    appendZipEntry(localParts, centralParts, offsetRef, { name, data, dosTime, dosDate });
    entryCount += 1;
  }

  for (const extra of extraFiles) {
    const rel = String(extra.name || "").replace(/^\/+/, "").split(path.sep).join("/");
    if (!rel) continue;
    const data = Buffer.isBuffer(extra.content)
      ? extra.content
      : Buffer.from(String(extra.content ?? ""), "utf8");
    const name = `${zipRootName}/${rel}`;
    appendZipEntry(localParts, centralParts, offsetRef, { name, data, dosTime, dosDate });
    entryCount += 1;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entryCount),
    u16(entryCount),
    u32(central.length),
    u32(offsetRef.value),
    u16(0),
  ]);

  return Buffer.concat([...localParts, central, end]);
}

export async function ensureSourceRootExists(rootDir) {
  const stats = await stat(rootDir);
  if (!stats.isDirectory()) {
    throw new Error("print-agent-dotnet folder missing on this server.");
  }
}
