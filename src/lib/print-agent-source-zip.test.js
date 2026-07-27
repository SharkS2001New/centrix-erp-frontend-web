import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { zipDirectoryStore } from "@/lib/print-agent-source-zip";

describe("zipDirectoryStore", () => {
  it("packages nested files into a zip buffer", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "centrix-print-src-"));
    try {
      await mkdir(path.join(root, "scripts"), { recursive: true });
      await writeFile(path.join(root, "BUILD.md"), "# Build\n", "utf8");
      await writeFile(path.join(root, "scripts", "publish.ps1"), "Write-Host ok\n", "utf8");
      await mkdir(path.join(root, "publish"), { recursive: true });
      await writeFile(path.join(root, "publish", "skip.bin"), "nope", "utf8");

      const zip = await zipDirectoryStore(root, "print-agent-dotnet");
      expect(Buffer.isBuffer(zip)).toBe(true);
      expect(zip.length).toBeGreaterThan(100);
      // Local file header signature
      expect(zip.readUInt32LE(0)).toBe(0x04034b50);
      const asText = zip.toString("binary");
      expect(asText).toContain("print-agent-dotnet/BUILD.md");
      expect(asText).toContain("print-agent-dotnet/scripts/publish.ps1");
      expect(asText).not.toContain("skip.bin");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
